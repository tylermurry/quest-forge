import { z } from "zod";
import { Color, Id, Text, schemaVersion } from "./common.ts";

export const DIRECTIONS = ["down", "up", "left", "right"] as const;
export const ANIMATION_SLOTS = (["idle", "walk", "talk"] as const).flatMap((kind) => DIRECTIONS.map((dir) => `${kind}_${dir}` as const));
export const AnimationSlot = z.enum(ANIMATION_SLOTS);
export type AnimationSlot = z.infer<typeof AnimationSlot>;

/**
 * A named animation. `image` is an image asset ID and `frames` are cell
 * indices into its sheet; an unsliced image has the single frame 0.
 */
export const Animation = z.strictObject({
  image: Id,
  frames: z.array(z.int().min(0)).min(1),
  fps: z.number().positive().max(60),
  loop: z.boolean(),
});
export type Animation = z.infer<typeof Animation>;

/** `characters/**\/<id>.character.yaml`. */
export const CharacterFile = z.strictObject({
  schemaVersion,
  id: Id,
  name: Text,
  textColor: Color,
  /** Pixels per second at depth scale 1.0. */
  walkSpeed: z.int().positive(),
  /** Render left-facing slots by mirroring the right ones. */
  mirrorLeft: z.boolean(),
  /** Keyed by slot; an object (not a record) so keys serialize in slot order. */
  animations: z.strictObject(
    Object.fromEntries(ANIMATION_SLOTS.map((slot) => [slot, Animation.optional()])) as {
      [S in AnimationSlot]: z.ZodOptional<typeof Animation>;
    },
  ),
});
export type CharacterFile = z.infer<typeof CharacterFile>;
