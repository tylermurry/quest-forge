import { z } from "zod";

/** Version written to every project file (spec 01). */
export const SCHEMA_VERSION = 2 as const;

/** Scene space (D31): geometry is integer pixels in 640×400. */
export const SCENE_WIDTH = 640;
export const SCENE_HEIGHT = 400;

export const schemaVersion = z.literal(SCHEMA_VERSION);

/** Stable asset ID slug (D63). */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const Id = z
  .string()
  .max(64)
  .regex(ID_PATTERN, "must be lowercase letters, digits and underscores, starting with a letter");
export type Id = z.infer<typeof Id>;

export const SceneX = z.int().min(0).max(SCENE_WIDTH);
export const SceneY = z.int().min(0).max(SCENE_HEIGHT);

/** A point in scene space, stored as `[x, y]`. */
export const Point = z.tuple([SceneX, SceneY]);
export type Point = z.infer<typeof Point>;

/**
 * A polygon in scene space. Shape rules (≥3 points, not self-intersecting) are
 * checked by validation, not parsing, so they get a plain-English problem with jump-to.
 */
export const Polygon = z.array(Point);
export type Polygon = z.infer<typeof Polygon>;

export const Facing = z.enum(["down", "up", "left", "right"]);
export type Facing = z.infer<typeof Facing>;

/** A standing position: feet point + facing. */
export const Placement = z.strictObject({ x: SceneX, y: SceneY, facing: Facing });
export type Placement = z.infer<typeof Placement>;

/** Non-empty, human-facing text (names, narration). */
export const Text = z.string().min(1);

/** `#rrggbb` color. */
export const Color = z.string().regex(/^#[0-9a-f]{6}$/, "must be a color like #ffcc00");

/** Position on an editor canvas (dialogue graph). Unbounded integers. */
export const CanvasPos = z.tuple([z.int(), z.int()]);
