// Playtest (spec 12, D126–D132): runs the engine on a snapshot of the in-memory
// project in the playtest area. DOM-free: the playtest area mounts the canvas for the current run
// and hands the engine's session back with `attach`; Node tests build the session
// themselves through `createSession`.
import { DEBUG_OFF, type DebugFlags, type GameState, type Session, type SessionStart, type TraceEvent } from "@questforge/engine";
import { hasBlockingErrors, type Project, type SceneFile } from "@questforge/schema";
import type { Editor } from "../editor.ts";
import { sameContent } from "../history.ts";
import type { WorkspaceState } from "../workspace.ts";
import { dialogueContext } from "../dialogue/context.ts";
import { droppedNotice, PresetStore, sanitizeState } from "./presets.ts";

/** Where a run began; Restart goes back here (D128, D132). */
export type RunOrigin =
  | { kind: "game" }
  | { kind: "here"; scene: string; spawn: string }
  /** Play from this node (D142): the dialogue's scene, then the dialogue at the node. */
  | { kind: "node"; dialogue: string; node: string; scene: string; spawn: string }
  | { kind: "preset"; name: string; state: GameState };

/** One launch of the engine: the project it plays and how its session starts. */
export interface Run {
  /** Changes on every launch, so the playtest area remounts the game. */
  readonly id: number;
  readonly project: Project;
  readonly start: SessionStart;
  readonly origin: RunOrigin;
}

export interface PlaytestOptions {
  /** Builds the session at once (Node tests). Without it the area's canvas calls `attach`. */
  createSession?(run: Run, hooks: { trace: (e: TraceEvent) => void; restart: () => void }): Session;
}

/** The spawn Play from here uses (D132): the selected spawn in that scene, else `default`, else the first. */
export function hereSpawn(scene: SceneFile, selected: string | null): string | null {
  if (selected && scene.spawns[selected]) return selected;
  if (scene.spawns.default) return "default";
  return Object.keys(scene.spawns)[0] ?? null;
}

function startOf(origin: RunOrigin): SessionStart {
  switch (origin.kind) {
    case "game":
      return {};
    case "here":
      return { scene: origin.scene, spawn: origin.spawn };
    case "node":
      // A Start node plays the dialogue from its beginning.
      return { scene: origin.scene, spawn: origin.spawn, dialogue: { id: origin.dialogue, node: origin.node } };
    case "preset":
      return { state: origin.state };
  }
}

export class Playtest {
  private _run: Run | null = null;
  private _session: Session | null = null;
  private nextId = 1;
  /** Engine trace events of the current run; the event log formats them (D129). */
  readonly events: TraceEvent[] = [];
  /** Turned-on debug layers (D132). The game view passes this object to the engine, which reads it each frame. */
  readonly debug: DebugFlags = { ...DEBUG_OFF };
  /** Named state snapshots in `.editor/presets.json` (D126). */
  readonly presets = new PresetStore();

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

  /** The node Play from this node would use: the selected dialogue node, in its scene context (D142). */
  nodeTarget(): { dialogue: string; node: string; scene: string; spawn: string } | null {
    const sel = this.ws.selection;
    if (sel?.kind !== "dialogueNode") return null;
    const d = this.editor.project.dialogues.find((x) => x.data.id === sel.dialogue)?.data;
    if (!d?.nodes.some((n) => n.id === sel.node)) return null;
    const ctx = dialogueContext(this.editor.project, sel.dialogue);
    return ctx ? { dialogue: sel.dialogue, node: sel.node, scene: ctx.scene, spawn: ctx.spawn } : null;
  }

  /** Play from this node (spec 11): the selected node's dialogue, in its scene (D142). */
  playNode(): boolean {
    const target = this.nodeTarget();
    return target ? this.launch({ kind: "node", ...target }) : false;
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

  /** Start from a saved preset (D126): IDs the project lost are dropped, with a notice. */
  playPreset(name: string): boolean {
    const preset = this.presets.find(name);
    return preset ? this.launch({ kind: "preset", name, state: preset.state }) : false;
  }

  /** Saves the running game's state as a preset ("Before cave"). */
  async savePreset(name: string): Promise<boolean> {
    if (!this._session || !name.trim()) return false;
    await this.presets.save(name, this._session.state);
    return true;
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

  /** The playtest area's game for `run` has loaded; ignored if a newer run replaced it. */
  attach(run: Run, session: Session) {
    if (this._run !== run) return;
    this._session = session;
    this.changed();
  }

  /** The hooks a session for the current run needs (the game view passes them to createGame). */
  hooks(run: Run) {
    return {
      trace: (e: TraceEvent) => {
        if (this._run !== run) return;
        this.events.push(e);
        // The log shows the last 500 lines (D132); keep plenty of events for them.
        if (this.events.length > 5000) this.events.splice(0, 1000);
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
    this.ws.showProblems();
    this.editor.showNotice({ kind: "error", text: `Fix ${errors.length === 1 ? "the error" : `the ${errors.length} errors`} in Problems before playing.` });
    return false;
  }

  private launch(origin: RunOrigin, override?: SessionStart): boolean {
    if (!this.gate()) return false;
    const project = this.editor.project;
    let start: SessionStart = override ?? startOf(origin);
    // A saved state may name things the project no longer has (D126).
    if (start.state) {
      const { state, dropped } = sanitizeState(project, start.state);
      if (dropped.length) this.editor.showNotice({ kind: "info", text: droppedNotice(override ? "Restart scene" : `Preset "${origin.kind === "preset" ? origin.name : ""}"`, dropped) });
      start = { state };
    }
    const run: Run = { id: this.nextId++, project, start, origin };
    this._run = run;
    this._session = null;
    this.events.length = 0;
    if (this.options.createSession) this._session = this.options.createSession(run, this.hooks(run));
    this.changed();
    return true;
  }
}
