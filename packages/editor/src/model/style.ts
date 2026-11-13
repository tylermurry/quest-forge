// The game-wide skin, as the Styling editor edits it: pure Project → Project commands for the frames and the
// typography and the icon bar, the guide-drag math of the nine-slice editor, and the warnings for insets that
// don't fit the image. DOM-free. `which` names the frame, so the Icon Bar editor reuses the frame commands unchanged.
import { AUTHOR_DEFAULTS, Color, DialogueChoices, FRAME_SCALE_MAX, FRAME_SCALE_MIN, NARRATION_WIDTH_MAX, NARRATION_WIDTH_MIN, Narration, SCENE_HEIGHT, SCHEMA_VERSION, IconEffect, TEXT_SIZE_MAX, TEXT_SIZE_MIN, Typography, definedIds, frameInsetProblems, type Frame, type FrameInsets, type FontFamily, type GameStyle, type IconBar, type Project, type StyleIconId } from "@questforge/schema";
import { CommandError, uniqueId } from "./commands.ts";
import type { StylingSection } from "./gameSettings.ts";
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

/**
 * The default look for panels: a picture in the project's Images library, already cut into nine pieces. New
 * projects have it; Use default look puts it back. Its bytes come from `builtInFrame.ts`.
 */
export const BUILT_IN_FRAME = { id: "frame", path: "assets/images/Styling/frame.jpg", insets: { left: 12, right: 12, top: 12, bottom: 12 } } as const;

/** Whether the shared frame is the built-in picture. */
export function isBuiltInFrame(p: Project): boolean {
  const id = frameOf(p, "sharedFrame")?.image;
  return id !== undefined && p.assets?.data.images.some((i) => i.id === id && i.path === BUILT_IN_FRAME.path) === true;
}

/**
 * Makes the built-in picture the shared frame, with its borders. Adds it to the Images library (in Styling) when
 * it isn't there, and reuses it when it is. `bytes` is the picture, written with the project's next save.
 */
export function applyBuiltInFrame(p: Project, bytes: Uint8Array): Project {
  const images = p.assets?.data.images ?? [];
  let q = p;
  let id = images.find((i) => i.path === BUILT_IN_FRAME.path)?.id;
  if (id === undefined) {
    id = uniqueId(BUILT_IN_FRAME.id, definedIds(p, "image"));
    const assets = p.assets ?? { path: "assets.yaml", data: { schemaVersion: SCHEMA_VERSION, images: [], audio: [] } };
    // A file already at that path is left as it is; it is only listed.
    const pendingFiles = p.files.includes(BUILT_IN_FRAME.path) ? p.pendingFiles : { ...p.pendingFiles, [BUILT_IN_FRAME.path]: bytes };
    q = { ...p, assets: { ...assets, data: { ...assets.data, images: [...images, { id, path: BUILT_IN_FRAME.path }] } }, pendingFiles };
  }
  return setFrameInsets(setFrameImage(q, "sharedFrame", id), "sharedFrame", BUILT_IN_FRAME.insets);
}

/** How thick the panels' frame borders are drawn, in game pixels, a whole number from FRAME_SCALE_MIN to FRAME_SCALE_MAX. */
export function setFrameScale(p: Project, scale: number): Project {
  if (!Number.isInteger(scale) || scale < FRAME_SCALE_MIN || scale > FRAME_SCALE_MAX) throw new CommandError(`The scale is a whole number of pixels from ${FRAME_SCALE_MIN} to ${FRAME_SCALE_MAX}.`);
  return withFrame(p, "sharedFrame", { ...frameOf(p, "sharedFrame"), scale });
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

/** The text color, as #rrggbb. */
export function setTypographyColor(p: Project, color: string): Project {
  const hex = color.toLowerCase();
  if (!Color.safeParse(hex).success) throw new CommandError("The text color is a color like #ffcc00.");
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

function choiceColor(p: Project, key: "separator", color: string, what: string): Project {
  const hex = color.toLowerCase();
  if (!Color.safeParse(hex).success) throw new CommandError(`The ${what} is a color like #ffcc00.`);
  return withDialogueChoices(p, { ...dialogueChoicesOf(p), [key]: hex });
}

/** How the hovered or selected choice row is marked: brightened or darkened. */
export function setChoiceEffect(p: Project, effect: IconEffect): Project {
  if (!IconEffect.safeParse(effect).success) throw new CommandError("The choice hover effect is Brighten or Darken.");
  return withDialogueChoices(p, { ...dialogueChoicesOf(p), effect });
}

/** The color of the line above the choices, as #rrggbb. */
export const setChoiceSeparator = (p: Project, color: string): Project => choiceColor(p, "separator", color, "separator color");

// ── Speech ───────────────────────────────────────────────────────────────────────────────────────────────

/** The color of every speaker's name, as #rrggbb. Creates the speech section; the others are left as they are. */
export function setSpeechNameColor(p: Project, color: string): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const hex = color.toLowerCase();
  if (!Color.safeParse(hex).success) throw new CommandError("The name color is a color like #ffcc00.");
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: { ...game, style: { ...p.game.data.style, speech: { ...p.game.data.style?.speech, name: hex } } } } };
}

// ── Narration ────────────────────────────────────────────────────────────────────────────────────────────

/** Where narration goes, as saved, or undefined while the creator has never set it. */
export const narrationOf = (p: Project): Narration | undefined => p.game?.data.style?.narration;

function withNarration(p: Project, narration: Narration): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const checked = Narration.safeParse(narration);
  if (!checked.success) throw new CommandError("That narration placement isn't valid.");
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: { ...game, style: { ...p.game.data.style, narration: checked.data } } } };
}

/** Game pixels from the top of the screen to the narration panel, a whole number from 0 to the screen height. */
export function setNarrationTop(p: Project, top: number): Project {
  if (!Number.isInteger(top) || top < 0 || top > SCENE_HEIGHT) throw new CommandError(`The top is a whole number of pixels from 0 to ${SCENE_HEIGHT}.`);
  return withNarration(p, { ...narrationOf(p), top });
}

/** Centres narration up and down (the top is kept for when centring is turned off), or stops centring. */
export function setNarrationCenter(p: Project, center: boolean): Project {
  const { center: _old, ...rest } = narrationOf(p) ?? {};
  return withNarration(p, center ? { ...rest, center: true } : rest);
}

/** The narration panel's width, a whole percentage of the screen from NARRATION_WIDTH_MIN to NARRATION_WIDTH_MAX. */
export function setNarrationWidth(p: Project, width: number): Project {
  if (!Number.isInteger(width) || width < NARRATION_WIDTH_MIN || width > NARRATION_WIDTH_MAX) throw new CommandError(`The width is a whole percentage from ${NARRATION_WIDTH_MIN} to ${NARRATION_WIDTH_MAX}.`);
  return withNarration(p, { ...narrationOf(p), width });
}

// ── Reset to Default ─────────────────────────────────────────────────────────────────────────────────────

/** The Styling sections that have settings, so a Reset to Default. Inventory has none yet. */
export type ResettableSection = Exclude<StylingSection, "inventory">;
export const RESETTABLE_SECTIONS: readonly ResettableSection[] = ["frames", "typography", "characterDialogue", "iconBar"];

/** Sets the style sections in `patch` (undefined removes one) and drops a `style` left empty, so a reset saves no needless defaults. */
function withStyleSections(p: Project, patch: { [K in keyof GameStyle]?: GameStyle[K] | undefined }): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  const merged = { ...p.game.data.style, ...patch };
  const next = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as GameStyle;
  const { style: _old, ...game } = p.game.data;
  return { ...p, game: { ...p.game, data: isEmpty(next) ? game : { ...game, style: next } } };
}

/**
 * Puts one Styling section back to what a new project starts with (the same code builds a new project's style, so
 * the two can't drift). Frames: the built-in picture and its borders, no scale, no narration placement (`frameBytes`
 * is the picture, added to the Images library only if it isn't there). Typography: the default size only.
 * Character Dialogue: no speech section, the default choice effect. Icon Bar: no icon bar section. Nothing is
 * removed from the Images or Fonts libraries, and no other section changes.
 */
export function resetStylingSection(p: Project, section: ResettableSection, frameBytes: Uint8Array): Project {
  switch (section) {
    case "frames":
      return applyBuiltInFrame(withStyleSections(p, { sharedFrame: undefined, narration: undefined }), frameBytes);
    case "typography":
      return withStyleSections(p, { typography: { size: AUTHOR_DEFAULTS.typography.size } });
    case "characterDialogue":
      return withStyleSections(p, { speech: undefined, dialogueChoices: { effect: AUTHOR_DEFAULTS.dialogueChoices.effect } });
    case "iconBar":
      return withStyleSections(p, { iconBar: undefined });
  }
}

/** Whether the section's saved data is exactly what `resetStylingSection` would leave, so there is nothing to reset. */
export function isStylingSectionDefault(p: Project, section: ResettableSection): boolean {
  switch (section) {
    case "frames": {
      const frame = frameOf(p, "sharedFrame");
      return isBuiltInFrame(p) && frame !== undefined && Object.keys(frame).length === 2 && GUIDE_SIDES.every((side) => frame.insets?.[side] === BUILT_IN_FRAME.insets[side]) && narrationOf(p) === undefined;
    }
    case "typography": {
      const typography = typographyOf(p);
      return typography !== undefined && Object.keys(typography).length === 1 && typography.size === AUTHOR_DEFAULTS.typography.size;
    }
    case "characterDialogue": {
      const choices = dialogueChoicesOf(p);
      return p.game?.data.style?.speech === undefined && choices !== undefined && Object.keys(choices).length === 1 && choices.effect === AUTHOR_DEFAULTS.dialogueChoices.effect;
    }
    case "iconBar":
      return iconBarOf(p) === undefined;
  }
}

// ── Guides ───────────────────────────────────────────────────────────────────────────────────────────────

// The four borders move in lock step: every corner is the same square, so a frame is one border size.

/** The thickest border a picture can have: always leaves at least one pixel of centre to repeat. */
export function maxBorder(size: ImageSize): number {
  return Math.max(0, Math.floor((Math.min(size.width, size.height) - 1) / 2));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** All four borders set to `value`, rounded to a whole pixel and held to `maxBorder`. */
export function uniformInsets(value: number, size: ImageSize): FrameInsets {
  const v = clamp(Number.isFinite(value) ? Math.round(value) : 0, 0, maxBorder(size));
  return { left: v, right: v, top: v, bottom: v };
}

/** The one border size of `insets`; a frame saved with unequal borders reads as its thickest. */
export const borderOf = (insets: FrameInsets): number => Math.max(insets.left, insets.right, insets.top, insets.bottom);

/** Where a pointer at (`x`, `y`) in image pixels puts every guide: the left guide at x means a border of x. */
export function dragGuide(side: GuideSide, at: { x: number; y: number }, size: ImageSize): FrameInsets {
  const value = side === "left" ? at.x : side === "right" ? size.width - at.x : side === "top" ? at.y : size.height - at.y;
  return uniformInsets(value, size);
}

/** Every guide moved `delta` image pixels, in the direction the moved guide points on screen (right/down is positive). */
export function nudgeGuide(insets: FrameInsets, side: GuideSide, delta: number, size: ImageSize): FrameInsets {
  const signed = side === "left" || side === "top" ? delta : -delta;
  return uniformInsets(borderOf(insets) + signed, size);
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
