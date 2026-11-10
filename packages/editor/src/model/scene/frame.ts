// Everything the scene canvas draws in one frame, computed DOM-free so tests can
// check what the user would see (ghost scale, sprite order, path, invalid shapes).
import type { Drawable, ImageLookup, Vec } from "@questforge/engine";
import type { Point, SceneFile } from "@questforge/schema";
import type { SceneUi } from "./sceneUi.ts";
import type { ThingRef } from "./things.ts";
import type { Transform } from "./view.ts";

export interface Sprite {
  d: Drawable;
  /** Initially hidden things draw faintly so they can still be edited; the ghost is translucent. */
  alpha: number;
  ghost?: boolean;
}

export interface Frame {
  scene: SceneFile;
  ui: SceneUi;
  t: Transform;
  images: ImageLookup;
  /** Objects, placed characters and the ghost, back to front. */
  sprites: Sprite[];
  selection: ThingRef | null;
  /** `list:key` of things with validation errors. */
  invalid: Set<string>;
  /** A polygon being drawn (not in history yet). */
  drawing: { points: Point[]; cursor: Point | null; closeInvalid: boolean } | null;
  /** The vertex or edge point the cursor snapped to. */
  snap: Point | null;
  /** The cursor, when the ghost stands somewhere else. */
  crosshair: Vec | null;
  /** Path preview from the default spawn. */
  path: Vec[] | null;
  /** The ghost when the player has no usable animation: a box at the right scale. */
  ghostBox: { x: number; y: number; w: number; h: number } | null;
}
