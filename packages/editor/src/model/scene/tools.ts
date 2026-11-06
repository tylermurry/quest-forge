// Tool gestures on the scene canvas (spec 09): Select/Move, Polygon, Rectangle,
// Spawn point, Walk-to point. DOM-free; tested in Node by feeding pointer input.
import { facingFor, type Vec } from "@questforge/engine";
import { polygonIssue, type Facing, type Point } from "@questforge/schema";
import {
  addSpawn,
  createShape,
  DRAW_LABEL,
  deleteVertex,
  type DrawTarget,
  insertVertex,
  moveCharacter,
  moveObject,
  movePolygon,
  moveSpawn,
  moveVertex,
  placeCharacter,
  placeImage,
  reorderObject,
  sceneOf,
  setBaseline,
  setDepthY,
  setWalkTo,
  thingNoun,
} from "./commands.ts";
import { SceneController, type PointerInput } from "./controller.ts";
import type { Frame } from "./frame.ts";
import { hitTest, VERTEX_PX, type Hit } from "./hit.ts";
import { snapPoint } from "./snap.ts";
import { drawOrderWithBaselines, LIST_LAYER, type ThingRef } from "./things.ts";
import { snapPixel, toScene } from "./view.ts";

/** A Select/Move drag in progress. */
type Move = { hit: Hit; start: Vec };

/** Placing a spawn or walk-to point: press places it, dragging away sets the facing. */
type Place = { kind: "spawn" | "walkto"; at: Point; hotspot?: string };

/** A polygon being drawn, point by point. Not in history until it closes (D84). */
type Drawing = { points: Point[]; target: DrawTarget };

export class SceneTools extends SceneController {
  private move: Move | null = null;
  /** What the cursor is over (for the cursor shape). */
  private hoverHit: Hit | null = null;
  /** Where the last point snapped to a vertex or edge, for the snap ring (D102). */
  protected snapMark: Point | null = null;

  private drawing: Drawing | null = null;
  private place: Place | null = null;
  /** Rectangle-to-polygon drag in progress (spec 09). */
  private rect: { start: Point; end: Point; target: DrawTarget } | null = null;
  /** Where the next point would go (snapped), for the rubber band. */
  private cursorPoint: Point | null = null;

  /** A polygon is being drawn (not in history until it closes, D84). */
  get isDrawing(): boolean {
    return this.drawing !== null || this.rect !== null;
  }

  /** What a polygon drawn now would become (D104), or why nothing can be drawn. */
  drawTarget(): DrawTarget | string {
    const scene = this.scene;
    if (!scene) return "There's no scene.";
    const layer = this.ui.layer;
    if (this.ui.locked.includes(layer)) return `The ${layer} layer is locked.`;
    if (this.ui.hidden.includes(layer)) return `The ${layer} layer is hidden.`;
    switch (layer) {
      case "walkable":
        return scene.walkable.outer.length ? { kind: "hole" } : { kind: "outline" };
      case "hotspots":
        return { kind: "hotspot" };
      case "regions":
        return { kind: "region" };
      case "objects": {
        const sel = this.selection;
        if (sel?.list === "objects") return { kind: "obstacle", object: sel.key };
        return "Select an object first, then draw its obstacle.";
      }
      default:
        return "Shapes can't be drawn on this layer.";
    }
  }

  /** One line of help for the toolbar. */
  get hint(): string {
    const ui = this.ui;
    if (ui.tool === "polygon" || ui.tool === "rect") {
      const target = this.drawTarget();
      if (typeof target === "string") return target;
      const what = { outline: "the walkable outline", hole: "a hole", hotspot: "a new hotspot", region: "a new region", obstacle: "the obstacle" }[target.kind];
      if (ui.tool === "rect") return `Drag to draw ${what}`;
      if (this.drawing) return `Click to add points · double-click, Enter or click the first point to close · Backspace undoes a point · Esc cancels`;
      return `Click to start ${what}`;
    }
    if (ui.tool === "spawn") return "Click to add a spawn point · drag from it to set which way the player faces";
    if (ui.tool === "walkto") {
      if (this.selection?.list === "hotspots") return "Click where the player stands to use this hotspot · drag to set the facing";
      return "Click a hotspot to choose it, then click where the player should stand";
    }
    if (ui.tool === "select") {
      if (this.selection && this.hasVertices(this.selection)) return "Drag a point to move it · Alt-click a point to delete it · double-click an edge to add one";
      return "Click to select · drag to move";
    }
    return "";
  }

  private hasVertices(ref: ThingRef) {
    return ref.list === "walkable" || ref.list === "hotspots" || ref.list === "regions" || (ref.list === "objects" && !!this.scene?.objects.find((o) => o.id === ref.key)?.obstacle);
  }

  override get cursor(): string {
    if (this.ui.tool !== "select") return "crosshair";
    if (this.move) return "grabbing";
    const h = this.hoverHit;
    if (!h) return "default";
    if (h.kind === "vertex") return "pointer";
    if (h.kind === "edge") return "copy";
    if (h.kind === "depth" || h.kind === "baseline") return "ns-resize";
    return "move";
  }

  /** Enter / double-click: close the polygon being drawn. */
  finish() {
    const d = this.drawing;
    if (!d) return;
    if (d.points.length < 3) {
      this.editor.showNotice({ kind: "error", text: "A shape needs at least 3 points." });
      return;
    }
    this.drawing = null;
    this.cursorPoint = null;
    this.create(d.target, d.points);
  }

  private create(target: DrawTarget, points: Point[]) {
    const id = this.sceneId;
    const made = this.editor.applyWith(DRAW_LABEL[target.kind], (p) => createShape(p, id, target, points));
    if (made) {
      this.select(made.ref);
      // New hotspots and regions get their name typed right away (D99).
      if (target.kind === "hotspot" || target.kind === "region") this.host.ws.requestFocus("name");
    }
    this.changed();
  }

  /** Backspace while drawing: remove the last point. */
  removeLastPoint() {
    const d = this.drawing;
    if (!d) return;
    d.points = d.points.slice(0, -1);
    if (d.points.length === 0) this.drawing = null;
    this.changed();
  }

  override abort(): boolean {
    if (this.drawing || this.rect) {
      this.drawing = null;
      this.rect = null;
      this.cursorPoint = null;
      this.changed();
      return true;
    }
    if (this.move || this.place) {
      this.move = null;
      this.place = null;
      this.snapMark = null;
      this.discard();
      return true;
    }
    return false;
  }

  override cancel() {
    if (!this.abort()) super.cancel();
  }

  // ── Objects layer (spec 09, D95, D106) ──────────────────────────────────────

  /** An image or character dragged from the browser and dropped at a screen point. */
  dropEntry(item: { section: string; id: string }, screen: Vec): boolean {
    const at = snapPixel(toScene(this.transform, screen));
    const id = this.sceneId;
    if (this.ui.locked.includes("objects")) {
      this.editor.showNotice({ kind: "error", text: "The Objects layer is locked." });
      return false;
    }
    if (item.section === "image") {
      const size = this.host.images(item.id)?.size;
      const made = this.editor.applyWith("Place object", (p) => placeImage(p, id, item.id, at, size));
      if (!made) return false;
      this.selectThing({ list: "objects", key: made.id });
      return true;
    }
    if (item.section === "character") {
      if (!this.editor.apply("Place character", (p) => placeCharacter(p, id, item.id, at))) return false;
      this.selectThing({ list: "characters", key: item.id });
      return true;
    }
    this.editor.showNotice({ kind: "error", text: "Only images and characters can be placed in a scene." });
    return false;
  }

  /**
   * Moves an object in the Objects list, which shows draw order front first (D95).
   * `frontIndex` is its new place in that list.
   */
  reorder(objectId: string, frontIndex: number): boolean {
    const scene = this.savedScene;
    if (!scene) return false;
    const order = drawOrderWithBaselines(scene, this.host.images);
    const n = order.length - 1; // without the moved object
    const backIndex = n - Math.max(0, Math.min(n, frontIndex));
    const id = this.sceneId;
    return this.editor.apply("Reorder object", (p) => reorderObject(p, id, objectId, order, backIndex));
  }

  /** Files dropped from the OS onto the canvas (D98). */
  dropFiles?(files: File[], screen: [number, number]): void;

  // ── Hit-testing ─────────────────────────────────────────────────────────────

  hit(p: Vec): Hit | null {
    const scene = this.scene;
    if (!scene) return null;
    return hitTest(p, { scene, ui: this.ui, scale: this.transform.scale, selection: this.selection, sprites: this.sprites(scene).map((s) => s.d) });
  }

  /** Selects a thing and makes its layer the active one, so its tools show. */
  selectThing(ref: ThingRef) {
    const layer = LIST_LAYER[ref.list];
    if (this.ui.layer !== layer) this.host.ws.sceneUi.update(this.sceneId, (u) => ({ ...u, layer, tool: "select" }));
    this.select(ref);
  }

  // ── Gestures ────────────────────────────────────────────────────────────────

  protected override toolDown(e: PointerInput) {
    if (e.button !== 0) return;
    const p = toScene(this.transform, e.screen);
    switch (this.ui.tool) {
      case "select":
        return this.selectDown(p, e);
      case "polygon":
        return this.polygonDown(p, e);
      case "rect":
        return this.rectDown(p);
      default:
        return this.pointToolDown(p);
    }
  }

  protected override toolMove(e: PointerInput) {
    const p = toScene(this.transform, e.screen);
    if (this.move) this.moveTo(p);
    else if (this.place) this.previewPlace(p);
    else if (this.rect) this.rect.end = this.snapDraw(p);
    else if (this.ui.tool === "polygon") this.cursorPoint = this.snapDraw(p);
    else if (this.ui.tool === "select") this.hoverHit = this.hit(p);
  }

  protected override toolUp(_e: PointerInput) {
    if (this.place) {
      const pl = this.place;
      this.place = null;
      const before = new Set(Object.keys(this.savedScene?.spawns ?? {}));
      this.commit();
      if (pl.kind === "spawn") {
        const added = Object.keys(this.savedScene?.spawns ?? {}).find((k) => !before.has(k));
        if (added) this.select({ list: "spawns", key: added });
      }
      return;
    }
    if (this.move) {
      this.move = null;
      this.snapMark = null;
      this.commit();
    } else if (this.rect) {
      const { start, end, target } = this.rect;
      this.rect = null;
      this.snapMark = null;
      if (start[0] !== end[0] && start[1] !== end[1]) {
        this.create(target, [start, [end[0], start[1]], end, [start[0], end[1]]]);
      }
    }
  }

  override pointerLeave() {
    this.cursorPoint = null;
    super.pointerLeave();
  }

  /** A drawing point: whole pixels, snapped to vertices/edges (and the shape's own points) when Snap is on. */
  private snapDraw(p: Vec): Point {
    const s = snapPoint(p, this.scene!, this.ui, this.transform.scale, { extra: this.drawing?.points ?? [] });
    this.snapMark = s.kind === "pixel" ? null : s.point;
    return s.point;
  }

  private polygonDown(p: Vec, e: PointerInput) {
    // The second click of a double-click closes the shape (spec 09).
    if (this.drawing && (e.clicks ?? 1) >= 2) return this.finish();
    const target = this.drawing?.target ?? this.drawTarget();
    if (typeof target === "string") {
      this.editor.showNotice({ kind: "error", text: target });
      return;
    }
    const pt = this.snapDraw(p);
    const d = this.drawing;
    if (d) {
      // Clicking the first point closes the shape.
      const first = d.points[0]!;
      if (d.points.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) <= VERTEX_PX / this.transform.scale) return this.finish();
      const last = d.points[d.points.length - 1]!;
      if (last[0] === pt[0] && last[1] === pt[1]) return;
      d.points = [...d.points, pt];
    } else {
      this.drawing = { points: [pt], target };
    }
    this.changed();
  }

  private rectDown(p: Vec) {
    const target = this.drawTarget();
    if (typeof target === "string") {
      this.editor.showNotice({ kind: "error", text: target });
      return;
    }
    const pt = this.snapDraw(p);
    this.rect = { start: pt, end: pt, target };
  }

  /** Spawn point and Walk-to point tools (spec 09). An existing point is dragged as with Select. */
  protected pointToolDown(p: Vec) {
    const tool = this.ui.tool;
    const hit = this.hit(p);
    if (hit && ((tool === "spawn" && hit.kind === "spawn") || (tool === "walkto" && hit.kind === "walkto"))) {
      this.selectThing(hit.ref);
      this.move = { hit, start: p };
      return;
    }
    const layer = tool === "spawn" ? "guides" : "hotspots";
    if (this.ui.locked.includes(layer) || this.ui.hidden.includes(layer)) {
      this.editor.showNotice({ kind: "error", text: `The ${layer} layer is ${this.ui.locked.includes(layer) ? "locked" : "hidden"}.` });
      return;
    }
    const at = snapPixel(p);
    if (tool === "spawn") {
      this.place = { kind: "spawn", at };
    } else {
      const sel = this.selection;
      if (sel?.list !== "hotspots") {
        if (hit?.kind === "shape" && hit.ref.list === "hotspots") this.selectThing(hit.ref);
        else this.editor.showNotice({ kind: "error", text: "Select a hotspot first, then click where the player should stand to use it." });
        return;
      }
      this.place = { kind: "walkto", at, hotspot: sel.key };
    }
    this.previewPlace(at);
  }

  /** Facing from the drag direction (spec 05's dominant-axis rule); a plain click faces down, toward the player. */
  private placeFacing(at: Point, to: Vec): Facing {
    const dx = to[0] - at[0];
    const dy = to[1] - at[1];
    if (Math.hypot(dx, dy) * this.transform.scale < 8) return this.place?.kind === "walkto" ? "up" : "down";
    return facingFor([dx, dy], "down");
  }

  private previewPlace(to: Vec) {
    const pl = this.place!;
    const facing = this.placeFacing(pl.at, to);
    const id = this.sceneId;
    const placement = { x: pl.at[0], y: pl.at[1], facing };
    if (pl.kind === "spawn") this.preview("Add spawn point", (p) => addSpawn(p, id, placement).project);
    else this.preview("Set walk-to point", (p) => setWalkTo(p, id, pl.hotspot!, placement));
  }

  private selectDown(p: Vec, e: PointerInput) {
    const hit = this.hit(p);
    if (!hit) {
      this.select(null);
      return;
    }
    const id = this.sceneId;
    if (hit.kind === "vertex" && e.alt) {
      this.editor.apply("Delete point", (pr) => deleteVertex(pr, id, hit.pr, hit.index));
      return;
    }
    if (hit.kind === "edge" && (e.clicks ?? 1) >= 2) {
      const at = snapPixel(hit.at);
      this.editor.apply("Add point", (pr) => insertVertex(pr, id, hit.pr, hit.index, at));
      return;
    }
    if (hit.kind !== "vertex" && hit.kind !== "edge" && hit.kind !== "baseline") this.selectThing(hit.ref);
    this.move = { hit, start: p };
  }

  private moveTo(p: Vec) {
    const { hit, start } = this.move!;
    const id = this.sceneId;
    const saved = this.savedScene!;
    const dx = p[0] - start[0];
    const dy = p[1] - start[1];
    this.snapMark = null;
    switch (hit.kind) {
      case "vertex": {
        const s = snapPoint(p, saved, this.ui, this.transform.scale, { pr: hit.pr, index: hit.index });
        if (s.kind !== "pixel") this.snapMark = s.point;
        this.preview("Move point", (pr) => moveVertex(pr, id, hit.pr, hit.index, s.point));
        return;
      }
      case "edge":
      case "shape":
        this.preview(`Move ${thingNoun(hit.ref)}`, (pr) => movePolygon(pr, id, hit.pr, dx, dy));
        return;
      case "sprite": {
        if (hit.ref.list === "objects") {
          this.preview("Move object", (pr) => moveObject(pr, id, hit.ref.key, dx, dy));
        } else {
          const c = saved.characters.find((x) => x.character === hit.ref.key)!;
          this.preview("Move character", (pr) => moveCharacter(pr, id, hit.ref.key, snapPixel([c.x + dx, c.y + dy])));
        }
        return;
      }
      case "spawn": {
        const sp = saved.spawns[hit.ref.key]!;
        this.preview("Move spawn point", (pr) => moveSpawn(pr, id, hit.ref.key, snapPixel([sp.x + dx, sp.y + dy])));
        return;
      }
      case "walkto": {
        const w = saved.hotspots.find((h) => h.id === hit.ref.key)!.walkTo!;
        const [x, y] = snapPixel([w.x + dx, w.y + dy]);
        this.preview("Move walk-to point", (pr) => setWalkTo(pr, id, hit.ref.key, { ...w, x, y }));
        return;
      }
      case "depth": {
        const key = hit.ref.key as "far" | "near";
        const y = saved.depth[key].y + dy;
        this.preview("Move depth line", (pr) => setDepthY(pr, id, key, y));
        return;
      }
      case "baseline":
        this.preview("Move baseline", (pr) => setBaseline(pr, id, hit.ref.key, Math.round(p[1])));
        return;
      case "background":
        return;
    }
  }

  override frame(): Frame | null {
    const f = super.frame();
    if (!f) return null;
    f.snap = this.snapMark;
    if (this.drawing) {
      const { points } = this.drawing;
      const cursor = this.cursorPoint;
      const closing = cursor ? [...points, cursor] : points;
      f.drawing = { points, cursor, closeInvalid: closing.length >= 3 && polygonIssue(closing) !== null };
    } else if (this.rect) {
      const { start: a, end: b } = this.rect;
      f.drawing = { points: [a, [b[0], a[1]], b, [a[0], b[1]]], cursor: a, closeInvalid: false };
    }
    return f;
  }

  /** The scene as it is in the project right now (for tests). */
  protected get committed() {
    return sceneOf(this.editor.project, this.sceneId);
  }
}
