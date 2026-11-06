// Playtest (spec 12, D126–D132): runs the engine on a snapshot of the in-memory
// project in the Dock. DOM-free: the Dock mounts the canvas for the current run
// and hands the engine's session back with `attach`; Node tests build the session
// themselves through `createSession`.
import { cloneState, DEBUG_OFF, type DebugFlags, type GameState, type Session, type SessionStart, type TraceEvent } from "@questforge/engine";
import { hasBlockingErrors, type Project, type SceneFile } from "@questforge/schema";
import type { Editor } from "../editor.ts";
import { sameContent } from "../history.ts";
import type { WorkspaceState } from "../workspace.ts";

/** Where a run began; Restart goes back here (D128, D132). */
export type RunOrigin =
  | { kind: "game" }
  | { kind: "here"; scene: string; spawn: string }
  | { kind: "preset"; name: string; state: GameState };

/** One launch of the engine: the project it plays and how its session starts. */
export interface Run {
  /** Changes on every launch, so the Dock remounts the game. */
  readonly id: number;
  readonly project: Project;
  readonly start: SessionStart;
  readonly origin: RunOrigin;
}

export interface PlaytestOptions {
  /** Builds the session at once (Node tests). Without it the Dock's canvas calls `attach`. */
  createSession?(run: Run, hooks: { trace: (e: TraceEvent) => void; restart: () => void }): Session;
}

/** The spawn Play from here uses (D132): the selected spawn in that scene, else `default`, else the first. */
export function hereSpawn(scene: SceneFile, selected: string | null): string | null {
  if (selected && scene.spawns[selected]) return selected;
  if (scene.spawns.default) return "default";
  return Object.keys(scene.spawns)[0] ?? null;
}

export class Playtest {
  private _run: Run | null = null;
  private _session: Session | null = null;
  private nextId = 1;
  /** Engine trace events of the current run; the event log formats them (D129). */
  readonly events: TraceEvent[] = [];
  /** Turned-on debug layers (D132). The Dock passes this object to the engine, which reads it each frame. */
  readonly debug: DebugFlags = { ...DEBUG_OFF };

  private _version = 0;
  private listeners = new Set<() => void>();
  get version() {
    return this._version;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  /** Something changed (a run, the session's state, the log); the panels re-render. */
  changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  constructor(
    private readonly editor: Editor,
    private readonly ws: WorkspaceState,
    private readonly options: PlaytestOptions = {},
  ) {}

  get run(): Run | null {
    return this._run;
  }
  /** The running game's session, once its first scene has loaded. */
  get session(): Session | null {
    return this._session;
  }
  get playing(): boolean {
    return this._run !== null;
  }
  /** The project changed since this run started: "Restart scene to apply" (D128). */
  get stale(): boolean {
    return !!this._run && !sameContent(this._run.project, this.editor.project);
  }

  /** The scene Play from here would use, or null when it is disabled (no scene tab, D132). */
  hereTarget(): { scene: string; spawn: string } | null {
    const id = this.ws.activeScene;
    const scene = id ? this.editor.project.scenes.find((s) => s.data.id === id)?.data : undefined;
    if (!scene) return null;
    const sel = this.ws.selection;
    const selected = sel?.kind === "sceneThing" && sel.scene === scene.id && sel.list === "spawns" ? sel.key : null;
    const spawn = hereSpawn(scene, selected);
    return spawn ? { scene: scene.id, spawn } : null;
  }

  /** Play (F5): from the game start. */
  play(): boolean {
    return this.launch({ kind: "game" });
  }

  /** Play from here (F6): the active scene at the selected (or default) spawn. */
  playHere(): boolean {
    const here = this.hereTarget();
    return here ? this.launch({ kind: "here", ...here }) : false;
  }

  /** Start from a state (a preset, D126). The caller has already dropped stale IDs. */
  playState(name: string, state: GameState): boolean {
    return this.launch({ kind: "preset", name, state: cloneState(state) });
  }

  /** Restart: the run's original start, with the current project (D128, D132). */
  restart(): boolean {
    return this._run ? this.launch(this._run.origin) : false;
  }

  /** Restart scene: the current project, back to the state as this scene was entered (D128). */
  restartScene(): boolean {
    const run = this._run;
    const session = this._session;
    if (!run || !session) return false;
    const project = this.editor.project;
    const { state, spawn } = session.entry;
    const scene = project.scenes.find((s) => s.data.id === state.scene)?.data;
    // The scene was deleted: start over instead.
    if (!scene) return this.launch(run.origin);
    const at = spawn ? scene.spawns[spawn] : undefined;
    if (at) state.player = { x: at.x, y: at.y, facing: at.facing };
    return this.launch(run.origin, { state });
  }

  stop() {
    if (!this._run) return;
    this._run = null;
    this._session = null;
    this.changed();
  }

  /** The Dock's game for `run` has loaded; ignored if a newer run replaced it. */
  attach(run: Run, session: Session) {
    if (this._run !== run) return;
    this._session = session;
    this.changed();
  }

  /** The hooks a session for the current run needs (the Dock passes them to createGame). */
  hooks(run: Run) {
    return {
      trace: (e: TraceEvent) => {
        if (this._run !== run) return;
        this.events.push(e);
        this.changed();
      },
      restart: () => {
        if (this._run === run) this.restart();
      },
    };
  }

  /** Validation errors block playtest and open Problems instead (D38). */
  private gate(): boolean {
    this.editor.validateNow();
    const errors = this.editor.problems.filter((p) => p.severity === "error");
    if (!hasBlockingErrors(this.editor.problems)) return true;
    this.ws.showDock("problems");
    this.editor.showNotice({ kind: "error", text: `Fix ${errors.length === 1 ? "the error" : `the ${errors.length} errors`} in Problems before playing.` });
    return false;
  }

  private launch(origin: RunOrigin, override?: SessionStart): boolean {
    if (!this.gate()) return false;
    const start: SessionStart = override ?? (origin.kind === "game" ? {} : origin.kind === "here" ? { scene: origin.scene, spawn: origin.spawn } : { state: origin.state });
    const run: Run = { id: this.nextId++, project: this.editor.project, start, origin };
    this._run = run;
    this._session = null;
    this.events.length = 0;
    if (this.options.createSession) this._session = this.options.createSession(run, this.hooks(run));
    this.ws.showDock("playtest");
    this.changed();
    return true;
  }
}
