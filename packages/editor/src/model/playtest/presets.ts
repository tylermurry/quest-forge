// Playtest state presets (spec 12, D126): named GameState snapshots kept per project
// in `.editor/presets.json` (gitignored, like view.json). Not project data: no
// schema, no validation, never undone. Starting from one drops IDs the project no
// longer has, with a notice, and never crashes.
import { cloneState, type GameState } from "@questforge/engine";
import type { Facing, Project, ProjectFs } from "@questforge/schema";
import { awardCatalog } from "./state.ts";

export const PRESETS_FILE = ".editor/presets.json";

export interface Preset {
  name: string;
  state: GameState;
}

const FACINGS: readonly Facing[] = ["up", "down", "left", "right"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const numberOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const position = (v: unknown) => {
  const r = isRecord(v) ? v : {};
  return { x: numberOr(r.x, 0), y: numberOr(r.y, 0), facing: FACINGS.includes(r.facing as Facing) ? (r.facing as Facing) : "down" };
};
function recordOf<T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> {
  const out: Record<string, T> = {};
  if (isRecord(v)) for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x;
  return out;
}
const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Reads a saved GameState of any age into the current shape; missing fields get empty values. */
export function readState(raw: unknown): GameState | null {
  if (!isRecord(raw) || typeof raw.scene !== "string") return null;
  return {
    scene: raw.scene,
    player: position(raw.player),
    inventory: strings(raw.inventory),
    flags: recordOf(raw.flags, isBool),
    counters: recordOf(raw.counters, isNum),
    awards: recordOf(raw.awards, isNum),
    objects: recordOf(raw.objects, isBool),
    characters: recordOf(raw.characters, isRecord) as unknown as GameState["characters"],
    visited: strings(raw.visited),
    fired: strings(raw.fired),
    dialogueChoices: strings(raw.dialogueChoices),
    music: typeof raw.music === "string" ? raw.music : null,
  };
}

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
    return [];
  }
}

export interface Sanitized {
  state: GameState;
  /** Plain-English names of what was dropped, e.g. `item gold_key`. Empty when nothing was. */
  dropped: string[];
}

/**
 * A preset's state made safe for the project as it is now (D126): IDs that no
 * longer exist are dropped, flags and counters added since get their initial
 * values, and a missing scene falls back to the game's start.
 */
export function sanitizeState(p: Project, saved: GameState): Sanitized {
  const s = cloneState(saved);
  const dropped: string[] = [];
  const scenes = new Map(p.scenes.map((d) => [d.data.id, d.data]));
  const items = new Set(p.items.map((d) => d.data.id));
  const characters = new Set(p.characters.map((d) => d.data.id));
  const flags = p.flags?.data.flags ?? [];
  const bools = new Map(flags.filter((f) => f.type === "bool").map((f) => [f.id, f.initial]));
  const counters = new Map(flags.filter((f) => f.type === "counter").map((f) => [f.id, f.initial]));
  const awards = new Set(awardCatalog(p).map((a) => a.id));
  const audio = new Set(p.assets?.data.audio.map((a) => a.id) ?? []);
  const keep = <T>(list: T[], ok: (x: T) => boolean, what: (x: T) => string) =>
    list.filter((x) => {
      if (ok(x)) return true;
      dropped.push(what(x));
      return false;
    });
  const keepKeys = <T>(rec: Record<string, T>, ok: (k: string) => boolean, what: (k: string) => string) => {
    for (const k of Object.keys(rec)) {
      if (ok(k)) continue;
      dropped.push(what(k));
      delete rec[k];
    }
  };

  if (!scenes.has(s.scene)) {
    const game = p.game?.data;
    const start = game ? scenes.get(game.startScene) : undefined;
    const spawn = start && game ? start.spawns[game.startSpawn] : undefined;
    dropped.push(`scene ${s.scene} (starting at the game's start instead)`);
    if (start && spawn) {
      s.scene = start.id;
      s.player = { x: spawn.x, y: spawn.y, facing: spawn.facing };
    }
  }
  s.inventory = keep(s.inventory, (i) => items.has(i), (i) => `item ${i}`);
  keepKeys(s.flags, (k) => bools.has(k), (k) => `flag ${k}`);
  keepKeys(s.counters, (k) => counters.has(k), (k) => `counter ${k}`);
  for (const [id, initial] of bools) if (!(id in s.flags)) s.flags[id] = initial;
  for (const [id, initial] of counters) if (!(id in s.counters)) s.counters[id] = initial;
  keepKeys(s.awards, (k) => awards.has(k), (k) => `award ${k}`);
  s.visited = keep(s.visited, (v) => scenes.has(v), (v) => `visited scene ${v}`);
  const [sceneOf, idOf] = [(k: string) => k.slice(0, k.indexOf("/")), (k: string) => k.slice(k.indexOf("/") + 1)];
  keepKeys(s.objects, (k) => !!scenes.get(sceneOf(k))?.objects.some((o) => o.id === idOf(k)), (k) => `object ${k}`);
  keepKeys(s.characters, (k) => scenes.has(sceneOf(k)) && characters.has(idOf(k)), (k) => `character position ${k}`);
  // Fired rules of a deleted scene can never matter again; drop them quietly.
  s.fired = s.fired.filter((k) => k.startsWith("game/") || scenes.has(sceneOf(k)));
  if (s.music !== null && !audio.has(s.music)) {
    dropped.push(`music ${s.music}`);
    s.music = null;
  }
  return { state: s, dropped };
}

/** The notice for a saved state that lost IDs (D126), e.g. `Preset "Before cave"`. */
export function droppedNotice(what: string, dropped: string[]): string {
  return `${what} started without ${dropped.join(", ")}, which no longer ${dropped.length === 1 ? "exists" : "exist"} in the project.`;
}

/** The presets of the open project, saved to presets.json on every change. */
export class PresetStore {
  private _list: Preset[] = [];
  private fs: ProjectFs | null = null;
  private listeners = new Set<() => void>();
  private _version = 0;

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
    if (this.fs) await this.fs.writeText(PRESETS_FILE, this.toJSON()).catch(() => undefined);
  }
}
