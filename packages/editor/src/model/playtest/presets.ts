// Playtest state presets: named GameState snapshots kept per project
// in `.editor/presets.json` (gitignored, like view.json). Not project data: no
// schema, no validation, never undone. Starting from one drops IDs the project no
// longer has, with a notice, and never crashes.
import { cloneState, readState, type GameState } from "@questforge/engine";
import type { ProjectFs } from "@questforge/schema";

// Reading and sanitizing a stored state is the engine's, shared with save slots.
export { readState, sanitizeState } from "@questforge/engine";

export const PRESETS_FILE = ".editor/presets.json";

export interface Preset {
  name: string;
  state: GameState;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads presets.json; a missing or broken file (or entry) is skipped, never an error. */
export function readPresets(text: string | null): Preset[] {
  if (text === null) return [];
  try {
    const raw = JSON.parse(text) as unknown;
    const list = isRecord(raw) && Array.isArray(raw.presets) ? raw.presets : [];
    return list.flatMap((p: unknown) => {
      if (!isRecord(p) || typeof p.name !== "string" || !p.name.trim()) return [];
      const state = readState(p.state);
      return state ? [{ name: p.name, state }] : [];
    });
  } catch {
    // A broken presets.json (hand-edited, half-written) is treated as "no presets"; the next save rewrites it.
    return [];
  }
}

/** The notice for a saved state that lost IDs, e.g. `Preset "Before cave"`. */
export function droppedNotice(what: string, dropped: string[]): string {
  return `${what} started without ${dropped.join(", ")}, which no longer ${dropped.length === 1 ? "exists" : "exist"} in the project.`;
}

/** The presets of the open project, saved to presets.json on every change. */
export class PresetStore {
  private _list: Preset[] = [];
  private fs: ProjectFs | null = null;
  private listeners = new Set<() => void>();
  private _version = 0;
  /** Told, in plain English, when presets.json could not be written, so the author knows a preset may be lost. */
  onWriteError: ((message: string) => void) | null = null;

  get version() {
    return this._version;
  }
  get list(): readonly Preset[] {
    return this._list;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  async attach(fs: ProjectFs) {
    this.fs = fs;
    // The file does not exist until the first preset is saved, and ProjectFs reports that as a throw; either way, start empty.
    this._list = readPresets(await fs.readText(PRESETS_FILE).catch(() => null));
    this.changed();
  }

  detach() {
    this.fs = null;
  }

  find(name: string): Preset | undefined {
    return this._list.find((p) => p.name === name);
  }

  /** Saves a copy of `state` under `name`, replacing a preset of that name. */
  async save(name: string, state: GameState) {
    const n = name.trim();
    if (!n) return;
    const preset = { name: n, state: cloneState(state) };
    const i = this._list.findIndex((p) => p.name === n);
    this._list = i >= 0 ? this._list.map((p, j) => (j === i ? preset : p)) : [...this._list, preset];
    this.changed();
    await this.write();
  }

  async remove(name: string) {
    this._list = this._list.filter((p) => p.name !== name);
    this.changed();
    await this.write();
  }

  toJSON(): string {
    return `${JSON.stringify({ presets: this._list }, null, 2)}\n`;
  }

  private async write() {
    if (!this.fs) return;
    try {
      await this.fs.writeText(PRESETS_FILE, this.toJSON());
    } catch {
      this.onWriteError?.(
        "Couldn't save your playtest presets to the project folder. They are kept until you close the editor, then lost. Check that the folder is writable.",
      );
    }
  }
}
