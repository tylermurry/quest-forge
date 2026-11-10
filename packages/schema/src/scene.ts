import { z } from "zod";
import { Facing, Id, Placement, Polygon, SCENE_HEIGHT, SCENE_WIDTH, SceneX, SceneY, Text, schemaVersion } from "./common.ts";
import { InteractRule, RegionRule, SceneRule } from "./rules.ts";

/** A depth line: characters with feet at `y` draw at `scale`. */
export const DepthLine = z.strictObject({ y: SceneY, scale: z.number().positive().max(4) });

/** One outer polygon plus holes. */
export const Walkable = z.strictObject({ outer: Polygon, holes: z.array(Polygon) });

/** An object's animation: cells of `image`'s sheet at `fps`. */
const objectAnimationFields = {
  image: Id,
  frames: z.array(z.int().min(0)).min(1),
  fps: z.number().positive().max(60),
};
/** The looping animation an object plays at rest while visible. */
export const ObjectAnimation = z.strictObject(objectAnimationFields);
export type ObjectAnimation = z.infer<typeof ObjectAnimation>;
/** A one-shot for `play_animation`; IDs are unique within the object. */
export const NamedObjectAnimation = z.strictObject({ id: Id, ...objectAnimationFields });
export type NamedObjectAnimation = z.infer<typeof NamedObjectAnimation>;

/** A layered image. Position is the image's top-left and may sit partly off-scene. */
export const SceneObject = z.strictObject({
  id: Id,
  /** Hover label; set when the object is interactive. */
  name: Text.optional(),
  image: Id,
  /** Loops while visible; absent: the object shows frame 0 of `image`. */
  animation: ObjectAnimation.optional(),
  /** One-shots played by `play_animation`, then back to rest. */
  animations: z.array(NamedObjectAnimation).optional(),
  x: z.int().min(-SCENE_WIDTH).max(SCENE_WIDTH * 2),
  y: z.int().min(-SCENE_HEIGHT).max(SCENE_HEIGHT * 2),
  /** Occlusion sort line; defaults to the image's bottom edge at runtime. */
  baseline: SceneY.optional(),
  visible: z.boolean(),
  /** Blocks walking while the object is visible. */
  obstacle: Polygon.optional(),
  rules: z.array(InteractRule),
});
export type SceneObject = z.infer<typeof SceneObject>;

/** A character standing in this scene, with its per-scene rules. */
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

/** Walk-into trigger area. */
export const Region = z.strictObject({ id: Id, shape: Polygon, rules: z.array(RegionRule) });
export type Region = z.infer<typeof Region>;

/** `scenes/**\/<id>.scene.yaml`. Array order of `objects` is layer order. */
export const SceneFile = z.strictObject({
  schemaVersion,
  id: Id,
  name: Text,
  /** Image asset ID. Optional: a new scene starts without one and draws black. */
  background: Id.optional(),
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
