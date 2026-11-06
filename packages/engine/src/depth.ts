import type { SceneFile } from "@questforge/schema";

// Depth (spec 04, D35): scale lerped between the far and near lines, occlusion by
// baseline y-sort.

type Depth = SceneFile["depth"];

/** Character scale for feet at `y`: linear between the far and near lines, clamped. */
export function scaleAt(depth: Depth, y: number): number {
  const { far, near } = depth;
  if (near.y === far.y) return near.scale;
  const t = Math.max(0, Math.min(1, (y - far.y) / (near.y - far.y)));
  return far.scale + (near.scale - far.scale) * t;
}

/** Walk speed in px/s at feet-y: the character's speed at scale 1.0 times the depth scale. */
export const walkSpeedAt = (depth: Depth, y: number, walkSpeed: number) => walkSpeed * scaleAt(depth, y);

/** An object's sort line: its baseline, or its image's bottom edge if none is set. */
export const objectBaseline = (o: { y: number; baseline?: number }, imageHeight: number) => o.baseline ?? o.y + imageHeight;

export interface Sortable {
  baseline: number;
}

/**
 * Draw order: lower baselines first, so a higher baseline draws later (in front).
 * Stable, so ties keep their layer order (objects in file order, then characters).
 */
export const sortByBaseline = <T extends Sortable>(items: readonly T[]): T[] =>
  items.map((item, i) => ({ item, i })).sort((a, b) => a.item.baseline - b.item.baseline || a.i - b.i).map((x) => x.item);
