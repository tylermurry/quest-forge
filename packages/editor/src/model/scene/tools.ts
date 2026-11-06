// Tool gestures on the scene canvas (spec 09): Select/Move, Polygon, Rectangle,
// Spawn point, Walk-to point. DOM-free; tested in Node by feeding pointer input.
import type { Vec } from "@questforge/engine";
import type { Point } from "@questforge/schema";
import {
  deleteVertex,
  insertVertex,
  moveCharacter,
  moveObject,
  movePolygon,
  moveSpawn,
  moveVertex,
  sceneOf,
  setBaseline,
  setDepthY,
  setWalkTo,
  thingNoun,
} from "./commands.ts";
import { SceneController, type PointerInput } from "./controller.ts";
import type { Frame } from "./frame.ts";
import { hitTest, type Hit } from "./hit.ts";
import { snapPoint } from "./snap.ts";
import { LIST_LAYER, type ThingRef } from "./things.ts";
import { snapPixel, toScene } from "./view.ts";

/** A Select/Move drag in progress. */
type Move = { hit: Hit; start: Vec };

export class SceneTools extends SceneController {
  private move: Move | null = null;
  /** What the cursor is over (for the cursor shape). */
  private hoverHit: Hit | null = null;
  /** Where the last point snapped to a vertex or edge, for the snap ring (D102). */
  protected snapMark: Point | null = null;

  /** A polygon is being drawn (not in history until it closes, D84). */
  get isDrawing(): boolean {
    return false;
  }

  /** One line of help for the toolbar. */
  get hint(): string {
    const ui = this.ui;
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
  finish() {}

  /** Backspace while drawing: remove the last point. */
  removeLastPoint() {}

  override cancel() {
    if (this.move) {
      this.move = null;
      this.discard();
    } else if (this.selection) this.select(null);
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
    if (this.ui.tool === "select") this.selectDown(p, e);
  }

  protected override toolMove(e: PointerInput) {
    const p = toScene(this.transform, e.screen);
    if (this.move) this.moveTo(p);
    else if (this.ui.tool === "select") this.hoverHit = this.hit(p);
  }

  protected override toolUp(_e: PointerInput) {
    if (this.move) {
      this.move = null;
      this.snapMark = null;
      this.commit();
    }
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
    return f;
  }

  /** The scene as it is in the project right now (for tests). */
  protected get committed() {
    return sceneOf(this.editor.project, this.sceneId);
  }
}
