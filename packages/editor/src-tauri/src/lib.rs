//! Questforge's native side: file I/O confined to the open project
//! folder, folder watching, the recent-projects file, and saving a built game where
//! the user picks. Native dialogs come from tauri-plugin-dialog. All project
//! logic lives in TypeScript.

use notify::{RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::ipc::{Channel, InvokeBody, Request};
use specta_typescript::Typescript;
use tauri::{Manager, State};
use tauri_specta::{collect_commands, Builder};

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// `root` joined with a project-relative `/` path; refuses anything that escapes it.
fn resolve(root: &str, rel: &str) -> Res<PathBuf> {
    let root = PathBuf::from(root);
    if !root.is_absolute() {
        return Err(format!("Project folder must be an absolute path: {}", root.display()));
    }
    let mut out = root.clone();
    for part in Path::new(rel).components() {
        match part {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            _ => return Err(format!("Path escapes the project: {rel}")),
        }
    }
    Ok(out)
}

fn rel_of(root: &Path, p: &Path) -> Option<String> {
    let rel = p.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel.components().filter_map(|c| match c {
        Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
        _ => None,
    }).collect();
    Some(parts.join("/"))
}

/// Every non-hidden file (or folder) under `root`, as sorted relative paths.
fn walk(root: &Path, dirs: bool) -> Res<Vec<String>> {
    fn go(root: &Path, dir: &Path, dirs: bool, out: &mut Vec<String>) -> Res<()> {
        for entry in fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            let ty = entry.file_type().map_err(err)?;
            let path = entry.path();
            if ty.is_dir() {
                if dirs {
                    out.extend(rel_of(root, &path));
                }
                go(root, &path, dirs, out)?;
            } else if ty.is_file() && !dirs {
                out.extend(rel_of(root, &path));
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    go(root, root, dirs, &mut out)?;
    out.sort();
    Ok(out)
}

/// Write to a temp file then rename, so a crash mid-autosave never leaves a half-written file.
fn atomic_write(target: &Path, bytes: &[u8]) -> Res<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = target.with_extension(format!("{}.tmp", std::process::id()));
    {
        let mut f = fs::File::create(&tmp).map_err(err)?;
        f.write_all(bytes).map_err(err)?;
        f.sync_all().map_err(err)?;
    }
    fs::rename(&tmp, target).map_err(err)
}

#[tauri::command]
#[specta::specta]
fn fs_list(root: String) -> Res<Vec<String>> {
    walk(Path::new(&root), false)
}

#[tauri::command]
#[specta::specta]
fn fs_list_folders(root: String) -> Res<Vec<String>> {
    walk(Path::new(&root), true)
}

#[tauri::command]
#[specta::specta]
fn fs_read_text(root: String, path: String) -> Res<String> {
    fs::read_to_string(resolve(&root, &path)?).map_err(err)
}

#[tauri::command]
#[specta::specta]
fn fs_write_text(root: String, path: String, content: String) -> Res<()> {
    atomic_write(&resolve(&root, &path)?, content.as_bytes())
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Binary writes (imports) send raw bytes; root and path travel URI-encoded in headers.
#[tauri::command]
fn fs_write_bytes(request: Request<'_>) -> Res<()> {
    let header = |name: &str| -> Res<String> {
        let v = request.headers().get(name).ok_or(format!("missing {name}"))?;
        Ok(percent_decode(v.to_str().map_err(err)?))
    };
    let target = resolve(&header("x-root")?, &header("x-path")?)?;
    match request.body() {
        InvokeBody::Raw(bytes) => atomic_write(&target, bytes),
        InvokeBody::Json(_) => Err("expected raw bytes".into()),
    }
}

/// Build Game: asks where to save the built `.quest` file with the native
/// save dialog and writes the raw body there. The only write outside the project
/// folder, and only to the path the user just picked. Returns that path, or None if cancelled.
#[tauri::command]
async fn build_save(app: tauri::AppHandle, request: Request<'_>) -> Res<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let name = request.headers().get("x-name").map(|v| v.to_str().map(percent_decode)).transpose().map_err(err)?.unwrap_or_else(|| "game.quest".into());
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let Some(picked) = app.dialog().file().set_title("Build Game").set_file_name(&name).add_filter("Questforge game", &["quest"]).blocking_save_file() else {
        return Ok(None);
    };
    let mut path = picked.into_path().map_err(err)?;
    if path.extension().and_then(|e| e.to_str()) != Some("quest") {
        path.set_extension("quest");
    }
    atomic_write(&path, bytes)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
#[specta::specta]
fn fs_move(root: String, from: String, to: String) -> Res<()> {
    let (from, to) = (resolve(&root, &from)?, resolve(&root, &to)?);
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::rename(from, to).map_err(err)
}

#[tauri::command]
#[specta::specta]
fn fs_remove(root: String, path: String) -> Res<()> {
    match fs::remove_file(resolve(&root, &path)?) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        r => r.map_err(err),
    }
}

#[tauri::command]
#[specta::specta]
fn fs_make_folder(root: String, path: String) -> Res<()> {
    fs::create_dir_all(resolve(&root, &path)?).map_err(err)
}

/// Removes a folder only if nothing but a `.keep` file is left in it.
#[tauri::command]
#[specta::specta]
fn fs_remove_folder(root: String, path: String) -> Res<()> {
    let dir = resolve(&root, &path)?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(()) };
    let names: Vec<String> = entries.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    if names.iter().any(|n| n != ".keep") {
        return Ok(());
    }
    let _ = fs::remove_file(dir.join(".keep"));
    fs::remove_dir(dir).map_err(err)
}

/// Deletes a folder tree. Only ever called for `.editor/trash`.
#[tauri::command]
#[specta::specta]
fn fs_remove_tree(root: String, path: String) -> Res<()> {
    if !path.starts_with(".editor/") {
        return Err(format!("Refusing to delete {path}"));
    }
    match fs::remove_dir_all(resolve(&root, &path)?) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        r => r.map_err(err),
    }
}

#[tauri::command]
#[specta::specta]
fn fs_exists(root: String) -> bool {
    Path::new(&root).is_dir()
}

/// Creates a new project folder; fails if one already exists there.
#[tauri::command]
#[specta::specta]
fn fs_make_project_folder(root: String) -> Res<()> {
    let dir = PathBuf::from(&root);
    if !dir.is_absolute() {
        return Err("Project folder must be an absolute path".into());
    }
    if dir.exists() {
        return Err(format!("A folder called {} already exists there.", dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()));
    }
    fs::create_dir_all(dir).map_err(err)
}

/// A project folder passed on the command line (`Questforge <folder>`), opened at startup.
#[tauri::command]
#[specta::specta]
fn launch_project() -> Option<String> {
    let arg = std::env::args().skip(1).find(|a| !a.starts_with('-'))?;
    let path = fs::canonicalize(arg).ok()?;
    path.is_dir().then(|| path.to_string_lossy().into_owned())
}

#[derive(Default)]
struct Watches {
    next: AtomicU32,
    active: Mutex<HashMap<u32, notify::RecommendedWatcher>>,
}

/// Watches a project folder; changed paths (relative) arrive on `channel`.
#[tauri::command]
#[specta::specta]
fn watch_start(root: String, channel: Channel<Vec<String>>, watches: State<'_, Watches>) -> Res<u32> {
    let base = PathBuf::from(&root);
    let canonical = base.canonicalize().unwrap_or(base.clone());
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let paths: Vec<String> = event
                .paths
                .iter()
                .filter_map(|p| rel_of(&canonical, p).or_else(|| rel_of(&base, p)))
                .collect();
            if !paths.is_empty() {
                let _ = channel.send(paths);
            }
        }
    })
    .map_err(err)?;
    watcher.watch(Path::new(&root), RecursiveMode::Recursive).map_err(err)?;
    let id = watches.next.fetch_add(1, Ordering::Relaxed);
    watches.active.lock().map_err(err)?.insert(id, watcher);
    Ok(id)
}

#[tauri::command]
#[specta::specta]
fn watch_stop(id: u32, watches: State<'_, Watches>) -> Res<()> {
    watches.active.lock().map_err(err)?.remove(&id);
    Ok(())
}

fn recent_file(app: &tauri::AppHandle) -> Res<PathBuf> {
    Ok(app.path().app_config_dir().map_err(err)?.join("recent.json"))
}

/// Recent projects live in the app config folder.
#[tauri::command]
#[specta::specta]
fn recent_load(app: tauri::AppHandle) -> Res<String> {
    Ok(fs::read_to_string(recent_file(&app)?).unwrap_or_else(|_| "[]".into()))
}

#[tauri::command]
#[specta::specta]
fn recent_save(app: tauri::AppHandle, json: String) -> Res<()> {
    atomic_write(&recent_file(&app)?, json.as_bytes())
}

/// The typed commands: tauri-specta generates their TypeScript bindings.
/// `fs_write_bytes` and `build_save` take a raw request body, which specta can't
/// describe, so they are registered separately and called by hand in `tauri.ts`.
pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        fs_list,
        fs_list_folders,
        fs_read_text,
        fs_write_text,
        fs_move,
        fs_remove,
        fs_make_folder,
        fs_remove_folder,
        fs_remove_tree,
        fs_exists,
        fs_make_project_folder,
        watch_start,
        watch_stop,
        recent_load,
        recent_save,
        launch_project,
    ])
}

/// Where the generated bindings live, relative to this crate.
pub const BINDINGS: &str = "../src/platform/bindings.ts";

/// Writes the TypeScript bindings. Run by `cargo test export_bindings`.
pub fn export_bindings() {
    specta_builder()
        .export(Typescript::default().header("// Generated by tauri-specta from src-tauri/src/lib.rs. Don't edit; run `cargo test export_bindings`.\n// @ts-nocheck"), BINDINGS)
        .expect("failed to export TypeScript bindings");
}

/// Commands specta can't type (raw request bodies).
fn raw_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![fs_write_bytes, build_save]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let typed = specta_builder().invoke_handler();
    let raw = raw_handler();
    tauri::Builder::default()
        // A second launch focuses the window that's already open. Must be the first plugin.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // Remembers the window's size and position between launches.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Watches::default())
        .invoke_handler(move |invoke| match invoke.message.command() {
            "fs_write_bytes" | "build_save" => raw(invoke),
            _ => typed(invoke),
        })
        .run(tauri::generate_context!())
        .expect("error while running Questforge");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_refuses_escapes() {
        assert!(resolve("/p", "scenes/a.yaml").is_ok());
        assert!(resolve("/p", "../x").is_err());
        assert!(resolve("/p", "/etc/passwd").is_err());
        assert!(resolve("relative", "a").is_err());
    }

    /// Regenerates `src/platform/bindings.ts`; a test so CI can check it's current.
    #[test]
    fn export_bindings() {
        super::export_bindings();
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(percent_decode("Caf%C3%A9%20x.png"), "Café x.png");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
