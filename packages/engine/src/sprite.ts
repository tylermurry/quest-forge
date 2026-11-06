import type { Animation, CharacterFile, Facing, ImageAsset } from "@questforge/schema";
import type { Vec } from "./vec.ts";

// Sprites and animation (spec 05, D39, D66).

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Size of one frame: a sheet cell, or the whole image when unsliced. */
export const frameSize = (img: ImageAsset, imageSize: Size): Size =>
  img.sheet ? { w: img.sheet.cellWidth, h: img.sheet.cellHeight } : imageSize;

/** Source rectangle of a frame; cells are counted row by row from the top-left (D66). */
export function frameRect(img: ImageAsset, imageSize: Size, frame: number): Rect {
  if (!img.sheet) return { x: 0, y: 0, w: imageSize.w, h: imageSize.h };
  const { columns, cellWidth, cellHeight } = img.sheet;
  return { x: (frame % columns) * cellWidth, y: Math.floor(frame / columns) * cellHeight, w: cellWidth, h: cellHeight };
}

/** True if every cell of the sheet fits inside the decoded image. */
export const sheetFits = (img: ImageAsset, imageSize: Size) =>
  !img.sheet || (img.sheet.columns * img.sheet.cellWidth <= imageSize.w && img.sheet.rows * img.sheet.cellHeight <= imageSize.h);

/** The feet point inside a frame; bottom-center unless set (spec 05). */
export const originOf = (img: ImageAsset, frame: Size): Vec => (img.origin ? img.origin : [frame.w / 2, frame.h]);

/**
 * Where a frame lands on screen so its origin sits on `feet`, at `scale`. A mirrored
 * frame flips around the origin, so the feet stay put (D39).
 */
export function spriteRect(feet: Vec, origin: Vec, frame: Size, scale: number, mirror: boolean): Rect {
  const ox = mirror ? frame.w - origin[0] : origin[0];
  return { x: feet[0] - ox * scale, y: feet[1] - origin[1] * scale, w: frame.w * scale, h: frame.h * scale };
}

/** The frame index to show `elapsed` seconds into an animation (objects' loops pass `loop: true`, D111). */
export function frameAt(anim: Pick<Animation, "frames" | "fps" | "loop">, elapsed: number): number {
  const n = anim.frames.length;
  const step = Math.floor(Math.max(0, elapsed) * anim.fps + 1e-9);
  return anim.frames[anim.loop ? step % n : Math.min(step, n - 1)]!;
}

/** Facing for a movement direction: the dominant axis wins, horizontal on a tie. */
export function facingFor(delta: Vec, current: Facing): Facing {
  const [dx, dy] = delta;
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export type AnimKind = "idle" | "walk" | "talk";

export interface ResolvedAnim {
  anim: Animation;
  /** Draw flipped horizontally (left drawn as mirrored right). */
  mirror: boolean;
  /** Show only the first frame (the walk-cycle fallback). */
  still: boolean;
}

/**
 * The animation to play for a kind and facing (spec 05). Missing slots fall back
 * talk → idle → first frame of walk. A left slot uses the mirrored right slot when the
 * character says so (D39). A direction with nothing at all falls back to facing down (D70).
 */
export function resolveAnim(character: Pick<CharacterFile, "animations" | "mirrorLeft">, kind: AnimKind, facing: Facing): ResolvedAnim | null {
  const inDir = (dir: Facing): ResolvedAnim | null => {
    const mirror = dir === "left" && character.mirrorLeft;
    const slotDir = mirror ? "right" : dir;
    const chain: AnimKind[] = kind === "talk" ? ["talk", "idle", "walk"] : kind === "idle" ? ["idle", "walk"] : ["walk"];
    for (const k of chain) {
      const anim = character.animations[`${k}_${slotDir}`];
      if (anim) return { anim, mirror, still: k === "walk" && kind !== "walk" };
    }
    return null;
  };
  return inDir(facing) ?? (facing === "down" ? null : inDir("down"));
}
