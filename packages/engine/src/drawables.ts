import type { Animation, CharacterFile, Facing, ImageAsset, ObjectAnimation, SceneFile } from "@questforge/schema";
import { objectBaseline, scaleAt, sortByBaseline } from "./depth.ts";
import { frameAt, frameRect, frameSize, originOf, resolveAnim, spriteRect, type AnimKind, type Rect, type Size } from "./sprite.ts";
import type { Vec } from "./vec.ts";

// The sprites of a scene in draw order (spec 04, D35). Shared by the playing World
// and the editor canvas (D93), so the editor draws exactly what the engine draws.
// Pure: no DOM.

export interface LoadedImage {
  asset: ImageAsset;
  size: Size;
  /** The decoded image; absent in headless tests. */
  el?: CanvasImageSource;
}

/** What drawing needs to know about images: their asset entry and decoded size. */
export type ImageLookup = (id: string) => LoadedImage | undefined;

/** One sprite in the frame, in draw order. */
export interface Drawable {
  kind: "object" | "character";
  id: string;
  /** Interactive name, if any. */
  name?: string;
  image: LoadedImage;
  /** Source rectangle in the image. */
  src: Rect;
  /** Destination rectangle in scene space. */
  dest: Rect;
  mirror: boolean;
  baseline: number;
}

/** What it takes to draw a character standing somewhere. */
export interface ActorPose {
  id: string;
  character: Pick<CharacterFile, "name" | "animations" | "mirrorLeft">;
  pos: Vec;
  facing: Facing;
  kind: AnimKind;
  /** Seconds since the current animation started. */
  animTime: number;
  /** A slot played by `play_animation` (D71). */
  special?: { anim: Animation; mirror: boolean; time: number } | null;
}

type SceneObject = SceneFile["objects"][number];

/** Where an object's animations are (D111, D112). */
export interface ObjectPose {
  /** Seconds the object's looping animation has run. */
  time: number;
  /** A one-shot from `play_animation`, shown until it ends. */
  oneShot?: { anim: ObjectAnimation; time: number } | null;
}

/** Size of an object's rest frame: frame 0 of its image (the whole image when unsliced, D112). */
export function objectFrameSize(o: SceneObject, images: ImageLookup): Size | null {
  const image = images(o.image);
  return image ? frameSize(image.asset, image.size) : null;
}

/**
 * A placed object's sprite, or null if the image to show isn't known. It plays a
 * one-shot if one is running, else its looping animation, else shows frame 0 of its
 * image (D112). Objects stand at their top-left and never scale (D110). The default
 * baseline is the rest frame's bottom edge, so it doesn't jump while animating.
 */
export function objectDrawable(o: SceneObject, images: ImageLookup, pose: ObjectPose = { time: 0 }): Drawable | null {
  const rest = objectFrameSize(o, images);
  if (!rest) return null;
  const playing = pose.oneShot
    ? { image: pose.oneShot.anim.image, frame: frameAt({ ...pose.oneShot.anim, loop: false }, pose.oneShot.time) }
    : o.animation
      ? { image: o.animation.image, frame: frameAt({ ...o.animation, loop: true }, pose.time) }
      : { image: o.image, frame: 0 };
  const image = images(playing.image);
  if (!image) return null;
  const src = frameRect(image.asset, image.size, playing.frame);
  return {
    kind: "object",
    id: o.id,
    ...(o.name ? { name: o.name } : {}),
    image,
    src,
    dest: { x: o.x, y: o.y, w: src.w, h: src.h },
    mirror: false,
    baseline: objectBaseline(o, rest.h),
  };
}

/** A character's current frame at its feet, scaled for depth; null with no usable slot or image. */
export function actorDrawable(a: ActorPose, depth: SceneFile["depth"], images: ImageLookup): Drawable | null {
  const resolved = a.special ? { anim: a.special.anim, mirror: a.special.mirror, still: false } : resolveAnim(a.character, a.kind, a.facing);
  if (!resolved) return null;
  const image = images(resolved.anim.image);
  if (!image) return null;
  const time = a.special ? a.special.time : a.animTime;
  const frame = resolved.still ? resolved.anim.frames[0]! : frameAt(resolved.anim, time);
  const size = frameSize(image.asset, image.size);
  const scale = scaleAt(depth, a.pos[1]);
  return {
    kind: "character",
    id: a.id,
    name: a.character.name,
    image,
    src: frameRect(image.asset, image.size, frame),
    dest: spriteRect(a.pos, originOf(image.asset, size), size, scale, resolved.mirror),
    mirror: resolved.mirror,
    baseline: a.pos[1],
  };
}

/**
 * Every visible sprite, back to front: the scene's visible objects, then `actors`
 * (characters), sorted by baseline. Ties keep that order (spec 04). `objectPose` says
 * where each object's animations are; absent, objects show their first frame.
 */
export function sceneDrawables(
  scene: SceneFile,
  images: ImageLookup,
  objectVisible: (id: string) => boolean,
  actors: readonly ActorPose[],
  objectPose?: (id: string) => ObjectPose,
): Drawable[] {
  const out: Drawable[] = [];
  for (const o of scene.objects) {
    if (!objectVisible(o.id)) continue;
    const d = objectDrawable(o, images, objectPose?.(o.id));
    if (d) out.push(d);
  }
  for (const a of actors) {
    const d = actorDrawable(a, scene.depth, images);
    if (d) out.push(d);
  }
  return sortByBaseline(out);
}
