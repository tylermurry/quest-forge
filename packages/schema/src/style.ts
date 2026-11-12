import { z } from "zod";
import { Color, Id, SCENE_HEIGHT } from "./common.ts";

// The game-wide skin: one optional `style` object in `game.yaml`.
//
// Absent vs. explicit. No `style` key (or no section inside it) means the creator never
// configured that part, and `resolveStyle` returns what the engine drew before styling
// existed (LEGACY_STYLE), so old projects look the same. A section that is present has its
// missing fields filled from AUTHOR_DEFAULTS, the values the Styling editor shows. No zod
// defaults are used, so what is saved is exactly what the creator set.

/** Pixel border widths of a nine-slice frame: the corners and edges that are never stretched. */
export const FrameInsets = z.strictObject({
  left: z.int().min(0),
  right: z.int().min(0),
  top: z.int().min(0),
  bottom: z.int().min(0),
});
export type FrameInsets = z.infer<typeof FrameInsets>;

export const FRAME_SCALE_MIN = 8;
export const FRAME_SCALE_MAX = 64;
/** How thick a frame's borders are drawn with no `scale` set, in game pixels. */
export const FRAME_SCALE_DEFAULT = 16;

/** One nine-slice frame. Shared by the panels' `sharedFrame` and the `iconBar`. Absent image: built-in art. */
export const Frame = z.strictObject({
  /** Image asset ID. */
  image: Id.optional(),
  /** Absent: all zero. */
  insets: FrameInsets.optional(),
  /**
   * How thick the borders are drawn, in game pixels: the picture is scaled so its thickest border is this wide.
   * Panels only (`sharedFrame`); the icon bar ignores it. Absent: FRAME_SCALE_DEFAULT.
   */
  scale: z.int().min(FRAME_SCALE_MIN).max(FRAME_SCALE_MAX).optional(),
});
export type Frame = z.infer<typeof Frame>;

/** Built-in font families. `monospace` is what the engine draws with today, so it comes first. */
export const FONT_FAMILIES = ["monospace", "serif", "sans-serif"] as const;
export const FontFamily = z.enum(FONT_FAMILIES);
export type FontFamily = z.infer<typeof FontFamily>;

export const TEXT_SIZE_MIN = 6;
export const TEXT_SIZE_MAX = 72;

/**
 * Text look. Either `family` (a built-in) or `font` (a font asset ID), not both.
 */
export const Typography = z
  .strictObject({
    family: FontFamily.optional(),
    font: Id.optional(),
    /** Base text size in pixels. */
    size: z.int().min(TEXT_SIZE_MIN).max(TEXT_SIZE_MAX).optional(),
    color: Color.optional(),
  })
  .refine((t) => t.family === undefined || t.font === undefined, { message: "choose a built-in family or a custom font, not both", path: ["font"] });
export type Typography = z.infer<typeof Typography>;

export const ICON_IDS = ["walk", "look", "hand", "talk", "item", "inventory", "settings"] as const;
export const StyleIconId = z.enum(ICON_IDS);
export type StyleIconId = z.infer<typeof StyleIconId>;

export const IconEffect = z.enum(["brighten", "darken"]);
export type IconEffect = z.infer<typeof IconEffect>;

export const IconBar = z.strictObject({
  frame: Frame.optional(),
  /** Image asset IDs; an absent icon keeps the built-in one. */
  icons: z
    .strictObject({
      walk: Id.optional(),
      look: Id.optional(),
      hand: Id.optional(),
      talk: Id.optional(),
      item: Id.optional(),
      inventory: Id.optional(),
      settings: Id.optional(),
    })
    .optional(),
  effect: IconEffect.optional(),
});
export type IconBar = z.infer<typeof IconBar>;

export const DialogueChoices = z.strictObject({
  highlight: Color.optional(),
  separator: Color.optional(),
});
export type DialogueChoices = z.infer<typeof DialogueChoices>;

export const NARRATION_WIDTH_MIN = 20;
export const NARRATION_WIDTH_MAX = 100;

/** Where the narration panel goes. */
export const Narration = z.strictObject({
  /** Game pixels from the top of the screen to the panel. Absent: AUTHOR_DEFAULTS.narration.top. */
  top: z.int().min(0).max(SCENE_HEIGHT).optional(),
  /** Centred up and down instead of `top`, which is kept for when this is turned off. Absent: false. */
  center: z.literal(true).optional(),
  /** Width as a percentage of the screen. Absent: AUTHOR_DEFAULTS.narration.width. */
  width: z.int().min(NARRATION_WIDTH_MIN).max(NARRATION_WIDTH_MAX).optional(),
});
export type Narration = z.infer<typeof Narration>;

/** Character speech. */
export const Speech = z.strictObject({
  /** The colour of every speaker's name. Absent: AUTHOR_DEFAULTS.speech.name. */
  name: Color.optional(),
});
export type Speech = z.infer<typeof Speech>;

export const GameStyle = z.strictObject({
  sharedFrame: Frame.optional(),
  typography: Typography.optional(),
  iconBar: IconBar.optional(),
  dialogueChoices: DialogueChoices.optional(),
  narration: Narration.optional(),
  speech: Speech.optional(),
});
export type GameStyle = z.infer<typeof GameStyle>;

/** Fully filled values for the engine and the editor. */
export interface EffectiveFrame {
  /** Image asset ID; undefined means the built-in art. */
  image: string | undefined;
  insets: FrameInsets;
  /** How thick the borders are drawn, in game pixels. */
  scale: number;
}
export interface EffectiveStyle {
  sharedFrame: EffectiveFrame;
  typography: {
    /** Built-in family, or undefined when `font` is set. */
    family: FontFamily | undefined;
    /** Custom font asset ID. */
    font: string | undefined;
    size: number;
    /** Distance between text lines: 1.2 × size, rounded. */
    lineHeight: number;
    color: string;
  };
  iconBar: {
    frame: EffectiveFrame;
    icons: Partial<Record<StyleIconId, string>>;
    /** `none` is the legacy look (no hover/press effect beyond today's fill). */
    effect: IconEffect | "none";
  };
  dialogueChoices: { highlight: string; separator: string };
  /** `top` in game pixels, or "center"; `width` in percent of the screen. */
  narration: { top: number | "center"; width: number };
  /** `name`: the colour every speaker's name is drawn in. */
  speech: { name: string };
}

const NO_INSETS: FrameInsets = { left: 0, right: 0, top: 0, bottom: 0 };
const NO_FRAME: EffectiveFrame = { image: undefined, insets: NO_INSETS, scale: FRAME_SCALE_DEFAULT };

/** Line height is a fixed ratio of the size, so one number drives both. Legacy 10 px text has 12 px lines. */
export const TEXT_LINE_RATIO = 1.2;

/**
 * What the engine drew before styling existed, for projects with no style:
 * `10px monospace` (TEXT_FONT in engine ui/textbox.ts) with 12 px lines (TEXT_LINE), white
 * text, hovered choice rows filled #c89a3c (ACTIVE in ui/draw.ts) and edged #e8d8a8 (EDGE).
 */
export const LEGACY_STYLE: EffectiveStyle = {
  sharedFrame: NO_FRAME,
  typography: { family: "monospace", font: undefined, size: 10, lineHeight: 12, color: "#ffffff" },
  iconBar: { frame: NO_FRAME, icons: {}, effect: "none" },
  dialogueChoices: { highlight: "#c89a3c", separator: "#e8d8a8" },
  narration: { top: 50, width: 60 },
  // Names have one colour whether or not the creator styled speech; it no longer comes from the character.
  speech: { name: "#e8d8a8" },
};

/** What a section shows for fields the creator left out once they have configured it. */
export const AUTHOR_DEFAULTS = {
  typography: { family: "monospace", size: 16, color: "#ffffff" },
  iconBar: { effect: "brighten" },
  dialogueChoices: { highlight: LEGACY_STYLE.dialogueChoices.highlight, separator: LEGACY_STYLE.dialogueChoices.separator },
  narration: { top: 50, width: 60 },
  speech: { name: LEGACY_STYLE.speech.name },
} as const satisfies { typography: Typography; iconBar: IconBar; dialogueChoices: DialogueChoices; narration: Narration; speech: Speech };

const frameOf = (f: Frame | undefined): EffectiveFrame => (f ? { image: f.image, insets: f.insets ?? NO_INSETS, scale: f.scale ?? FRAME_SCALE_DEFAULT } : NO_FRAME);

/**
 * The style to draw with. An absent style, or an absent section, gives LEGACY_STYLE's values
 * for that section; a present section fills its own gaps from AUTHOR_DEFAULTS.
 */
export function resolveStyle(style: GameStyle | undefined): EffectiveStyle {
  const t = style?.typography;
  const size = t ? (t.size ?? AUTHOR_DEFAULTS.typography.size) : LEGACY_STYLE.typography.size;
  const bar = style?.iconBar;
  const choices = style?.dialogueChoices;
  return {
    sharedFrame: frameOf(style?.sharedFrame),
    typography: t
      ? {
          family: t.font === undefined ? (t.family ?? AUTHOR_DEFAULTS.typography.family) : undefined,
          font: t.font,
          size,
          lineHeight: Math.round(size * TEXT_LINE_RATIO),
          color: t.color ?? AUTHOR_DEFAULTS.typography.color,
        }
      : LEGACY_STYLE.typography,
    iconBar: bar
      ? { frame: frameOf(bar.frame), icons: { ...bar.icons }, effect: bar.effect ?? AUTHOR_DEFAULTS.iconBar.effect }
      : LEGACY_STYLE.iconBar,
    dialogueChoices: choices
      ? { highlight: choices.highlight ?? AUTHOR_DEFAULTS.dialogueChoices.highlight, separator: choices.separator ?? AUTHOR_DEFAULTS.dialogueChoices.separator }
      : LEGACY_STYLE.dialogueChoices,
    narration: style?.narration
      ? { top: style.narration.center ? "center" : (style.narration.top ?? AUTHOR_DEFAULTS.narration.top), width: style.narration.width ?? AUTHOR_DEFAULTS.narration.width }
      : LEGACY_STYLE.narration,
    speech: { name: style?.speech?.name ?? AUTHOR_DEFAULTS.speech.name },
  };
}

export interface InsetProblem {
  axis: "horizontal" | "vertical";
  message: string;
}

/**
 * Why a frame's insets don't fit an image of this size: the left and right borders (or top
 * and bottom) must leave at least one pixel of centre. Needs decoded dimensions, so callers
 * that know them (the Styling editor, the engine on load) use it; the schema can't.
 */
export function frameInsetProblems(insets: FrameInsets, width: number, height: number): InsetProblem[] {
  const out: InsetProblem[] = [];
  if (insets.left + insets.right >= width) {
    out.push({ axis: "horizontal", message: `The left and right borders (${insets.left} + ${insets.right} px) leave no centre in an image ${width} px wide.` });
  }
  if (insets.top + insets.bottom >= height) {
    out.push({ axis: "vertical", message: `The top and bottom borders (${insets.top} + ${insets.bottom} px) leave no centre in an image ${height} px tall.` });
  }
  return out;
}
