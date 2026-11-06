// Snapping (spec 09, D102): always to whole pixels; with Snap on, also to the
// vertices (first) and edges of shapes on visible layers within a screen distance.
import type { Vec } from "@questforge/engine";
import type { Point, SceneFile } from "@questforge/schema";
import type { SceneUi } from "./sceneUi.ts";
import { samePoly, scenePolygons, type PolyRef } from "./shapes.ts";
import { snapPixel } from "./view.ts";

/** Snap radius in screen px (D102). */
export const SNAP_PX = 6;

export interface Snapped {
  point: Point;
  /** What it snapped to, if anything other than the pixel grid. */
  kind: "pixel" | "vertex" | "edge";
}

/** A vertex to leave out (the one being dragged), and polygons being drawn. */
export interface SnapExclude {
  pr?: PolyRef;
  index?: number;
  /** Extra vertices to snap to (e.g. earlier points of the shape being drawn). */
  extra?: readonly Point[];
}

/** The closest point on segment a–b to p. */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + dx * t, a[1] + dy * t];
}

const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Snaps a scene point. `scale` is screen px per scene px, so the radius is constant on screen. */
export function snapPoint(p: Vec, scene: SceneFile, ui: SceneUi, scale: number, exclude: SnapExclude = {}): Snapped {
  if (!ui.snap) return { point: snapPixel(p), kind: "pixel" };
  const radius = SNAP_PX / scale;
  const polys = scenePolygons(scene).filter((x) => !ui.hidden.includes(x.layer));
  let best: { point: Vec; d: number } | null = null;
  const consider = (q: Vec) => {
    const d = dist(p, q);
    if (d <= radius && (!best || d < best.d)) best = { point: q, d };
  };
  for (const { pr, poly } of polys) {
    poly.forEach((v, i) => {
      if (exclude.pr && samePoly(pr, exclude.pr) && i === exclude.index) return;
      consider(v);
    });
  }
  for (const v of exclude.extra ?? []) consider(v);
  if (best) return { point: snapPixel((best as { point: Vec }).point), kind: "vertex" };
  for (const { pr, poly } of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      // Edges touching the dragged vertex move with it, so don't snap to them.
      if (exclude.pr && samePoly(pr, exclude.pr) && exclude.index !== undefined && (i === exclude.index || (i + 1) % n === exclude.index)) continue;
      consider(closestOnSegment(p, poly[i]!, poly[(i + 1) % n]!));
    }
  }
  if (best) return { point: snapPixel((best as { point: Vec }).point), kind: "edge" };
  return { point: snapPixel(p), kind: "pixel" };
}
