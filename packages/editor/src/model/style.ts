// The game-wide skin, as the Styling editor edits it: pure Project → Project commands for the frames and the
// typography and the icon bar, the guide-drag math of the nine-slice editor, and the warnings for insets that
// don't fit the image. DOM-free. `which` names the frame, so the Icon Bar editor reuses the frame commands unchanged.
import { Color, DialogueChoices, IconEffect, TEXT_SIZE_MAX, TEXT_SIZE_MIN, Typography, frameInsetProblems, type Frame, type FrameInsets, type FontFamily, type GameStyle, type IconBar, type Project, type StyleIconId } from "@questforge/schema";
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
  if (which === "iconBar") {
    const { frame: _f, ...bar } = p.game.data.style?.iconBar ?? {};
    return withIconBar(p, keepFrame ? { ...bar, frame: keepFrame } : bar);
  }
  if (keepFrame) next.sharedFrame = keepFrame;
  if (p.game.data.style?.iconBar) next.iconBar = p.game.data.style.iconBar;
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: isEmpty(next) ? game : { ...game, style: next } } };
}

/** Writes the icon bar section (empty removes it) and drops a `style` left empty, so an untouched bar saves as nothing. */
function withIconBar(p: Project, bar: IconBar): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const { iconBar: _old, ...others } = p.game.data.style ?? {};
  const next: GameStyle = isEmpty(bar) ? others : { ...others, iconBar: bar };
  const { style: _style, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: isEmpty(next) ? game : { ...game, style: next } } };
}

/** The `frame` with `image` set, or removed when undefined. Insets stay, so a new picture keeps its borders. */
function setImage(p: Project, which: FrameKey, imageId: string | undefined): Project {
  if (imageId !== undefined && !p.assets?.data.images.some((i) => i.id === imageId)) throw new CommandError(`There's no image with ID ${imageId}.`);
  const { image: _image, ...rest } = frameOf(p, which) ?? {};
  return withFrame(p, which, imageId === undefined ? rest : { ...rest, image: imageId });
}

/** Picks the image of a frame (the shared one or the icon bar's), or clears it. */
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

// ── Icon bar ─────────────────────────────────────────────────────────────────────────────────────────────

/** The icon bar as saved, or undefined while the creator has never set any of it. */
export const iconBarOf = (p: Project): IconBar | undefined => p.game?.data.style?.iconBar;

/** Picks the picture of one bar button, or clears it (undefined) to go back to the built-in icon. */
export function setIcon(p: Project, id: StyleIconId, imageId: string | undefined): Project {
  if (imageId !== undefined && !p.assets?.data.images.some((i) => i.id === imageId)) throw new CommandError(`There's no image with ID ${imageId}.`);
  const { icons, ...rest } = iconBarOf(p) ?? {};
  const { [id]: _old, ...others } = icons ?? {};
  const next = imageId === undefined ? others : { ...others, [id]: imageId };
  return withIconBar(p, isEmpty(next) ? rest : { ...rest, icons: next });
}

/** The one Brighten / Darken effect for hovered and selected buttons. The first edit makes the bar styled. */
export function setIconEffect(p: Project, effect: IconEffect): Project {
  if (!IconEffect.safeParse(effect).success) throw new CommandError("The hover and active effect is Brighten or Darken.");
  return withIconBar(p, { ...iconBarOf(p), effect });
}

// ── Typography ───────────────────────────────────────────────────────────────────────────────────────────

/** The typography as saved, or undefined while the creator has never set any. */
export const typographyOf = (p: Project): Typography | undefined => p.game?.data.style?.typography;

/** Writes the typography section. The first edit creates it; the other style sections are left as they are. */
function withTypography(p: Project, typography: Typography): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const checked = Typography.safeParse(typography);
  if (!checked.success) throw new CommandError("That typography isn't valid.");
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: { ...game, style: { ...p.game.data.style, typography: checked.data } } } };
}

/** Uses a built-in font family. Replaces a custom font if one was set. */
export function setTypographyFamily(p: Project, family: FontFamily): Project {
  const { family: _f, font: _font, ...rest } = typographyOf(p) ?? {};
  return withTypography(p, { ...rest, family });
}

/** Uses a font from the Fonts library. Replaces a built-in family if one was set. */
export function setTypographyFont(p: Project, fontId: string): Project {
  if (!p.assets?.data.fonts?.some((f) => f.id === fontId)) throw new CommandError(`There's no font with ID ${fontId}.`);
  const { family: _f, font: _font, ...rest } = typographyOf(p) ?? {};
  return withTypography(p, { ...rest, font: fontId });
}

/** The text size in pixels, a whole number from TEXT_SIZE_MIN to TEXT_SIZE_MAX. */
export function setTypographySize(p: Project, size: number): Project {
  if (!Number.isInteger(size) || size < TEXT_SIZE_MIN || size > TEXT_SIZE_MAX) throw new CommandError(`The text size is a whole number of pixels from ${TEXT_SIZE_MIN} to ${TEXT_SIZE_MAX}.`);
  return withTypography(p, { ...typographyOf(p), size });
}

/** The text colour, as #rrggbb. */
export function setTypographyColor(p: Project, color: string): Project {
  const hex = color.toLowerCase();
  if (!Color.safeParse(hex).success) throw new CommandError("The text colour is a colour like #ffcc00.");
  return withTypography(p, { ...typographyOf(p), color: hex });
}

/** Fonts the project has, for the picker. */
export function fontOptions(p: Project): PickOption[] {
  return (p.assets?.data.fonts ?? []).map((f) => ({ id: f.id, label: f.id }));
}

// ── Dialogue choices ─────────────────────────────────────────────────────────────────────────────────────

/** The dialogue choices as saved, or undefined while the creator has never set any of it. */
export const dialogueChoicesOf = (p: Project): DialogueChoices | undefined => p.game?.data.style?.dialogueChoices;

/** Writes the dialogue choices section. The first edit creates it; the other style sections are left as they are. */
function withDialogueChoices(p: Project, choices: DialogueChoices): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: { ...game, style: { ...p.game.data.style, dialogueChoices: choices } } } };
}

function choiceColor(p: Project, key: keyof DialogueChoices, color: string, what: string): Project {
  const hex = color.toLowerCase();
  if (!Color.safeParse(hex).success) throw new CommandError(`The ${what} is a colour like #ffcc00.`);
  return withDialogueChoices(p, { ...dialogueChoicesOf(p), [key]: hex });
}

/** The background colour of the hovered or selected choice row, as #rrggbb. */
export const setChoiceHighlight = (p: Project, color: string): Project => choiceColor(p, "highlight", color, "highlight colour");

/** The colour of the line above the choices, as #rrggbb. */
export const setChoiceSeparator = (p: Project, color: string): Project => choiceColor(p, "separator", color, "separator colour");

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
