import { z } from "zod";
import { Facing, Id, Placement, Polygon, SCENE_HEIGHT, SCENE_WIDTH, SceneX, SceneY, Text, schemaVersion } from "./common.ts";
import { InteractRule, RegionRule, SceneRule } from "./rules.ts";

/** A depth line: characters with feet at `y` draw at `scale` (spec 04, D35). */
export const DepthLine = z.strictObject({ y: SceneY, scale: z.number().positive().max(4) });

/** One outer polygon plus holes (D34). */
export const Walkable = z.strictObject({ outer: Polygon, holes: z.array(Polygon) });

/** A layered image. Position is the image's top-left and may sit partly off-scene. */
export const SceneObject = z.strictObject({
  id: Id,
  /** Hover label; set when the object is interactive. */
  name: Text.optional(),
  image: Id,
  x: z.int().min(-SCENE_WIDTH).max(SCENE_WIDTH * 2),
  y: z.int().min(-SCENE_HEIGHT).max(SCENE_HEIGHT * 2),
  /** Occlusion sort line; defaults to the image's bottom edge at runtime (spec 04). */
  baseline: SceneY.optional(),
  visible: z.boolean(),
  /** Blocks walking while the object is visible (D42). */
  obstacle: Polygon.optional(),
  rules: z.array(InteractRule),
});
export type SceneObject = z.infer<typeof SceneObject>;

/** A character standing in this scene, with its per-scene rules (D60). */
export const PlacedCharacter = z.strictObject({
  character: Id,
  x: SceneX,
  y: SceneY,
  facing: Facing,
  visible: z.boolean(),
  rules: z.array(InteractRule),
});
export type PlacedCharacter = z.infer<typeof PlacedCharacter>;

export const Hotspot = z.strictObject({
  id: Id,
  name: Text,
  shape: Polygon,
  /** Where the player walks before the verb runs; nearest walkable point if unset. */
  walkTo: Placement.optional(),
  rules: z.array(InteractRule),
});
export type Hotspot = z.infer<typeof Hotspot>;

/** Walk-into trigger area (D41). */
export const Region = z.strictObject({ id: Id, shape: Polygon, rules: z.array(RegionRule) });
export type Region = z.infer<typeof Region>;

/** `scenes/**\/<id>.scene.yaml` (spec 01). Array order of `objects` is layer order. */
export const SceneFile = z.strictObject({
  schemaVersion,
  id: Id,
  name: Text,
  /** Image asset ID (D55). */
  background: Id,
  /** Audio asset ID. */
  music: Id.optional(),
  depth: z.strictObject({ far: DepthLine, near: DepthLine }),
  walkable: Walkable,
  /** Keyed by spawn ID; `change_scene` and `game.startSpawn` refer to these. */
  spawns: z.record(Id, Placement),
  objects: z.array(SceneObject),
  characters: z.array(PlacedCharacter),
  hotspots: z.array(Hotspot),
  regions: z.array(Region),
  rules: z.array(SceneRule),
});
export type SceneFile = z.infer<typeof SceneFile>;
