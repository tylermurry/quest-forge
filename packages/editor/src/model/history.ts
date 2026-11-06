// Undo/redo across all editors (spec 08, D21, D84). Steps are whole-project
// snapshots: Projects are immutable and unchanged docs are shared, so each step
// costs only the docs it changed.
import type { Project } from "@questforge/schema";

/** Spec 08 asks for at least 200 steps per session (D84). */
export const HISTORY_LIMIT = 500;
/** Edits with the same merge key closer together than this are one step (typing, D84). */
export const MERGE_WINDOW_MS = 1000;

/** Fields describing what's on disk. They're never undone: undo keeps the current ones (D84). */
const DISK_KEYS = ["files", "saved", "savedFolders", "trash"] as const satisfies readonly (keyof Project)[];

/** Whether two projects hold the same content (disk state aside); unchanged docs are shared, so this compares references. */
export function sameContent(a: Project, b: Project): boolean {
  if (a === b) return true;
  const disk = new Set<string>(DISK_KEYS);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!disk.has(k) && (a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
  return true;
}

/** `content` with the disk state of `disk`. */
export function withDiskState(content: Project, disk: Project): Project {
  const out = { ...content };
  for (const k of DISK_KEYS) (out as Record<string, unknown>)[k] = disk[k];
  return out;
}

interface Step {
  /** The project before (for the undo stack) or after (for the redo stack) the command. */
  project: Project;
  /** What the command was, e.g. "Delete hotspot", for "Undo Delete hotspot". */
  label: string;
  mergeKey?: string;
  at: number;
}

export interface HistoryOptions {
  limit?: number;
  now?: () => number;
}

export class History {
  private past: Step[] = [];
  private future: Step[] = [];
  private readonly limit: number;
  private readonly now: () => number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? HISTORY_LIMIT;
    this.now = options.now ?? Date.now;
  }

  /**
   * Records that a command is about to change `before`. With a `mergeKey` equal to
   * the last step's (and within the merge window), it joins that step instead.
   */
  record(before: Project, label: string, mergeKey?: string) {
    const at = this.now();
    const last = this.past[this.past.length - 1];
    this.future = [];
    if (mergeKey !== undefined && last?.mergeKey === mergeKey && at - last.at < MERGE_WINDOW_MS) {
      last.at = at;
      return;
    }
    this.past.push({ project: before, label, ...(mergeKey !== undefined && { mergeKey }), at });
    if (this.past.length > this.limit) this.past.shift();
  }

  /** Ends any merging, e.g. when a field loses focus (D84). */
  breakMerge() {
    const last = this.past[this.past.length - 1];
    if (last) delete last.mergeKey;
  }

  /** The project one step back, keeping `current`'s disk state; null if there's nothing to undo. */
  undo(current: Project): Project | null {
    const step = this.past.pop();
    if (!step) return null;
    this.future.push({ project: current, label: step.label, at: this.now() });
    return withDiskState(step.project, current);
  }

  redo(current: Project): Project | null {
    const step = this.future.pop();
    if (!step) return null;
    this.past.push({ project: current, label: step.label, at: this.now() });
    return withDiskState(step.project, current);
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get undoLabel() {
    return this.past[this.past.length - 1]?.label ?? null;
  }
  get redoLabel() {
    return this.future[this.future.length - 1]?.label ?? null;
  }
  get size() {
    return this.past.length;
  }

  /** Forget everything, e.g. after the project reloads from disk (D84, D85). */
  clear() {
    this.past = [];
    this.future = [];
  }
}
