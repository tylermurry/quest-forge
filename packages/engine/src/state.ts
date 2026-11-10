import type { Facing, FlagsFile, Placement, SceneFile } from "@questforge/schema";

// Runtime game state: one plain JSON object, so save/load
// stores it as-is. Everything that changes during play and must survive a scene
// change or a save lives here; UI state (current item, open panels) does not.

/** A standing position. Coordinates may be fractional at runtime. */
export interface Position {
  x: number;
  y: number;
  facing: Facing;
}

export interface GameState {
  scene: string;
  player: Position;
  /** Item IDs in the order they were picked up. */
  inventory: string[];
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  /** Award ID → points. Each award counts once. */
  awards: Record<string, number>;
  /** `scene/object` → visible, for objects changed by show/hide_object. */
  objects: Record<string, boolean>;
  /** `scene/character` → position, set by `set_character_position`. */
  characters: Record<string, Position>;
  /** Scene IDs entered at least once, in order. */
  visited: string[];
  /** Keys of rules that have run, for `once` and `first_time`. */
  fired: string[];
  /** Dialogue `once` options already chosen, as `<dialogue>/<node>/<option>`. */
  dialogueChoices: string[];
  /** Audio ID of the current music, recorded by play/stop_music. */
  music: string | null;
}

/** The state at the start of a new game (or "from here" at another scene/spawn). */
export function initialState(flags: FlagsFile | null, scene: string, spawn: Placement): GameState {
  const state: GameState = {
    scene,
    player: { x: spawn.x, y: spawn.y, facing: spawn.facing },
    inventory: [],
    flags: {},
    counters: {},
    awards: {},
    objects: {},
    characters: {},
    visited: [],
    fired: [],
    dialogueChoices: [],
    music: null,
  };
  for (const f of flags?.flags ?? []) {
    if (f.type === "bool") state.flags[f.id] = f.initial;
    else state.counters[f.id] = f.initial;
  }
  return state;
}

export const cloneState = (s: GameState): GameState => structuredClone(s);

const objectKey = (scene: string, object: string) => `${scene}/${object}`;

export const hasItem = (s: GameState, item: string) => s.inventory.includes(item);

/** Adds an item; having it already changes nothing. */
export function giveItem(s: GameState, item: string) {
  if (!hasItem(s, item)) s.inventory.push(item);
}

export function takeItem(s: GameState, item: string) {
  const i = s.inventory.indexOf(item);
  if (i >= 0) s.inventory.splice(i, 1);
}

/** Records an award. Returns false (and changes nothing) if it was already given. */
export function award(s: GameState, id: string, points: number): boolean {
  if (id in s.awards) return false;
  s.awards[id] = points;
  return true;
}

export const score = (s: GameState) => Object.values(s.awards).reduce((a, b) => a + b, 0);

/** An object's visibility: the state's override, else the scene file's value. */
export function objectVisible(s: GameState, scene: SceneFile, object: string): boolean {
  const override = s.objects[objectKey(scene.id, object)];
  if (override !== undefined) return override;
  return scene.objects.find((o) => o.id === object)?.visible ?? false;
}

export function setObjectVisible(s: GameState, scene: string, object: string, visible: boolean) {
  s.objects[objectKey(scene, object)] = visible;
}

export function setCharacterPosition(s: GameState, scene: string, character: string, p: Position) {
  s.characters[objectKey(scene, character)] = { x: p.x, y: p.y, facing: p.facing };
}

export function markVisited(s: GameState, scene: string) {
  if (!s.visited.includes(scene)) s.visited.push(scene);
}

export function markFired(s: GameState, key: string) {
  if (!s.fired.includes(key)) s.fired.push(key);
}
