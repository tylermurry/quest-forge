// What's under the pointer on the scene canvas (spec 09). Hidden and locked layers
// can't be hit. Order: the selected thing's handles, then the active layer, then
// the other layers top to bottom (D15). DOM-free.
import type { Drawable, Vec } from "@questforge/engine";
import { pointInPolygon, SCENE_WIDTH, type SceneFile } from "@questforge/schema";
import { isEditable, LAYERS, type Layer, type SceneUi } from "./sceneUi.ts";
import { scenePolygons, type PolyRef } from "./shapes.ts";
import { closestOnSegment } from "./snap.ts";
import { sameThing, type ThingRef } from "./things.ts";

/** Handle sizes in screen px. */
export const VERTEX_PX = 7;
const EDGE_PX = 5;
const POINT_PX = 9;
const LINE_PX = 5;

export type Hit =
  /** A polygon vertex (of the selected thing's polygon). */
  | { kind: "vertex"; ref: ThingRef; pr: PolyRef; index: number }
  /** A point on an edge of the selected polygon: `index` is the edge's first vertex. */
  | { kind: "edge"; ref: ThingRef; pr: PolyRef; index: number; at: Vec }
  /** Inside a polygon (moves the whole shape). */
  | { kind: "shape"; ref: ThingRef; pr: PolyRef }
  /** A placed object or character's sprite. */
  | { kind: "sprite"; ref: ThingRef }
  /** The selected object's baseline handle (spec 09). */
  | { kind: "baseline"; ref: ThingRef }
  /** A depth line (spec 04). */
  | { kind: "depth"; ref: ThingRef }
  /** A spawn point. */
  | { kind: "spawn"; ref: ThingRef }
  /** A hotspot's walk-to point. */
  | { kind: "walkto"; ref: ThingRef }
  /** The background (selects the scene's background with that layer active). */
  | { kind: "background"; ref: ThingRef };

export interface HitContext {
  scene: SceneFile;
  ui: SceneUi;
  /** Screen px per scene px. */
  scale: number;
  selection: ThingRef | null;
  /** Sprites back to front, as drawn. */
  sprites: readonly Drawable[];
}

const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The baseline handle's knob sits just right of the sprite, as drawn. */
const baselineKnob = (d: Drawable, scale: number): Vec => [d.dest.x + d.dest.w + 9 / scale, d.baseline];

/** Handles of the selected thing: vertices, then the baseline (it often lies on an obstacle edge), then edges. */
function handleHits(p: Vec, c: HitContext): Hit | null {
  const sel = c.selection;
  if (!sel) return null;
  const tol = (px: number) => px / c.scale;
  for (const { pr, poly, layer } of scenePolygons(c.scene)) {
    if (!sameThing(pr.ref, sel) || !isEditable(c.ui, layer)) continue;
    const i = poly.findIndex((v) => dist(v, p) <= tol(VERTEX_PX));
    if (i >= 0) return { kind: "vertex", ref: sel, pr, index: i };
  }
  if (sel.list === "objects" && isEditable(c.ui, "objects")) {
    const d = c.sprites.find((s) => s.kind === "object" && s.id === sel.key);
    if (d) {
      const knob = baselineKnob(d, c.scale);
      const onKnob = Math.abs(p[0] - knob[0]) <= tol(POINT_PX) && Math.abs(p[1] - knob[1]) <= tol(POINT_PX);
      const onLine = Math.abs(p[1] - d.baseline) <= tol(LINE_PX) && p[0] >= d.dest.x - tol(6) && p[0] <= d.dest.x + d.dest.w + tol(6);
      if (onKnob || onLine) return { kind: "baseline", ref: sel };
    }
  }
  for (const { pr, poly, layer } of scenePolygons(c.scene)) {
    if (!sameThing(pr.ref, sel) || !isEditable(c.ui, layer)) continue;
    for (let i = 0; i < poly.length; i++) {
      const q = closestOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!);
      if (dist(q, p) <= tol(EDGE_PX)) return { kind: "edge", ref: sel, pr, index: i, at: q };
    }
  }
  return null;
}

function layerHits(p: Vec, layer: Layer, c: HitContext): Hit | null {
  const tol = (px: number) => px / c.scale;
  const { scene } = c;
  switch (layer) {
    case "guides": {
      for (const [id, s] of Object.entries(scene.spawns).reverse()) if (dist([s.x, s.y], p) <= tol(POINT_PX)) return { kind: "spawn", ref: { list: "spawns", key: id } };
      for (const key of ["near", "far"] as const) {
        const y = scene.depth[key].y;
        // The line spans the scene; its grab square sits just left of it.
        const nearLine = Math.abs(p[1] - y) <= tol(LINE_PX) && p[0] >= -tol(14) && p[0] <= SCENE_WIDTH;
        if (nearLine) return { kind: "depth", ref: { list: "depth", key } };
      }
      return null;
    }
    case "hotspots": {
      for (const h of [...scene.hotspots].reverse()) if (h.walkTo && dist([h.walkTo.x, h.walkTo.y], p) <= tol(POINT_PX)) return { kind: "walkto", ref: { list: "hotspots", key: h.id } };
      break;
    }
    case "objects": {
      for (const d of [...c.sprites].reverse()) {
        const r = d.dest;
        if (d.id.includes(":")) continue; // preview-only actors such as the ghost
        if (p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h) return { kind: "sprite", ref: { list: d.kind === "object" ? "objects" : "characters", key: d.id } };
      }
      break;
    }
    case "background":
      return scene.background ? { kind: "background", ref: { list: "background", key: "background" } } : null;
  }
  for (const { pr, poly, layer: l } of scenePolygons(scene)) {
    if (l !== layer || poly.length < 3) continue;
    if (pointInPolygon([Math.round(p[0]), Math.round(p[1])], poly) || pointInPolygon(p, poly)) {
      // Inside the outline but in a hole: the hole was listed first, so it already won.
      return { kind: "shape", ref: pr.ref, pr };
    }
  }
  return null;
}

/** What a click at scene point `p` would grab. */
export function hitTest(p: Vec, c: HitContext): Hit | null {
  const handle = handleHits(p, c);
  if (handle) return handle;
  const order: Layer[] = [c.ui.layer, ...LAYERS.filter((l) => l !== c.ui.layer)];
  for (const layer of order) {
    if (!isEditable(c.ui, layer)) continue;
    // The background only answers when it's the active layer, so empty clicks elsewhere deselect.
    if (layer === "background" && c.ui.layer !== "background") continue;
    const hit = layerHits(p, layer, c);
    if (hit) return hit;
  }
  return null;
}
