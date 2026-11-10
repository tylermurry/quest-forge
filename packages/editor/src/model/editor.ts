// One open project: its data, undo history, autosave and reaction to outside
// changes (spec 08, D21, D84, D85). DOM-free; React subscribes to it.
import {
  KEEP_FILE,
  ROOT_FILES,
  SaveError,
  TRASH_DIR,
  classify,
  isHidden,
  loadProject,
  saveProject,
  sectionOfFolder,
  validateProject,
  type Problem,
  type Project,
  type ProjectFs,
} from "@questforge/schema";
import { CommandError } from "./commands.ts";
import { History, withDiskState } from "./history.ts";

/** Autosave runs this long after the last change (spec 08). */
export const AUTOSAVE_DELAY_MS = 1000;
/** Waits between retries of a failed save (D85); the last one repeats. */
const RETRY_DELAYS_MS = [2000, 5000, 10000];
/** Watcher events are gathered this long before the disk is checked. */
export const WATCH_SETTLE_MS = 200;
/** Validation runs this long after the last change (D120). */
export const VALIDATE_DELAY_MS = 250;

/** How a project is opened. The app saves by hand (D145); tests and tools can keep autosave on. */
export interface EditorOptions {
  /** Save about AUTOSAVE_DELAY_MS after the last change. Default true. */
  autosave?: boolean;
}

export type SaveStatus =
  | { state: "saved" }
  | { state: "unsaved" }
  | { state: "saving" }
  | { state: "error"; message: string };

/** Something the editor tells the user once, e.g. after a reload. */
export interface Notice {
  kind: "info" | "error";
  text: string;
}

/** Where the project's files come from, and (if it can) how to hear about outside changes. */
export interface ProjectHost {
  fs: ProjectFs;
  /** Calls back with changed paths (project-relative). Returns a stop function. */
  watch?(onChange: (paths: string[]) => void): () => void;
}

/** Plain-English reason a save failed (D85). */
export function describeSaveError(e: unknown): string {
  if (e instanceof SaveError) return `some data is invalid (${e.problems[0]?.breadcrumb ?? "unknown"}: ${e.problems[0]?.message ?? ""})`;
  const text = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string } | null)?.code ?? text;
  if (/EACCES|EPERM|EROFS|read-only|permission denied/i.test(code) || /read-only|permission denied/i.test(text)) return "the project folder is read-only";
  if (/ENOSPC|disk full|no space/i.test(code) || /no space|disk full/i.test(text)) return "the disk is full";
  if (/ENOENT|not found|no such file/i.test(code) || /no such file|not found/i.test(text)) return "the project folder can't be found (was it moved or deleted?)";
  return text;
}

export class Editor {
  private _project: Project;
  private _loadProblems: Problem[];
  private _status: SaveStatus = { state: "saved" };
  private _notice: Notice | null = null;
  /** The last validation result; the canvas, Inspector and Problems panel all read it (D120). */
  private _problems: Problem[] = [];
  private validatedFor: Project | null = null;
  private validateTimer: ReturnType<typeof setTimeout> | null = null;
  readonly history = new History();

  /** Bumped on every change; React reads it through useSyncExternalStore. */
  private _version = 0;
  private listeners = new Set<() => void>();

  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private failures = 0;
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  private changedDuringSave = false;
  private stopWatching: (() => void) | null = null;
  private disposed = false;
  /** Text of files that failed to load, so an outside fix is noticed but our saves aren't. */
  private brokenTexts = new Map<string, string>();

  private readonly autosave: boolean;
  /** An outside change was noticed while unsaved edits were waiting (manual save only). */
  private outsideWhileDirty = false;

  private constructor(
    readonly host: ProjectHost,
    loaded: { project: Project; problems: Problem[] },
    options: EditorOptions = {},
  ) {
    this.autosave = options.autosave ?? true;
    this._project = loaded.project;
    this._loadProblems = loaded.problems;
    this.stopWatching = host.watch?.((paths) => this.onDiskChange(paths)) ?? null;
    this.validateNow();
  }

  /** Opens a project folder. The trash from the last session is emptied first (D88). */
  static async open(host: ProjectHost, options?: EditorOptions): Promise<Editor> {
    await host.fs.removeTree(TRASH_DIR);
    const editor = new Editor(host, await loadProject(host.fs), options);
    await editor.readBroken();
    return editor;
  }

  private async readBroken() {
    this.brokenTexts.clear();
    for (const file of new Set(this._loadProblems.map((p) => p.location.file))) {
      const text = await this.host.fs.readText(file).catch(() => null);
      if (text !== null) this.brokenTexts.set(file, text);
    }
  }

  get project() {
    return this._project;
  }
  get version() {
    return this._version;
  }
  get status() {
    return this._status;
  }
  get notice() {
    return this._notice;
  }
  /** Files that couldn't be loaded (they're left untouched on disk). */
  get loadProblems() {
    return this._loadProblems;
  }
  /**
   * Load problems plus validation of the project as it was at most VALIDATE_DELAY_MS
   * ago: validation runs once typing or dragging pauses, not on every change (D120).
   */
  get problems(): Problem[] {
    return this._problems;
  }
  /** True while a change hasn't been validated yet. */
  get validationPending() {
    return this.validatedFor !== this._project;
  }

  /** Validates the current project now (also used by tests instead of waiting). */
  validateNow() {
    if (this.validateTimer) clearTimeout(this.validateTimer);
    this.validateTimer = null;
    if (this.validatedFor === this._project) return;
    this.validatedFor = this._project;
    this._problems = [...this._loadProblems, ...validateProject(this._project)];
    this.changed();
  }

  private scheduleValidate() {
    if (this.disposed) return;
    if (this.validateTimer) clearTimeout(this.validateTimer);
    this.validateTimer = setTimeout(() => this.validateNow(), VALIDATE_DELAY_MS);
  }
  get hasUnsavedChanges() {
    return this.dirty || this._status.state === "saving";
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  private setStatus(status: SaveStatus) {
    this._status = status;
    this.changed();
  }

  dismissNotice() {
    this._notice = null;
    this.changed();
  }

  showNotice(notice: Notice) {
    this._notice = notice;
    this.changed();
  }

  /**
   * Runs a command as one undo step (D84). A CommandError becomes a notice and
   * changes nothing. Returns whether the project changed.
   */
  apply(label: string, command: (p: Project) => Project, mergeKey?: string): boolean {
    let next: Project;
    try {
      next = command(this._project);
    } catch (e) {
      if (e instanceof CommandError) {
        this.showNotice({ kind: "error", text: e.message });
        return false;
      }
      throw e;
    }
    if (next === this._project) return false;
    this.history.record(this._project, label, mergeKey);
    this.replace(next);
    return true;
  }

  /** Like `apply`, for commands that also return a value (e.g. a new ID). */
  applyWith<T>(label: string, command: (p: Project) => { project: Project } & T): T | null {
    let out: ({ project: Project } & T) | null = null;
    const ok = this.apply(label, (p) => {
      out = command(p);
      return out.project;
    });
    return ok ? out : null;
  }

  undo() {
    const p = this.history.undo(this._project);
    if (p) this.replace(p);
  }

  redo() {
    const p = this.history.redo(this._project);
    if (p) this.replace(p);
  }

  private replace(next: Project) {
    this._project = next;
    this.dirty = true;
    this.failures = 0;
    this._status = { state: "unsaved" };
    if (this.autosave) this.scheduleSave(AUTOSAVE_DELAY_MS);
    this.scheduleValidate();
    this.changed();
  }

  // ── Saving (autosave, or by hand with `flush`, D145) ───────────────────────────────────────────────────────────────

  private scheduleSave(delay: number) {
    if (this.disposed) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, delay);
  }

  /** Saves now (and waits for any save already running). */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    while (this.saving) await this.saving;
    if (this.dirty) await this.save();
  }

  private save(): Promise<void> {
    if (this.saving) {
      // A save is running; go again once it finishes.
      return this.saving.then(() => (this.dirty ? this.save() : undefined));
    }
    if (!this.dirty || this.disposed) return Promise.resolve();
    const started = this._project;
    this.dirty = false;
    this.setStatus({ state: "saving" });
    this.saving = (async () => {
      try {
        const { project: saved } = await saveProject(this.host.fs, started);
        this.failures = 0;
        // Edits made during the save keep their content; disk state comes from the save.
        const wasValidated = this.validatedFor === this._project;
        this._project = this._project === started ? saved : withDiskState(this._project, saved);
        // A save only moves disk state, which validation sees after the save too (filesAfterSave).
        if (wasValidated) this.validatedFor = this._project;
        else this.scheduleValidate();
        this._status = this.dirty ? { state: "unsaved" } : { state: "saved" };
        if (this.dirty && this.autosave) this.scheduleSave(AUTOSAVE_DELAY_MS);
      } catch (e) {
        this.dirty = true;
        const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length - 1)]!;
        this.failures++;
        this._status = {
          state: "error",
          message: `Couldn't save: ${describeSaveError(e)}. Your changes are kept${this.autosave ? `; trying again in ${delay / 1000} s` : ". Fix the problem and save again"}.`,
        };
        if (this.autosave && !(e instanceof SaveError)) this.scheduleSave(delay);
      } finally {
        this.saving = null;
        this.changed();
      }
      if (this.changedDuringSave) {
        this.changedDuringSave = false;
        this.scheduleWatchCheck();
      }
    })();
    return this.saving;
  }

  // ── Outside changes (D85) ──────────────────────────────────────────────────

  /** Called by the host's watcher. Our own writes are recognized by content and ignored. */
  onDiskChange(paths: string[]) {
    if (this.disposed) return;
    if (paths.length && paths.every((p) => isHidden(p) && !p.endsWith(`/${KEEP_FILE}`))) return;
    if (this.saving) {
      this.changedDuringSave = true;
      return;
    }
    this.scheduleWatchCheck();
  }

  private scheduleWatchCheck() {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      void this.checkDisk();
    }, WATCH_SETTLE_MS);
  }

  /** Whether the disk still matches what the editor last loaded or saved. */
  async diskMatches(): Promise<boolean> {
    const { fs } = this.host;
    const p = this._project;
    const files = await fs.list();
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (!same(files, [...p.files].sort())) return false;
    const folders = (await fs.listFolders()).filter((f) => sectionOfFolder(f) !== null);
    if (!same(folders.sort(), [...p.savedFolders].sort())) return false;
    for (const f of files) {
      if (!classify(f)) continue;
      const text = await fs.readText(f).catch(() => null);
      if (text !== (p.saved[f] ?? this.brokenTexts.get(f) ?? null)) return false;
    }
    return true;
  }

  private async checkDisk() {
    if (this.disposed) return;
    if (this.saving) {
      this.changedDuringSave = true;
      return;
    }
    if (await this.diskMatches()) {
      this.outsideWhileDirty = false;
      return;
    }
    if (!this.autosave && this.dirty) {
      // Unsaved edits could be a lot of work: keep them and say so once instead of reloading (D145).
      if (!this.outsideWhileDirty) {
        this.outsideWhileDirty = true;
        this.showNotice({ kind: "error", text: "Files changed on disk outside the editor. Your unsaved changes were kept: saving will overwrite those outside changes." });
      }
      return;
    }
    await this.reload("outside");
  }

  /** Reloads from disk, dropping history and unsaved edits (D85). */
  async reload(reason: "outside" | "user" = "user") {
    const lost = this.dirty;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const loaded = await loadProject(this.host.fs);
    this._project = loaded.project;
    this._loadProblems = loaded.problems;
    await this.readBroken();
    this.dirty = false;
    this.outsideWhileDirty = false;
    this.failures = 0;
    this.history.clear();
    this._status = { state: "saved" };
    this.validatedFor = null;
    this.validateNow();
    if (reason === "outside") {
      this._notice = {
        kind: "info",
        text: `Files changed on disk outside the editor, so the project was reloaded.${lost ? " Your last unsaved change was discarded." : ""} Undo history was cleared.`,
      };
    }
    this.changed();
  }

  dispose() {
    this.disposed = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.watchTimer) clearTimeout(this.watchTimer);
    if (this.validateTimer) clearTimeout(this.validateTimer);
    this.stopWatching?.();
  }
}

/** The project's display title. */
export const projectTitle = (p: Project) => p.game?.data.title ?? ROOT_FILES.game;
