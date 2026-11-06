import type { Point, Polygon } from "./common.ts";

type P = readonly [number, number];

const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const dot = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[0] - o[0]) + (a[1] - o[1]) * (b[1] - o[1]);
const same = (a: P, b: P) => a[0] === b[0] && a[1] === b[1];

/** True if `p` lies on segment a–b (endpoints included). */
export function onSegment(p: P, a: P, b: P): boolean {
  return (
    cross(a, b, p) === 0 &&
    Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1])
  );
}

/** True if segments a–b and c–d share any point (touching counts). */
export function segmentsIntersect(a: P, b: P, c: P, d: P): boolean {
  const d1 = Math.sign(cross(c, d, a));
  const d2 = Math.sign(cross(c, d, b));
  const d3 = Math.sign(cross(a, b, c));
  const d4 = Math.sign(cross(a, b, d));
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}

/** Twice the signed area. */
export const doubleArea = (poly: readonly P[]) =>
  poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);

export type PolygonIssue = "too_few_points" | "self_intersecting" | "no_area";

/** Why a polygon is unusable, or null if it's a simple polygon (spec 14). */
export function polygonIssue(poly: Polygon): PolygonIssue | null {
  const n = poly.length;
  if (n < 3) return "too_few_points";
  // All points on one line (checked first, since such a shape also "doubles back").
  if (poly.every((p) => cross(poly[0]!, poly.find((q) => !same(q, poly[0]!)) ?? poly[0]!, p) === 0)) return "no_area";
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % n]!;
    // Repeated vertex, or an edge that doubles back along the previous one.
    if (same(b, c)) return "self_intersecting";
    if (cross(b, a, c) === 0 && dot(b, a, c) > 0) return "self_intersecting";
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent via wrap-around
      if (segmentsIntersect(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return "self_intersecting";
    }
  }
  return null;
}

/** Point-in-polygon; points on the boundary count as inside. */
export function pointInPolygon(p: Point | P, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (onSegment(p, a, b)) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Inside the outer polygon and not strictly inside any hole (hole edges are walkable). */
export function inWalkable(p: P, outer: Polygon, holes: Polygon[]): boolean {
  if (!pointInPolygon(p, outer)) return false;
  return !holes.some((h) => pointInPolygon(p, h) && !h.some((q, i) => onSegment(p, q, h[(i + 1) % h.length]!)));
}

/** True if segments a–b and c–d cross at a point inside both (touching doesn't count). */
export function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = Math.sign(cross(c, d, a));
  const d2 = Math.sign(cross(c, d, b));
  const d3 = Math.sign(cross(a, b, c));
  const d4 = Math.sign(cross(a, b, d));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * True if `inner` lies within `outer` (touching its edges is fine): every vertex is
 * inside or on the outline and no edges cross. Both must be simple polygons.
 */
export function polygonWithin(inner: Polygon, outer: Polygon): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]!;
    const b = inner[(i + 1) % inner.length]!;
    for (let j = 0; j < outer.length; j++) {
      if (segmentsCross(a, b, outer[j]!, outer[(j + 1) % outer.length]!)) return false;
    }
    // A concave outline can have an edge pass outside between two inside vertices.
    if (!pointInPolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], outer)) return false;
  }
  return true;
}
