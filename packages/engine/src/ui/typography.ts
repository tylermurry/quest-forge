import { LEGACY_STYLE, TEXT_LINE_RATIO, TEXT_SIZE_MAX, TEXT_SIZE_MIN, resolveStyle, type GameStyle } from "@questforge/schema";
import { clampTextScale } from "../saves.ts";

// The text the game draws with: the author's typography (or the legacy look when there is none),
// the font that actually loaded, and the player's Text Size. One place decides font, size, line
// height and color; the drawing code and the layouts read them from here. Pure; tested in Node.

export interface TextStyle {
  /** CSS font-family: the custom font once loaded, else the built-in family. */
  family: string;
  /** Size in px after the player's scale. */
  size: number;
  /** Distance between lines at `size`. */
  line: number;
  /** Body text color. */
  color: string;
  /** The color of every speaker's name (`style.speech.name`). */
  name: string;
  /** The author configured typography. False is the legacy look, which keeps its own per-box colors. */
  custom: boolean;
}

/** Line height for a size: a fixed ratio, so one number drives both. */
export const lineFor = (size: number) => Math.round(size * TEXT_LINE_RATIO);

/** The author's size with the player's percentage applied, kept inside what the Styling editor allows (and twice it at most). */
export function scaledSize(authorSize: number, percent: number): number {
  return Math.max(TEXT_SIZE_MIN, Math.min(TEXT_SIZE_MAX * 2, Math.round((authorSize * clampTextScale(percent)) / 100)));
}

/** What to draw text with: the game's style, the font family that is ready, and the player's size in percent. */
export function textStyle(style: GameStyle | undefined, family: string, percent: number): TextStyle {
  const resolved = resolveStyle(style);
  const t = resolved.typography;
  const size = scaledSize(t.size, percent);
  return { family, size, line: lineFor(size), color: t.color, name: resolved.speech.name, custom: style?.typography !== undefined };
}

/** The Canvas `font` value for a size in this family. */
export const fontOf = (family: string, size: number, bold = false) => `${bold ? "bold " : ""}${size}px ${family}`;

/** Width of text at a size, in px. The real one asks Canvas; tests pass a fake. */
export type Measure = (text: string, size: number, bold?: boolean) => number;

/**
 * Lays out at `size`; if the result doesn't fit, tries one pixel smaller, down to the legacy size
 * (or `size` itself when that is smaller). Larger text shrinks to stay on screen and inside its
 * control, and text the author made small, or the legacy 10 px, is never changed.
 */
export function shrinkToFit<R>(size: number, layout: (size: number) => R, fits: (result: R) => boolean): { size: number; result: R } {
  const floor = Math.min(size, LEGACY_STYLE.typography.size);
  for (let s = size; s > floor; s--) {
    const result = layout(s);
    if (fits(result)) return { size: s, result };
  }
  return { size: floor, result: layout(floor) };
}
