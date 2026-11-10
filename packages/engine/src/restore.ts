import { logicBlocks, type Facing, type Project } from "@questforge/schema";
import { cloneState, type GameState } from "./state.ts";

// Bringing a stored GameState back: save slots and playtest
// presets may come from an older version of the game. `readState` accepts any
// shape and fills what's missing; `sanitizeState` drops IDs the project no longer
// has and says which, so loading never crashes.

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
const isPosition = (x: unknown): x is GameState["player"] => isRecord(x);

/** Reads a saved GameState of any age into the current shape; missing fields get empty values. Null if it isn't one. */
export function readState(raw: unknown): GameState | null {
  if (!isRecord(raw) || typeof raw.scene !== "string") return null;
  const characters = recordOf(raw.characters, isPosition);
  for (const k of Object.keys(characters)) characters[k] = position(characters[k]);
  return {
    scene: raw.scene,
    player: position(raw.player),
    inventory: strings(raw.inventory),
    flags: recordOf(raw.flags, isBool),
    counters: recordOf(raw.counters, isNum),
    awards: recordOf(raw.awards, isNum),
    objects: recordOf(raw.objects, isBool),
    characters,
    visited: strings(raw.visited),
    fired: strings(raw.fired),
    dialogueChoices: strings(raw.dialogueChoices),
    music: typeof raw.music === "string" ? raw.music : null,
  };
}

/** Every award ID an `award_points` action gives, with its points (first one found). */
export function awardCatalog(p: Project): { id: string; points: number }[] {
  const out = new Map<string, number>();
  for (const b of logicBlocks(p)) for (const { a } of b.actions) if (a.type === "award_points" && !out.has(a.award)) out.set(a.award, a.points);
  return [...out].map(([id, points]) => ({ id, points }));
}

export interface Sanitized {
  state: GameState;
  /** Plain-English names of what was dropped, e.g. `item gold_key`. Empty when nothing was. */
  dropped: string[];
}

/**
 * A stored state made safe for the project as it is now: IDs that no
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
  s.inventory = keep(
    s.inventory,
    (i) => items.has(i),
    (i) => `item ${i}`,
  );
  keepKeys(
    s.flags,
    (k) => bools.has(k),
    (k) => `flag ${k}`,
  );
  keepKeys(
    s.counters,
    (k) => counters.has(k),
    (k) => `counter ${k}`,
  );
  for (const [id, initial] of bools) if (!(id in s.flags)) s.flags[id] = initial;
  for (const [id, initial] of counters) if (!(id in s.counters)) s.counters[id] = initial;
  keepKeys(
    s.awards,
    (k) => awards.has(k),
    (k) => `award ${k}`,
  );
  s.visited = keep(
    s.visited,
    (v) => scenes.has(v),
    (v) => `visited scene ${v}`,
  );
  const [sceneOf, idOf] = [(k: string) => k.slice(0, k.indexOf("/")), (k: string) => k.slice(k.indexOf("/") + 1)];
  keepKeys(
    s.objects,
    (k) => !!scenes.get(sceneOf(k))?.objects.some((o) => o.id === idOf(k)),
    (k) => `object ${k}`,
  );
  keepKeys(
    s.characters,
    (k) => scenes.has(sceneOf(k)) && characters.has(idOf(k)),
    (k) => `character position ${k}`,
  );
  // Fired rules of a deleted scene or dialogue can never matter again; drop them quietly.
  const dialogueIds = new Set(p.dialogues.map((d) => d.data.id));
  s.fired = s.fired.filter((k) =>
    k.startsWith("dialogue:") ? dialogueIds.has(sceneOf(k.slice("dialogue:".length))) : k.startsWith("game/") || scenes.has(sceneOf(k)),
  );
  // Once-only options are keyed `<dialogue>/<node>/<option>`.
  const options = new Set(
    p.dialogues.flatMap((d) => d.data.nodes.flatMap((n) => (n.type === "choices" ? n.options.map((o) => `${d.data.id}/${n.id}/${o.id}`) : []))),
  );
  s.dialogueChoices = keep(
    s.dialogueChoices,
    (k) => options.has(k),
    (k) => `dialogue choice ${k}`,
  );
  if (s.music !== null && !audio.has(s.music)) {
    dropped.push(`music ${s.music}`);
    s.music = null;
  }
  return { state: s, dropped };
}
