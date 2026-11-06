// The desktop app's platform (D90): Rust commands confined to the open project
// folder (src-tauri/src/lib.rs), native folder dialogs, and recent projects in the
// app config folder.
import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectFs } from "@questforge/schema";
import type { ProjectHost } from "../model/editor.ts";
import { COMMANDS, accelerator, type CommandId, type CommandRegistry, type CommandSpec, type MenuName } from "../model/appCommands.ts";
import { parseRecent, type RecentProject } from "../model/recent.ts";
import type { Platform } from "./platform.ts";

/** Tauri rejects with the Rust error string; wrap it so describeSaveError can read it. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : String(e));
  }
}

/** ProjectFs for a folder on disk, through the Tauri commands (D56). */
export class TauriFs implements ProjectFs {
  constructor(readonly root: string) {}
  list = () => call<string[]>("fs_list", { root: this.root });
  listFolders = () => call<string[]>("fs_list_folders", { root: this.root });
  readText = (path: string) => call<string>("fs_read_text", { root: this.root, path });
  writeText = (path: string, content: string) => call<void>("fs_write_text", { root: this.root, path, content });
  /** Raw bytes as the request body; root and path ride in URI-encoded headers. */
  async writeBytes(path: string, bytes: Uint8Array) {
    try {
      await invoke<void>("fs_write_bytes", bytes, { headers: { "x-root": encodeURIComponent(this.root), "x-path": encodeURIComponent(path) } });
    } catch (e) {
      throw new Error(typeof e === "string" ? e : String(e));
    }
  }
  move = (from: string, to: string) => call<void>("fs_move", { root: this.root, from, to });
  remove = (path: string) => call<void>("fs_remove", { root: this.root, path });
  makeFolder = (path: string) => call<void>("fs_make_folder", { root: this.root, path });
  removeFolder = (path: string) => call<void>("fs_remove_folder", { root: this.root, path });
  removeTree = (path: string) => call<void>("fs_remove_tree", { root: this.root, path });
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
        ...(c.shortcut && { accelerator: accelerator(c.shortcut) }),
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
  makeProjectFolder: (root) => call<void>("fs_make_project_folder", { root }),
  exists: (root) => call<boolean>("fs_exists", { root }),
  host(root): ProjectHost {
    return {
      fs: new TauriFs(root),
      watch(onChange) {
        const channel = new Channel<string[]>();
        channel.onmessage = onChange;
        const id = call<number>("watch_start", { root, channel });
        return () => void id.then((watchId) => call("watch_stop", { id: watchId }));
      },
    };
  },
  assetUrl: (root, path) => convertFileSrc(`${root}/${path}`),
  async loadRecent() {
    try {
      return parseRecent(JSON.parse(await call<string>("recent_load")));
    } catch {
      return [];
    }
  },
  async saveRecent(list: RecentProject[]) {
    await call("recent_save", { json: JSON.stringify(list) });
  },
  launchProject: () => call<string | null>("launch_project"),
  installMenu,
  displayPath: (root) => root,
};
