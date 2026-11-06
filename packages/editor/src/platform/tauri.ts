// The desktop app's platform (D90): Rust commands confined to the open project
// folder (src-tauri/src/lib.rs), native folder dialogs, and recent projects in the
// app config folder.
import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { commands } from "./bindings.ts";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectFs } from "@questforge/schema";
import type { ProjectHost } from "../model/editor.ts";
import { COMMANDS, accelerator, isPlainShortcut, type CommandId, type CommandRegistry, type CommandSpec, type MenuName } from "../model/appCommands.ts";
import { parseRecent, type RecentProject } from "../model/recent.ts";
import type { Platform } from "./platform.ts";

/** Unwraps a typed command result; the Rust error string becomes an Error describeSaveError can read. */
async function ok<T>(result: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>): Promise<T> {
  const r = await result;
  if (r.status === "error") throw new Error(r.error);
  return r.data;
}

/** ProjectFs for a folder on disk, through the typed Tauri commands (D56, D92). */
export class TauriFs implements ProjectFs {
  constructor(readonly root: string) {}
  list = () => ok(commands.fsList(this.root));
  listFolders = () => ok(commands.fsListFolders(this.root));
  readText = (path: string) => ok(commands.fsReadText(this.root, path));
  writeText = async (path: string, content: string) => void (await ok(commands.fsWriteText(this.root, path, content)));
  move = async (from: string, to: string) => void (await ok(commands.fsMove(this.root, from, to)));
  remove = async (path: string) => void (await ok(commands.fsRemove(this.root, path)));
  makeFolder = async (path: string) => void (await ok(commands.fsMakeFolder(this.root, path)));
  removeFolder = async (path: string) => void (await ok(commands.fsRemoveFolder(this.root, path)));
  removeTree = async (path: string) => void (await ok(commands.fsRemoveTree(this.root, path)));
  /** Raw bytes as the request body (not typed by specta); root and path ride in URI-encoded headers. */
  async writeBytes(path: string, bytes: Uint8Array) {
    try {
      await invoke<void>("fs_write_bytes", bytes, { headers: { "x-root": encodeURIComponent(this.root), "x-path": encodeURIComponent(path) } });
    } catch (e) {
      throw new Error(typeof e === "string" ? e : String(e));
    }
  }
}

const textFieldFocused = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/**
 * The native menu bar (D92), built from the command registry. Undo and Redo act on
 * a focused text field's typing, and on the project otherwise.
 */
async function installMenu(registry: CommandRegistry): Promise<() => void> {
  const items = new Map<CommandId, MenuItem>();
  const ours = async (menu: MenuName) => {
    const out: (MenuItem | PredefinedMenuItem)[] = [];
    for (const c of COMMANDS as readonly CommandSpec[]) {
      if (c.menu !== menu) continue;
      const id = c.id as CommandId;
      if (c.separated) out.push(await PredefinedMenuItem.new({ item: "Separator" }));
      const item = await MenuItem.new({
        id,
        text: registry.label(id),
        enabled: registry.isEnabled(id),
        // Plain shortcuts (tool letters, Enter, Delete) stay with the webview (isPlainShortcut).
        ...(c.shortcut && !isPlainShortcut(c.shortcut) && { accelerator: accelerator(c.shortcut) }),
        action: () => {
          if (c.textAware && textFieldFocused()) document.execCommand(id === "edit.undo" ? "undo" : "redo");
          else registry.run(id);
        },
      });
      items.set(id, item);
      out.push(item);
    }
    return out;
  };
  const sep = () => PredefinedMenuItem.new({ item: "Separator" });
  const menu = await Menu.new({
    items: [
      await Submenu.new({
        text: "Questforge",
        items: [
          await PredefinedMenuItem.new({ item: { About: { name: "Questforge" } } }),
          await sep(),
          await PredefinedMenuItem.new({ item: "Services" }),
          await sep(),
          await PredefinedMenuItem.new({ item: "Hide" }),
          await PredefinedMenuItem.new({ item: "HideOthers" }),
          await PredefinedMenuItem.new({ item: "ShowAll" }),
          await sep(),
          await PredefinedMenuItem.new({ item: "Quit" }),
        ],
      }),
      await Submenu.new({ text: "File", items: await ours("file") }),
      await Submenu.new({
        text: "Edit",
        items: [
          ...(await ours("edit")),
          await sep(),
          await PredefinedMenuItem.new({ item: "Cut" }),
          await PredefinedMenuItem.new({ item: "Copy" }),
          await PredefinedMenuItem.new({ item: "Paste" }),
          await PredefinedMenuItem.new({ item: "SelectAll" }),
        ],
      }),
      await Submenu.new({ text: "View", items: [...(await ours("view")), await sep(), await PredefinedMenuItem.new({ item: "Fullscreen" })] }),
      await Submenu.new({ text: "Scene", items: await ours("scene") }),
      await Submenu.new({ text: "Play", items: await ours("play") }),
      await Submenu.new({
        text: "Window",
        items: [await PredefinedMenuItem.new({ item: "Minimize" }), await PredefinedMenuItem.new({ item: "Maximize" }), await sep(), await PredefinedMenuItem.new({ item: "CloseWindow" })],
      }),
    ],
  });
  await menu.setAsAppMenu();
  const refresh = () => {
    for (const [id, item] of items) {
      void item.setEnabled(registry.isEnabled(id));
      void item.setText(registry.label(id));
    }
  };
  return registry.subscribe(refresh);
}

export const tauriPlatform: Platform = {
  kind: "tauri",
  async openFolder() {
    const picked = await open({ directory: true, multiple: false, title: "Open a Questforge project folder" });
    return typeof picked === "string" ? picked : null;
  },
  async chooseParent() {
    const picked = await open({ directory: true, multiple: false, title: "Choose where to create the project folder" });
    return typeof picked === "string" ? picked : null;
  },
  joinPath: (parent, name) => `${parent.replace(/[/\\]+$/, "")}/${name}`,
  makeProjectFolder: async (root) => void (await ok(commands.fsMakeProjectFolder(root))),
  exists: (root) => commands.fsExists(root),
  host(root): ProjectHost {
    return {
      fs: new TauriFs(root),
      watch(onChange) {
        const channel = new Channel<string[]>();
        channel.onmessage = onChange;
        const id = ok(commands.watchStart(root, channel));
        return () => void id.then((watchId) => commands.watchStop(watchId));
      },
    };
  },
  assetUrl: (root, path) => convertFileSrc(`${root}/${path}`),
  async loadRecent() {
    try {
      return parseRecent(JSON.parse(await ok(commands.recentLoad())));
    } catch {
      return [];
    }
  },
  async saveRecent(list: RecentProject[]) {
    await ok(commands.recentSave(JSON.stringify(list)));
  },
  launchProject: () => commands.launchProject(),
  installMenu,
  displayPath: (root) => root,
};
