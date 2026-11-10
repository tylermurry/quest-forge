import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// Text boxes: `narrate` is a centered Sierra box; `say` sits over the
// speaker in their color with their name. Boxes advance on a click/tap or after a
// time based on length. Layout is pure: the renderer passes a text measurer.

export const TEXT_FONT = "10px monospace";
export const TEXT_LINE = 12;
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

export type Measure = (s: string) => number;

/** Word-wraps to a pixel width. A word longer than the width gets a line of its own. */
export function wrap(measure: Measure, text: string, width: number): string[] {
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

export interface BoxLayout extends Rect {
  /** Speaker name line (say only), drawn above the text. */
  name: string | null;
  lines: string[];
  /** Top of the first text line. */
  textY: number;
}

/** Where a text box goes and how its text breaks, in scene space. */
export function layoutTextBox(box: TextBox, measure: Measure): BoxLayout {
  const maxW = box.kind === "narrate" ? NARRATE_WIDTH : SAY_WIDTH;
  const lines = wrap(measure, box.text, maxW);
  const name = box.kind === "say" && box.speaker ? box.speaker.name : null;
  const widest = Math.max(...lines.map(measure), name ? measure(name) : 0);
  const w = Math.round(Math.min(maxW, widest) + PAD * 2);
  const rows = lines.length + (name ? 1 : 0);
  const h = rows * TEXT_LINE + PAD * 2;
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
  return { x, y, w, h, name, lines, textY: y + PAD + (name ? TEXT_LINE : 0) };
}
