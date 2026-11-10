import type { GameFile } from "@questforge/schema";
import { readState } from "./restore.ts";
import { cloneState, type GameState } from "./state.ts";

// Save slots (spec 07, D43, D146): 10 named slots kept in key-value storage
// (localStorage in the browser). One storage entry per game ID holds every slot;
// each slot remembers the game version it was made with, so a newer version of
// the game still lists and loads it (IDs that are gone are dropped on load).
// Pure: the host passes the storage, so this is tested in Node.

export const SLOT_COUNT = 10;

/** The part of `Storage` the engine uses. Any of these may throw (private mode, quota). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveSlot {
  /** Shown in the slot list, e.g. "Garden shed · Score 5 of 25". */
  name: string;
  /** Epoch milliseconds. */
  savedAt: number;
  /** `game.version` when it was saved. */
  version: number;
  state: GameState;
}

/** Storage key for a game's slots (D146). */
export const savesKey = (gameId: string) => `questforge/${gameId}/saves`;
/** Storage key for a game's player settings (volume, D150). */
export const settingsKey = (gameId: string) => `questforge/${gameId}/settings`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads one slot of any age; anything unreadable is an empty slot. */
function readSlot(raw: unknown): SaveSlot | null {
  if (!isRecord(raw)) return null;
  const state = readState(raw.state);
  if (!state) return null;
  return {
    name: typeof raw.name === "string" ? raw.name : "Saved game",
    savedAt: typeof raw.savedAt === "number" && Number.isFinite(raw.savedAt) ? raw.savedAt : 0,
    version: typeof raw.version === "number" && Number.isFinite(raw.version) ? raw.version : 0,
    state,
  };
}

export class SaveSlots {
  private slots: (SaveSlot | null)[];
  /** Why the last write failed, in plain English; null when it worked. */
  error: string | null = null;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly game: Pick<GameFile, "id" | "version">,
  ) {
    this.slots = this.read();
  }

  private read(): (SaveSlot | null)[] {
    const empty = Array.from({ length: SLOT_COUNT }, () => null);
    let text: string | null = null;
    try {
      text = this.store?.getItem(savesKey(this.game.id)) ?? null;
    } catch {
      // Blocked storage: start with empty slots. Saving then reports the problem (`error`).
      return empty;
    }
    if (!text) return empty;
    try {
      const raw = JSON.parse(text) as unknown;
      const list = isRecord(raw) && Array.isArray(raw.slots) ? raw.slots : [];
      return empty.map((_, i) => readSlot(list[i]));
    } catch {
      // A stored blob that is not valid JSON can't be repaired. Showing empty slots is the only
      // safe reading, and the next save replaces it.
      return empty;
    }
  }

  /** The slots in order; null is an empty slot. Read-only: use `get` for a copy to play. */
  get list(): readonly (SaveSlot | null)[] {
    return this.slots;
  }

  get any(): boolean {
    return this.slots.some((s) => s !== null);
  }

  get(index: number): SaveSlot | null {
    const s = this.slots[index];
    return s ? { ...s, state: cloneState(s.state) } : null;
  }

  /** Saves a copy of `state` into slot `index` (0-based), replacing what was there. Returns whether it was stored. */
  save(index: number, name: string, state: GameState, now = Date.now()): boolean {
    if (index < 0 || index >= SLOT_COUNT) return false;
    const before = this.slots;
    this.slots = this.slots.map((s, i) => (i === index ? { name, savedAt: now, version: this.game.version, state: cloneState(state) } : s));
    if (this.write()) return true;
    this.slots = before;
    return false;
  }

  private write(): boolean {
    if (!this.store) {
      this.error = "Saving isn't available here.";
      return false;
    }
    try {
      this.store.setItem(savesKey(this.game.id), JSON.stringify({ slots: this.slots }));
      this.error = null;
      return true;
    } catch {
      this.error = "The game couldn't be saved. The browser may be out of space or blocking storage.";
      return false;
    }
  }
}

/** Player settings that outlive a game (D150): volumes 0–10. Not game state. */
export interface PlayerSettings {
  music: number;
  sfx: number;
}

export const VOLUME_STEPS = 10;
export const DEFAULT_SETTINGS: PlayerSettings = { music: 7, sfx: 8 };

const volume = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(VOLUME_STEPS, Math.round(v))) : d);

export function readSettings(store: KeyValueStore | null, gameId: string): PlayerSettings {
  try {
    const raw = JSON.parse(store?.getItem(settingsKey(gameId)) ?? "null") as unknown;
    if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
    return { music: volume(raw.music, DEFAULT_SETTINGS.music), sfx: volume(raw.sfx, DEFAULT_SETTINGS.sfx) };
  } catch {
    // Blocked or unreadable storage: the defaults are the right volumes to play with.
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(store: KeyValueStore | null, gameId: string, s: PlayerSettings) {
  try {
    store?.setItem(settingsKey(gameId), JSON.stringify(s));
  } catch {
    // Settings are a convenience; play goes on without them.
  }
}

/** In-memory storage, for tests and when the browser blocks localStorage. */
export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
