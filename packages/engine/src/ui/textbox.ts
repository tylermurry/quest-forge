import { LEGACY_STYLE, SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Rect } from "../sprite.ts";
import { placeAt, placementWidth, type Placement } from "./layout.ts";
import { lineFor, shrinkToFit, type Measure } from "./typography.ts";

// Text boxes: `narrate` is a centered Sierra box; `say` sits over the
// speaker in their color with their name. With a Frames position (`Placement`) both go there instead. Boxes advance on a click/tap or after a
// time based on length. Layout is pure: the renderer passes a text measurer and the text size.

const PAD = 10;
const MARGIN = 4;
const NARRATE_WIDTH = 360;
const SAY_WIDTH = 240;

export interface TextBox {
  kind: "narrate" | "say";
  text: string;
  /** Speaker (say only). */
  speaker?: { id: string; name: string; color: string; /** Sprite bounds, if on screen. */ anchor: Rect | null };
  /** Seconds until it closes by itself. */
  timeLeft: number;
}

/** How long a box stays up: 1 s + 0.06 s per character, clamped to 2–10 s. */
export const textDuration = (text: string) => Math.min(10, Math.max(2, 1 + 0.06 * text.length));

export function narrateBox(text: string): TextBox {
  return { kind: "narrate", text, timeLeft: textDuration(text) };
}

export function sayBox(text: string, speaker: NonNullable<TextBox["speaker"]>): TextBox {
  return { kind: "say", text, speaker, timeLeft: textDuration(text) };
}

/** Word-wraps to a pixel width. A word longer than the width gets a line of its own. */
export function wrap(measure: (s: string) => number, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** The widest a box's text can be and still leave the box (with its padding) inside the screen. */
const MAX_TEXT_WIDTH = SCENE_WIDTH - MARGIN * 2 - PAD * 2;

/** A text width designed for the legacy text size, grown with larger text and held inside the screen. */
export const boxWidth = (base: number, size: number) => Math.min(MAX_TEXT_WIDTH, Math.round(base * Math.max(1, size / LEGACY_STYLE.typography.size)));

export interface BoxLayout extends Rect {
  /** Speaker name line (say only), drawn above the text. */
  name: string | null;
  lines: string[];
  /** Top of the first text line. */
  textY: number;
  /** The text size the box was laid out at: the one asked for, or smaller when the text wouldn't fit the screen. */
  size: number;
  /** Distance between lines at `size`. */
  line: number;
}

/**
 * Where a text box goes and how its text breaks, in scene space. `text.size` is the size to try; a box
 * that would be taller than the screen is laid out again one pixel smaller until it fits.
 * `placement` (the Frames position, `placementOf`) puts narration and speech alike at its top and width;
 * null keeps the legacy layout: narration a little above the middle, speech over the speaker.
 */
export function layoutTextBox(box: TextBox, measure: Measure, text: { size: number } = LEGACY_STYLE.typography, placement: Placement | null = null): BoxLayout {
  const build = (size: number): BoxLayout => {
    const line = lineFor(size);
    const maxW = placement ? Math.max(1, placementWidth(placement) - PAD * 2) : boxWidth(box.kind === "narrate" ? NARRATE_WIDTH : SAY_WIDTH, size);
    const lines = wrap((t) => measure(t, size), box.text, maxW);
    const name = box.kind === "say" && box.speaker ? box.speaker.name : null;
    const rows = lines.length + (name ? 1 : 0);
    const h = rows * line + PAD * 2;
    if (placement) {
      const r = placeAt(placement, placementWidth(placement), h);
      return { ...r, name, lines, textY: r.y + PAD + (name ? line : 0), size, line };
    }
    const widest = Math.max(...lines.map((l) => measure(l, size)), name ? measure(name, size, true) : 0);
    const w = Math.round(Math.min(maxW, widest) + PAD * 2);
    const clampX = (x: number) => Math.round(Math.max(MARGIN, Math.min(SCENE_WIDTH - MARGIN - w, x)));
    const clampY = (y: number) => Math.round(Math.max(MARGIN, Math.min(SCENE_HEIGHT - MARGIN - h, y)));

    let x: number;
    let y: number;
    const anchor = box.speaker?.anchor;
    if (box.kind === "say" && anchor) {
      x = clampX(anchor.x + anchor.w / 2 - w / 2);
      const above = anchor.y - MARGIN - h;
      y = clampY(above >= MARGIN ? above : anchor.y + anchor.h + MARGIN);
    } else {
      // Centered, a little above the middle.
      x = clampX((SCENE_WIDTH - w) / 2);
      y = clampY((SCENE_HEIGHT - h) / 2 - 40);
    }
    return { x, y, w, h, name, lines, textY: y + PAD + (name ? line : 0), size, line };
  };
  return shrinkToFit(text.size, build, (l) => l.h <= SCENE_HEIGHT - MARGIN * 2).result;
}
