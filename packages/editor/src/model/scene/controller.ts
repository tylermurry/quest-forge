// The scene canvas's input logic (spec 09), DOM-free like the engine's world.ts:
// pointer and key input in, zoom/pan, selection, tool gestures and editor commands
// out. The canvas component forwards events and draws `frame()`.
import { sceneDrawables, type ActorPose, type ImageLookup, type Vec } from "@questforge/engine";
import type { CharacterFile, Project, SceneFile } from "@questforge/schema";
import type { Editor } from "../editor.ts";
import type { WorkspaceState } from "../workspace.ts";
import type { Frame, Sprite } from "./frame.ts";
import type { Layer, SceneUi, Tool } from "./sceneUi.ts";
import type { DeleteWarning } from "../actions.ts";
import { CommandError, describeReferences, sceneThingReferences, summarizeReferences } from "../commands.ts";
import { deleteThing, thingNoun } from "./commands.ts";
import { sameThing, type ThingRef } from "./things.ts";
import { panBy, toScene, transformFor, zoomByWheel, zoomStep, zoomTo, type Size, type Transform } from "./view.ts";

/** A pointer event as the controller sees it (screen = CSS px inside the canvas). */
export interface PointerInput {
  screen: Vec;
  button: number;
  alt?: boolean;
  shift?: boolean;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod?: boolean;
  /** Click count (2 for a double-click). */
  clicks?: number;
}

export interface WheelInput {
  screen: Vec;
  dx: number;
  dy: number;
  /** A pinch on a trackpad arrives as a ctrl-wheel. */
  zoom: boolean;
}

export interface SceneHost {
  editor: Editor;
  ws: WorkspaceState;
  scene: string;
  images: ImageLookup;
}

/** Actor IDs for preview-only characters such as the depth ghost; never a real ID (IDs are slugs). */
export const GHOST = "ghost:";

type Gesture = { kind: "pan"; last: Vec } | null;

export class SceneController {
  private size: Size = { w: 640, h: 400 };
  private gesture: Gesture = null;
  private spaceHeld = false;
  /** Last pointer position in scene space (fractional), null when outside the canvas. */
  hover: Vec | null = null;

  private _version = 0;
  private listeners = new Set<() => void>();

  constructor(readonly host: SceneHost) {}

  get version() {
    return this._version;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  /** Something only the canvas shows changed (hover, a drag in progress). */
  protected changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  get sceneId() {
    return this.host.scene;
  }
  get editor() {
    return this.host.editor;
  }
  get ui(): SceneUi {
    return this.host.ws.sceneUi.get(this.host.scene);
  }
  /** The scene as saved in the project (no gesture in progress). */
  get savedScene(): SceneFile | undefined {
    return this.editor.project.scenes.find((s) => s.data.id === this.host.scene)?.data;
  }
  /** The scene as drawn: including a drag that isn't committed yet. */
  get scene(): SceneFile | undefined {
    if (this.draft) return this.draft.project.scenes.find((s) => s.data.id === this.host.scene)?.data;
    return this.savedScene;
  }

  // ── Drafts: a gesture in progress, committed as one undo step on release (D84) ──

  private draft: { label: string; run: (p: Project) => Project; project: Project } | null = null;

  /** Shows the result of `run` without recording it. A refused command keeps the last preview. */
  protected preview(label: string, run: (p: Project) => Project) {
    try {
      this.draft = { label, run, project: run(this.editor.project) };
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
    }
  }

  /** Records the previewed change as one step, if it changed anything. */
  protected commit() {
    const d = this.draft;
    this.draft = null;
    if (!d) return;
    const before = JSON.stringify(this.savedScene);
    const after = JSON.stringify(d.project.scenes.find((s) => s.data.id === this.host.scene)?.data);
    if (before !== after) this.editor.apply(d.label, d.run);
    this.changed();
  }

  /** Drops the previewed change. */
  protected discard() {
    if (!this.draft) return;
    this.draft = null;
    this.changed();
  }

  get dragging() {
    return this.draft !== null;
  }
  get selection(): ThingRef | null {
    const s = this.host.ws.selection;
    return s?.kind === "sceneThing" && s.scene === this.host.scene ? { list: s.list, key: s.key } : null;
  }

  setLayer(layer: Layer) {
    if (layer === this.ui.layer) return;
    this.cancel();
    this.host.ws.sceneUi.setLayer(this.host.scene, layer);
  }

  setTool(tool: Tool) {
    if (tool !== this.ui.tool) this.cancel();
    this.host.ws.sceneUi.setTool(this.host.scene, tool);
  }

  toggleSnap() {
    this.host.ws.sceneUi.update(this.host.scene, (u) => ({ ...u, snap: !u.snap }));
  }

  /** Ends whatever's in progress (Escape); with nothing in progress, clears the selection. */
  cancel() {}

  setSize(size: Size) {
    if (size.w === this.size.w && size.h === this.size.h) return;
    this.size = size;
    this.changed();
  }
  get canvasSize() {
    return this.size;
  }
  get transform(): Transform {
    return transformFor(this.ui.zoom, this.size);
  }
  private setZoom(zoom: SceneUi["zoom"]) {
    this.host.ws.sceneUi.setZoom(this.host.scene, zoom);
  }

  // ── Zoom and pan (spec 09) ──────────────────────────────────────────────────

  zoomIn() {
    this.setZoom(zoomStep(this.transform, this.size, 1, this.hoverScreen() ?? undefined));
  }
  zoomOut() {
    this.setZoom(zoomStep(this.transform, this.size, -1, this.hoverScreen() ?? undefined));
  }
  zoomFit() {
    this.setZoom({ fit: true });
  }
  zoomActual() {
    this.setZoom(zoomTo(this.size, 1));
  }
  private hoverScreen(): Vec | null {
    if (!this.hover) return null;
    const t = this.transform;
    return [t.x + this.hover[0] * t.scale, t.y + this.hover[1] * t.scale];
  }

  /** Two-finger scroll pans; pinch (ctrl-wheel) zooms around the pointer. */
  wheel(e: WheelInput) {
    if (e.zoom) this.setZoom(zoomByWheel(this.transform, e.dy, e.screen));
    else this.setZoom(panBy(this.transform, -e.dx, -e.dy));
  }

  /** Space held: dragging pans (spec 09). */
  setSpace(held: boolean) {
    if (this.spaceHeld === held) return;
    this.spaceHeld = held;
    this.changed();
  }
  /** CSS cursor for the canvas. */
  get cursor(): string {
    return this.ui.tool === "select" ? "default" : "crosshair";
  }

  get panning() {
    return this.spaceHeld || this.gesture?.kind === "pan";
  }

  // ── Pointer ─────────────────────────────────────────────────────────────────

  pointerDown(e: PointerInput) {
    this.hover = toScene(this.transform, e.screen);
    if (this.spaceHeld || e.button === 1) {
      this.gesture = { kind: "pan", last: e.screen };
      this.changed();
      return;
    }
    this.toolDown(e);
  }

  pointerMove(e: PointerInput) {
    this.hover = toScene(this.transform, e.screen);
    const g = this.gesture;
    if (g?.kind === "pan") {
      this.setZoom(panBy(this.transform, e.screen[0] - g.last[0], e.screen[1] - g.last[1]));
      this.gesture = { kind: "pan", last: e.screen };
      return;
    }
    this.toolMove(e);
    this.changed();
  }

  pointerUp(e: PointerInput) {
    if (this.gesture?.kind === "pan") {
      this.gesture = null;
      this.changed();
      return;
    }
    this.toolUp(e);
    this.changed();
  }

  pointerLeave() {
    this.hover = null;
    this.changed();
  }

  // Tool gestures arrive in later tickets.
  protected toolDown(_e: PointerInput) {}
  protected toolMove(_e: PointerInput) {}
  protected toolUp(_e: PointerInput) {}

  select(ref: ThingRef | null) {
    if (ref) this.host.ws.select({ kind: "sceneThing", scene: this.host.scene, ...ref });
    else this.host.ws.select({ kind: "entry", section: "scene", id: this.host.scene });
  }

  // ── Deleting ────────────────────────────────────────────────────────────────

  /** What a delete would break (objects and spawns can be referenced by rules), for the confirm dialog. */
  deleteWarning(ref: ThingRef): DeleteWarning | null {
    if (ref.list !== "objects" && ref.list !== "spawns") return null;
    const kind = ref.list === "spawns" ? "spawn" : "object";
    const refs = sceneThingReferences(this.editor.project, this.sceneId, kind, ref.key);
    const summary = summarizeReferences(refs);
    return summary ? { title: `Delete ${thingNoun(ref)} ${ref.key}?`, summary, lines: describeReferences(this.editor.project, refs) } : null;
  }

  canDelete(ref: ThingRef | null = this.selection): boolean {
    return !!ref && ref.list !== "depth" && ref.list !== "background";
  }

  /** Deletes a thing as one undo step; the selection moves to the scene. */
  deleteThing(ref: ThingRef): boolean {
    const ok = this.editor.apply(`Delete ${thingNoun(ref)}`, (p) => deleteThing(p, this.sceneId, ref));
    if (ok && sameThing(this.selection, ref)) this.select(null);
    return ok;
  }

  // ── Frame ───────────────────────────────────────────────────────────────────

  protected characters(): Map<string, CharacterFile> {
    return new Map(this.editor.project.characters.map((c) => [c.data.id, c.data]));
  }

  /** Placed characters as actors standing idle (D60). */
  protected placedActors(scene: SceneFile): ActorPose[] {
    const chars = this.characters();
    return scene.characters.flatMap((c) => {
      const character = chars.get(c.character);
      return character ? [{ id: c.character, character, pos: [c.x, c.y] as Vec, facing: c.facing, kind: "idle" as const, animTime: 0 }] : [];
    });
  }

  /** Sprites back to front, with `ghosts` (IDs starting `ghost:`) sorted in by their feet (D105). */
  protected sprites(scene: SceneFile, ghosts: ActorPose[] = []): Sprite[] {
    const hiddenChars = new Set(scene.characters.filter((c) => !c.visible).map((c) => c.character));
    const hiddenObjects = new Set(scene.objects.filter((o) => !o.visible).map((o) => o.id));
    const list = sceneDrawables(scene, this.host.images, () => true, [...this.placedActors(scene), ...ghosts]);
    return list.map((d) => {
      const ghost = d.kind === "character" && d.id.startsWith(GHOST);
      const hidden = d.kind === "object" ? hiddenObjects.has(d.id) : hiddenChars.has(d.id);
      return { d, alpha: ghost ? 0.75 : hidden ? 0.35 : 1, ...(ghost && { ghost }) };
    });
  }

  frame(): Frame | null {
    const scene = this.scene;
    if (!scene) return null;
    return {
      scene,
      ui: this.ui,
      t: this.transform,
      images: this.host.images,
      sprites: this.sprites(scene),
      selection: this.selection,
      invalid: new Set(),
      drawing: null,
      snap: null,
      crosshair: null,
      path: null,
    };
  }
}
