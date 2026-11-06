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
  /** Objects, placed characters and the ghost, back to front (D35, D105). */
  sprites: Sprite[];
  selection: ThingRef | null;
  /** `list:key` of things with validation errors (D100). */
  invalid: Set<string>;
  /** A polygon being drawn (not in history yet, D84). */
  drawing: { points: Point[]; cursor: Point | null; closeInvalid: boolean } | null;
  /** The vertex or edge point the cursor snapped to (D102). */
  snap: Point | null;
  /** The cursor, when the ghost stands somewhere else (D105). */
  crosshair: Vec | null;
  /** Path preview from the default spawn (spec 09). */
  path: Vec[] | null;
  /** The ghost when the player has no usable animation: a box at the right scale (D96). */
  ghostBox: { x: number; y: number; w: number; h: number } | null;
}
