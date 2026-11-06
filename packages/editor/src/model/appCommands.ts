// App-level commands (D92): one registry that the native menu bar, keyboard
// shortcuts and (later) a command palette all run, so they never disagree.
// DOM-free: hosts register handlers and render the list however they like.

export type MenuName = "file" | "edit" | "view" | "scene" | "play";

export interface CommandSpec {
  id: string;
  label: string;
  menu: MenuName;
  /** `Mod` is Cmd on macOS and Ctrl elsewhere, e.g. `Mod+Shift+Z`; `Ctrl` is the Control key everywhere. */
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
  { id: "edit.delete", label: "Delete", menu: "edit", shortcut: "Backspace", separated: true },
  { id: "view.browser", label: "Project Browser", menu: "view", shortcut: "Mod+1" },
  { id: "view.inspector", label: "Inspector", menu: "view", shortcut: "Mod+2" },
  { id: "view.dock", label: "Problems", menu: "view", shortcut: "Mod+3" },
  { id: "view.panels", label: "Hide All Panels", menu: "view", shortcut: "Ctrl+\\", separated: true },
  { id: "scene.tool.select", label: "Select / Move Tool", menu: "scene", shortcut: "V" },
  { id: "scene.tool.polygon", label: "Polygon Tool", menu: "scene", shortcut: "P" },
  { id: "scene.tool.rect", label: "Rectangle Tool", menu: "scene", shortcut: "R" },
  { id: "scene.tool.spawn", label: "Spawn Point Tool", menu: "scene", shortcut: "S" },
  { id: "scene.tool.walkto", label: "Walk-to Point Tool", menu: "scene", shortcut: "W" },
  { id: "scene.finish", label: "Finish Shape", menu: "scene", shortcut: "Enter", separated: true },
  { id: "scene.cancel", label: "Cancel Shape", menu: "scene", shortcut: "Escape" },
  { id: "scene.snap", label: "Snap to Vertices and Edges", menu: "scene", separated: true },
  { id: "scene.zoomIn", label: "Zoom In", menu: "scene", shortcut: "Mod+=", separated: true },
  { id: "scene.zoomOut", label: "Zoom Out", menu: "scene", shortcut: "Mod+-" },
  { id: "scene.zoomFit", label: "Zoom to Fit", menu: "scene", shortcut: "Mod+0" },
  { id: "scene.zoomActual", label: "Actual Size (1×)", menu: "scene" },
  { id: "play.start", label: "Play", menu: "play", shortcut: "F5" },
  { id: "play.here", label: "Play from Here", menu: "play", shortcut: "F6" },
  { id: "play.restart", label: "Restart", menu: "play", separated: true },
  { id: "play.restartScene", label: "Restart Scene", menu: "play" },
  { id: "play.stop", label: "Stop", menu: "play", shortcut: "Shift+F5" },
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
  const want = { mod: parts.includes("Mod"), ctrl: parts.includes("Ctrl"), shift: parts.includes("Shift"), alt: parts.includes("Alt") };
  if (want.ctrl) return e.key.toLowerCase() === key && e.ctrlKey && !e.metaKey && e.shiftKey === want.shift && e.altKey === want.alt;
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  return e.key.toLowerCase() === key && mod === want.mod && e.shiftKey === want.shift && e.altKey === want.alt;
}

/** Function keys can't be typed into a field, so they are real accelerators (D131). */
const isFunctionKey = (shortcut: string) => /^F\d{1,2}$/.test(shortcut.split("+").at(-1)!);

/**
 * A shortcut with no Mod key (a tool letter, Enter, Delete…). The webview handles
 * these in both hosts and never inside a text field; the native menu lists them
 * without an accelerator so it can't swallow typing. Function keys aren't plain.
 */
export const isPlainShortcut = (shortcut: string) => {
  const parts = shortcut.split("+");
  return !parts.includes("Mod") && !parts.includes("Ctrl") && !isFunctionKey(shortcut);
};

export interface KeyOptions {
  /** Only plain shortcuts (the native menu handles the rest). */
  plainOnly?: boolean;
  /** The playtest game has focus: plain shortcuts don't reach the editor (D131). */
  inGame?: boolean;
}

/** The command a key press triggers, if any. Text-aware and plain commands are left to a focused text field. */
export function commandForKey(e: KeyPress, mac: boolean, inTextField: boolean, opts: KeyOptions = {}): CommandId | null {
  // The forward-delete key deletes too.
  const key = e.key === "Delete" ? { ...e, key: "Backspace" } : e;
  for (const c of COMMANDS as readonly CommandSpec[]) {
    if (!c.shortcut || !matchesShortcut(c.shortcut, key, mac)) continue;
    const plain = isPlainShortcut(c.shortcut);
    if (opts.plainOnly && !plain) continue;
    if (opts.inGame && plain) return null;
    if (inTextField && (c.textAware || plain)) return null;
    return c.id as CommandId;
  }
  if (opts.plainOnly) return null;
  // Ctrl+Y redoes on Windows and Linux.
  if (!mac && e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "y" && !inTextField) return "edit.redo";
  return null;
}

/** Tauri accelerator form of a shortcut: `Mod+Shift+Z` → `CmdOrCtrl+Shift+Z`. */
export const accelerator = (shortcut: string) =>
  shortcut.replace("Mod", "CmdOrCtrl").replace(/^Ctrl\+/, "Control+").replace(/\+=$/, "+Equal").replace(/\+-$/, "+Minus").replace(/\+\\$/, "+Backslash");
