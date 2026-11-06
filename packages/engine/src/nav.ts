import { doubleArea, inWalkable, type Polygon, type SceneFile } from "@questforge/schema";
import { add, dist, normalize, scale, sub, type Vec } from "./vec.ts";

// Navigation (spec 04, D34, D42): walkable polygon + holes → visibility graph over
// the corners a walker can bend around → A*. Paths are straight segments, no grid.

/** How far graph nodes sit inside the walkable area, off each corner (spec 04: 1px). */
const INSET = 1;
/** Distance used to nudge boundary points off an edge so they are strictly walkable. */
const NUDGE = 0.25;

interface Edge {
  a: Vec;
  b: Vec;
}

export class NavMesh {
  readonly outer: Polygon;
  /** Walkable holes plus obstacle polygons of visible objects. */
  readonly holes: Polygon[];
  readonly nodes: Vec[];
  private readonly edges: Edge[];
  /** Precomputed node-to-node visibility. */
  private readonly links: number[][];

  constructor(outer: Polygon, holes: Polygon[]) {
    this.outer = outer;
    this.holes = holes;
    this.edges = [outer, ...holes].flatMap((poly) => poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length]! })));
    this.nodes = [
      ...cornerNodes(outer, "reflex"),
      ...holes.flatMap((h) => cornerNodes(h, "convex")),
    ].filter((n) => this.isWalkable(n));
    this.links = this.nodes.map(() => []);
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (this.clear(this.nodes[i]!, this.nodes[j]!)) {
          this.links[i]!.push(j);
          this.links[j]!.push(i);
        }
      }
    }
  }

  /** Inside the outer polygon and outside every hole and obstacle; edges count as walkable. */
  isWalkable(p: Vec): boolean {
    return inWalkable(p, this.outer, this.holes);
  }

  /** True if the straight segment a–b stays inside the walkable area the whole way. */
  clear(a: Vec, b: Vec): boolean {
    // Every place the segment meets the boundary splits it into pieces that each lie
    // entirely in or out of the walkable area; check one point per piece.
    const ts = [0, 1];
    const r = sub(b, a);
    for (const e of this.edges) {
      const s = sub(e.b, e.a);
      const denom = crossV(r, s);
      const qp = sub(e.a, a);
      if (denom === 0) {
        if (crossV(qp, r) !== 0) continue; // parallel, not collinear
        const rr = r[0] * r[0] + r[1] * r[1];
        if (rr === 0) continue;
        for (const p of [e.a, e.b]) {
          const t = ((p[0] - a[0]) * r[0] + (p[1] - a[1]) * r[1]) / rr;
          if (t > 0 && t < 1) ts.push(t);
        }
        continue;
      }
      const t = crossV(qp, s) / denom;
      const u = crossV(qp, r) / denom;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i]!;
      const t1 = ts[i + 1]!;
      if (t1 - t0 < 1e-9) continue;
      if (!this.isWalkable(add(a, scale(r, (t0 + t1) / 2)))) return false;
    }
    return true;
  }

  /** The closest walkable point to `p` (itself, if already walkable). */
  nearestWalkable(p: Vec): Vec {
    if (this.isWalkable(p)) return p;
    let best: Vec | null = null;
    let bestD = Infinity;
    for (const c of this.boundaryCandidates(p)) {
      const d = dist(c, p);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best ?? p;
  }

  /**
   * Straight-segment path from `from` to `to`, starting at `from` (snapped to the
   * walkable area). A target outside the walkable area, or one that can't be reached,
   * is replaced by the nearest point the walker can reach (spec 04).
   */
  findPath(from: Vec, to: Vec): Vec[] {
    const start = this.nearestWalkable(from);
    const goal = this.nearestWalkable(to);
    if (this.clear(start, goal)) return dedupe([start, goal]);

    const startLinks = this.visibleNodes(start);
    const direct = this.search(start, startLinks, goal, this.visibleNodes(goal));
    if (direct) return dedupe(direct);

    // Unreachable: pick the reachable point closest to the requested target.
    const reachable = this.reachableFrom(startLinks);
    const seen = (q: Vec) => this.clear(start, q) || [...reachable].some((i) => this.clear(this.nodes[i]!, q));
    let best: Vec = start;
    let bestD = dist(start, to);
    const consider = (q: Vec) => {
      const d = dist(q, to);
      if (d < bestD - 1e-9 && seen(q)) {
        best = q;
        bestD = d;
      }
    };
    for (const i of reachable) consider(this.nodes[i]!);
    for (const q of this.boundaryCandidates(to)) consider(q);
    if (best === start) return [start];
    if (this.clear(start, best)) return dedupe([start, best]);
    return dedupe(this.search(start, startLinks, best, this.visibleNodes(best)) ?? [start]);
  }

  private visibleNodes(p: Vec): number[] {
    return this.nodes.flatMap((n, i) => (this.clear(p, n) ? [i] : []));
  }

  private reachableFrom(startLinks: number[]): Set<number> {
    const seen = new Set(startLinks);
    const stack = [...startLinks];
    while (stack.length) {
      for (const j of this.links[stack.pop()!]!) {
        if (!seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    return seen;
  }

  /** A* over the visibility graph, with the start and goal as extra nodes. */
  private search(start: Vec, startLinks: number[], goal: Vec, goalLinks: number[]): Vec[] | null {
    const n = this.nodes.length;
    const START = n;
    const GOAL = n + 1;
    const pos = (i: number) => (i === START ? start : i === GOAL ? goal : this.nodes[i]!);
    const goalSet = new Set(goalLinks);
    const neighbors = (i: number): number[] => {
      if (i === START) return startLinks;
      const out = this.links[i]!;
      return goalSet.has(i) ? [...out, GOAL] : out;
    };
    const g = new Map<number, number>([[START, 0]]);
    const came = new Map<number, number>();
    const open = new Set([START]);
    const f = new Map<number, number>([[START, dist(start, goal)]]);
    while (open.size) {
      let cur = -1;
      let curF = Infinity;
      for (const i of open) {
        const fi = f.get(i)!;
        if (fi < curF) {
          cur = i;
          curF = fi;
        }
      }
      if (cur === GOAL) {
        const path = [goal];
        let c = GOAL;
        while (came.has(c)) {
          c = came.get(c)!;
          path.push(pos(c));
        }
        return path.reverse();
      }
      open.delete(cur);
      for (const nb of neighbors(cur)) {
        const tentative = g.get(cur)! + dist(pos(cur), pos(nb));
        if (tentative < (g.get(nb) ?? Infinity)) {
          g.set(nb, tentative);
          came.set(nb, cur);
          f.set(nb, tentative + dist(pos(nb), goal));
          open.add(nb);
        }
      }
    }
    return null;
  }

  /** Closest point on each boundary edge to `p`, nudged just inside the walkable area. */
  private boundaryCandidates(p: Vec): Vec[] {
    const out: Vec[] = [];
    for (const e of this.edges) {
      const q = closestOnSegment(p, e.a, e.b);
      const dir = normalize(sub(e.b, e.a));
      const normal: Vec = [-dir[1], dir[0]];
      // Off a corner, also try pushing away from the segment direction.
      for (const off of [normal, scale(normal, -1), normalize(sub(q, p))]) {
        const c = add(q, scale(off, NUDGE));
        if (this.isWalkable(c)) {
          out.push(c);
          break;
        }
      }
    }
    return out;
  }
}

/** The navigation mesh for a scene, given which objects are currently visible (D42). */
export function sceneNav(scene: SceneFile, visible: (objectId: string) => boolean): NavMesh {
  const obstacles = scene.objects.flatMap((o) => (o.obstacle && visible(o.id) ? [o.obstacle] : []));
  return new NavMesh(scene.walkable.outer, [...scene.walkable.holes, ...obstacles]);
}

/** Total length of a path. */
export const pathLength = (path: readonly Vec[]) => path.reduce((sum, p, i) => (i === 0 ? 0 : sum + dist(path[i - 1]!, p)), 0);

const crossV = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];

/**
 * Corners a walker bends around, inset into the walkable side: concave corners of
 * the outer outline, convex corners of holes.
 */
function cornerNodes(poly: Polygon, want: "reflex" | "convex"): Vec[] {
  const orientation = Math.sign(doubleArea(poly));
  const out: Vec[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const prev = poly[(i + n - 1) % n]!;
    const v = poly[i]!;
    const next = poly[(i + 1) % n]!;
    const turn = Math.sign(crossV(sub(v, prev), sub(next, v)));
    if (turn === 0) continue;
    const convex = turn === orientation;
    if (convex !== (want === "convex")) continue;
    // Bisector of the corner's two edges points into the narrow wedge, which is the
    // non-walkable side for both kinds of node; step the other way.
    const wedge = normalize(add(normalize(sub(prev, v)), normalize(sub(next, v))));
    if (wedge[0] === 0 && wedge[1] === 0) continue;
    out.push(sub(v, scale(wedge, INSET * Math.SQRT2)));
  }
  return out;
}

function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const len2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2));
  return add(a, scale(ab, t));
}

function dedupe(path: Vec[]): Vec[] {
  return path.filter((p, i) => i === 0 || dist(p, path[i - 1]!) > 1e-9);
}
