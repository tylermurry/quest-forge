// App-level commands (D92): one registry that the native menu bar, keyboard
// shortcuts and (later) a command palette all run, so they never disagree.
// DOM-free: hosts register handlers and render the list however they like.

export type MenuName = "file" | "edit" | "view";

export interface CommandSpec {
  id: string;
  label: string;
  menu: MenuName;
  /** `Mod` is Cmd on macOS and Ctrl elsewhere, e.g. `Mod+Shift+Z`. */
  shortcut?: string;
  /** Draw a separator above it in its menu. */
  separated?: boolean;
  /**
   * The command acts on text while a text field has focus (e.g. undo in a field
   * undoes typing), so shortcuts leave it to the field there.
   */
  textAware?: boolean;
}

/** Every app command, in menu order. */
export const COMMANDS = [
  { id: "project.new", label: "New Project…", menu: "file", shortcut: "Mod+N" },
  { id: "project.open", label: "Open Folder…", menu: "file", shortcut: "Mod+O" },
  { id: "project.close", label: "Close Project", menu: "file", shortcut: "Mod+Shift+W", separated: true },
  { id: "edit.undo", label: "Undo", menu: "edit", shortcut: "Mod+Z", textAware: true },
  { id: "edit.redo", label: "Redo", menu: "edit", shortcut: "Mod+Shift+Z", textAware: true },
  { id: "view.browser", label: "Project Browser", menu: "view", shortcut: "Mod+1" },
  { id: "view.inspector", label: "Inspector", menu: "view", shortcut: "Mod+2" },
  { id: "view.dock", label: "Problems and Playtest", menu: "view", shortcut: "Mod+3" },
] as const satisfies readonly CommandSpec[];

export type CommandId = (typeof COMMANDS)[number]["id"];

export interface Handler {
  run(): void;
  /** Defaults to enabled. */
  enabled?(): boolean;
  /** Label override, e.g. "Undo Delete hotspot". */
  label?(): string;
}

export class CommandRegistry {
  private handlers = new Map<CommandId, Handler>();
  private listeners = new Set<() => void>();
  private _version = 0;

  get version() {
    return this._version;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Something that affects enabled state or labels changed; menus refresh. */
  changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  /** Installs handlers; returns a function that removes exactly these again. */
  register(handlers: Partial<Record<CommandId, Handler>>): () => void {
    for (const [id, h] of Object.entries(handlers) as [CommandId, Handler][]) this.handlers.set(id, h);
    this.changed();
    return () => {
      for (const [id, h] of Object.entries(handlers) as [CommandId, Handler][]) if (this.handlers.get(id) === h) this.handlers.delete(id);
      this.changed();
    };
  }

  isEnabled(id: CommandId): boolean {
    const h = this.handlers.get(id);
    return !!h && (h.enabled?.() ?? true);
  }

  label(id: CommandId): string {
    return this.handlers.get(id)?.label?.() ?? COMMANDS.find((c) => c.id === id)!.label;
  }

  run(id: CommandId): boolean {
    if (!this.isEnabled(id)) return false;
    this.handlers.get(id)!.run();
    return true;
  }
}

/** A key press as the shortcut matcher sees it. */
export interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Whether a key press matches `Mod+Shift+Z`-style shortcuts. `mac` picks Cmd vs Ctrl for Mod. */
export function matchesShortcut(shortcut: string, e: KeyPress, mac: boolean): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop()!.toLowerCase();
  const want = { mod: parts.includes("Mod"), shift: parts.includes("Shift"), alt: parts.includes("Alt") };
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  return e.key.toLowerCase() === key && mod === want.mod && e.shiftKey === want.shift && e.altKey === want.alt;
}

/** The command a key press triggers, if any. Text-aware commands are left to a focused text field. */
export function commandForKey(e: KeyPress, mac: boolean, inTextField: boolean): CommandId | null {
  for (const c of COMMANDS as readonly CommandSpec[]) {
    if (!c.shortcut || !matchesShortcut(c.shortcut, e, mac)) continue;
    if (inTextField && c.textAware) return null;
    return c.id as CommandId;
  }
  // Ctrl+Y redoes on Windows and Linux.
  if (!mac && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "y" && !inTextField) return "edit.redo";
  return null;
}

/** Tauri accelerator form of a shortcut: `Mod+Shift+Z` → `CmdOrCtrl+Shift+Z`. */
export const accelerator = (shortcut: string) => shortcut.replace("Mod", "CmdOrCtrl");
