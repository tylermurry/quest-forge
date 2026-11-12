// The game-wide skin's frames, as the Styling editor edits them: pure Project → Project commands, the
// guide-drag math of the nine-slice editor, and the warnings for insets that don't fit the image. DOM-free.
// `which` names the frame, so the Icon Bar editor reuses these commands unchanged.
import { frameInsetProblems, type Frame, type FrameInsets, type GameStyle, type Project } from "@questforge/schema";
import { CommandError } from "./commands.ts";
import type { PickOption } from "./rules/pickers.ts";

export type FrameKey = "sharedFrame" | "iconBar";
export type GuideSide = keyof FrameInsets;
export const GUIDE_SIDES: readonly GuideSide[] = ["left", "right", "top", "bottom"];
export interface ImageSize {
  width: number;
  height: number;
}

export const NO_INSETS: FrameInsets = { left: 0, right: 0, top: 0, bottom: 0 };

const isEmpty = (o: object) => Object.keys(o).length === 0;

/** The frame as saved, or undefined when none is set. */
export function frameOf(p: Project, which: FrameKey): Frame | undefined {
  const style = p.game?.data.style;
  return which === "sharedFrame" ? style?.sharedFrame : style?.iconBar?.frame;
}

/** Writes `frame` (undefined removes it) and drops containers left empty, so an unset frame saves as no `style` at all. */
function withFrame(p: Project, which: FrameKey, frame: Frame | undefined): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const { sharedFrame: _s, iconBar: _i, ...others } = p.game.data.style ?? {};
  const next: GameStyle = { ...others };
  const keepFrame = frame && !isEmpty(frame) ? frame : undefined;
  if (which === "sharedFrame") {
    if (keepFrame) next.sharedFrame = keepFrame;
    if (p.game.data.style?.iconBar) next.iconBar = p.game.data.style.iconBar;
  } else {
    if (p.game.data.style?.sharedFrame) next.sharedFrame = p.game.data.style.sharedFrame;
    const { frame: _f, ...bar } = p.game.data.style?.iconBar ?? {};
    const iconBar = keepFrame ? { ...bar, frame: keepFrame } : bar;
    if (!isEmpty(iconBar)) next.iconBar = iconBar;
  }
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: isEmpty(next) ? game : { ...game, style: next } } };
}

/** The `frame` with `image` set, or removed when undefined. Insets stay, so a new picture keeps its borders. */
function setImage(p: Project, which: FrameKey, imageId: string | undefined): Project {
  if (imageId !== undefined && !p.assets?.data.images.some((i) => i.id === imageId)) throw new CommandError(`There's no image with ID ${imageId}.`);
  const { image: _image, ...rest } = frameOf(p, which) ?? {};
  return withFrame(p, which, imageId === undefined ? rest : { ...rest, image: imageId });
}

/** Picks the image of the shared frame, or clears it (undefined) to go back to the built-in look. */
export function setSharedFrameImage(p: Project, imageId: string | undefined): Project {
  return setImage(p, "sharedFrame", imageId);
}

/** Picks the image of a frame (the icon bar's too), or clears it. */
export function setFrameImage(p: Project, which: FrameKey, imageId: string | undefined): Project {
  return setImage(p, which, imageId);
}

/** Sets a frame's four borders. All-zero insets are saved as no insets. */
export function setFrameInsets(p: Project, which: FrameKey, insets: FrameInsets): Project {
  for (const side of GUIDE_SIDES) {
    if (!Number.isInteger(insets[side]) || insets[side] < 0) throw new CommandError(`The ${side} border is a whole number of pixels, 0 or more.`);
  }
  const { insets: _old, ...rest } = frameOf(p, which) ?? {};
  const zero = GUIDE_SIDES.every((s) => insets[s] === 0);
  return withFrame(p, which, zero ? rest : { ...rest, insets: { left: insets.left, right: insets.right, top: insets.top, bottom: insets.bottom } });
}

/** Images a frame can use, for the picker. */
export function imageOptions(p: Project): PickOption[] {
  return (p.assets?.data.images ?? []).map((i) => ({ id: i.id, label: i.id }));
}

// ── Guides ───────────────────────────────────────────────────────────────────────────────────────────────

/** The largest value a side can take with the opposite side as it is: the borders may meet but not cross. */
export function maxInset(side: GuideSide, insets: FrameInsets, size: ImageSize): number {
  const total = side === "left" || side === "right" ? size.width : size.height;
  const opposite = side === "left" ? insets.right : side === "right" ? insets.left : side === "top" ? insets.bottom : insets.top;
  return Math.max(0, total - Math.min(opposite, total));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** `insets` with one side set, rounded to a whole pixel and held inside the image. */
export function withSide(insets: FrameInsets, side: GuideSide, value: number, size: ImageSize): FrameInsets {
  const v = Number.isFinite(value) ? Math.round(value) : 0;
  return { ...insets, [side]: clamp(v, 0, maxInset(side, insets, size)) };
}

/** Where a pointer at (`x`, `y`) in image pixels puts a guide: the left guide at x means a left border of x. */
export function dragGuide(insets: FrameInsets, side: GuideSide, at: { x: number; y: number }, size: ImageSize): FrameInsets {
  const value = side === "left" ? at.x : side === "right" ? size.width - at.x : side === "top" ? at.y : size.height - at.y;
  return withSide(insets, side, value, size);
}

/** A guide moved `delta` image pixels in the direction it points on screen (right/down is positive). */
export function nudgeGuide(insets: FrameInsets, side: GuideSide, delta: number, size: ImageSize): FrameInsets {
  const signed = side === "left" || side === "top" ? delta : -delta;
  return withSide(insets, side, insets[side] + signed, size);
}

/** A pointer position in the shown image (its on-screen box) as image pixels. */
export function toImagePixels(client: { x: number; y: number }, box: { left: number; top: number; width: number; height: number }, size: ImageSize): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return { x: ((client.x - box.left) / box.width) * size.width, y: ((client.y - box.top) / box.height) * size.height };
}

/**
 * What to tell the creator about insets on an image of this size, as plain sentences. Empty when they leave
 * a repeatable centre. The game draws a frame with no centre as corners only and leaves the middle empty.
 */
export function insetWarnings(insets: FrameInsets, size: ImageSize): string[] {
  const problems = frameInsetProblems(insets, size.width, size.height);
  if (problems.length === 0) return [];
  return [...problems.map((p) => p.message), "With no centre to repeat, the game draws only the corners and leaves the middle of the panel empty."];
}
