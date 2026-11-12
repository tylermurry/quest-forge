// Where the Styling preview puts its sample panels and text, in game pixels. DOM-free: the caller passes a text
// measurer, so this runs in Node. The canvas code that draws the result is `ui/game/FramePreview.tsx`.
import { SCENE_HEIGHT, SCENE_WIDTH, type FrameInsets } from "@questforge/schema";
import { boxWidth, lineFor, shrinkToFit, wrap, type Measure } from "@questforge/engine";

export const SAMPLES = [
  { id: "narrationShort", label: "Narration, one sentence" },
  { id: "narrationLong", label: "Narration, several paragraphs" },
  { id: "speech", label: "Character speech" },
  { id: "inventory", label: "Inventory" },
  { id: "choices", label: "Dialogue choices" },
] as const;
export type SampleId = (typeof SAMPLES)[number]["id"];
export type SampleChoice = { id: SampleId; label: string };

/** The samples the Typography preview offers: the text ones, with a choice row. */
export const TYPOGRAPHY_SAMPLES: readonly SampleChoice[] = SAMPLES.filter((s) => s.id !== "inventory");

/** `fit` sizes the panel to its text; the others fix the panel's size to show how the frame stretches. */
export const SHAPES = [
  { id: "fit", label: "Fit to text" },
  { id: "narrow", label: "Narrow" },
  { id: "wide", label: "Wide" },
  { id: "tall", label: "Tall" },
  { id: "short", label: "Short" },
] as const;
export type PreviewShape = (typeof SHAPES)[number]["id"];

const SHAPE_SIZE: Record<Exclude<PreviewShape, "fit">, { w: number; h: number }> = {
  narrow: { w: 110, h: 150 },
  wide: { w: 440, h: 90 },
  tall: { w: 150, h: 320 },
  short: { w: 300, h: 40 },
};

const SAMPLE_TEXT = {
  narrationShort: ["You see a small garden with a pond."],
  narrationLong: [
    "The garden is quiet. A grumpy gardener glares at you from behind a wheelbarrow.",
    "A fishing rod leans against the shed, and the pond ripples as if something is watching.",
    "Perhaps it would be wise to leave the rod alone.",
  ],
  speech: ["Mind the flowers, you clumsy lump. I planted those myself."],
  choices: ["Ask about the pond", "Ask about the rod", "Say goodbye"],
} as const;
const SPEAKER = "Gardener";
const INVENTORY_CELLS = 8;
const CELL = 32;
const GAP = 4;
/** Space between a frame's border and its content. */
const PAD = 6;
const MAX_TEXT_WIDTH: Record<SampleId, number> = { narrationShort: 360, narrationLong: 360, speech: 240, inventory: 260, choices: 300 };

export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PreviewItem =
  | { kind: "text"; text: string; x: number; y: number; align: "center" | "left"; bold: boolean; tone: "text" | "speaker" | "speech" | "choice" | "choiceHighlight" }
  | { kind: "cell"; rect: PreviewRect }
  | { kind: "row"; rect: PreviewRect; highlighted: boolean };
export interface SampleLayout {
  /** The panel, where the frame is drawn. */
  frame: PreviewRect;
  /** The area inside the borders where content goes and is clipped. */
  inner: PreviewRect;
  items: PreviewItem[];
  /** The text size used: the one asked for, or smaller when a panel that fits its text would be taller than the screen. */
  size: number;
}

/** Lays out one sample panel, centred in the 640×400 game screen. `text.size` is the size to try. */
export function layoutSample(sample: SampleId, shape: PreviewShape, insets: FrameInsets, text: { size: number }, measure: Measure): SampleLayout {
  // Like the game's own text boxes, a panel sized to its text gets smaller text rather than run off the screen.
  const fixed = shape === "fit" ? null : SHAPE_SIZE[shape];
  return shrinkToFit(
    text.size,
    (size) => layoutAt(sample, fixed, insets, size, measure),
    (l) => fixed !== null || (l.frame.h <= SCENE_HEIGHT && l.frame.w <= SCENE_WIDTH),
  ).result;
}

function layoutAt(sample: SampleId, fixed: { w: number; h: number } | null, insets: FrameInsets, size: number, measureAt: Measure): SampleLayout {
  const lh = lineFor(size);
  const measure = (s: string, bold = false) => measureAt(s, size, bold);
  const padL = insets.left + PAD;
  const padR = insets.right + PAD;
  const padT = insets.top + PAD;
  const padB = insets.bottom + PAD;
  const textWidth = fixed ? Math.max(8, fixed.w - padL - padR) : boxWidth(MAX_TEXT_WIDTH[sample], size);

  // Content in panel-relative coordinates (origin: top-left of the inner area).
  const items: PreviewItem[] = [];
  let contentW = 0;
  let contentH = 0;
  const addText = (s: string, tone: "text" | "speaker" | "speech" | "choice" | "choiceHighlight", align: "center" | "left", bold = false, y = contentH) => {
    items.push({ kind: "text", text: s, x: 0, y, align, bold, tone });
    contentW = Math.max(contentW, measure(s, bold));
  };
  if (sample === "inventory") {
    addText("Inventory", "text", "center", true);
    contentH += lh + GAP;
    const cols = Math.max(1, Math.floor(((fixed ? textWidth : 4 * (CELL + GAP) - GAP) + GAP) / (CELL + GAP)));
    for (let i = 0; i < INVENTORY_CELLS; i++) {
      const rect = { x: (i % cols) * (CELL + GAP), y: contentH + Math.floor(i / cols) * (CELL + GAP), w: CELL, h: CELL };
      items.push({ kind: "cell", rect });
      contentW = Math.max(contentW, rect.x + CELL);
    }
    contentH += Math.ceil(INVENTORY_CELLS / cols) * (CELL + GAP) - GAP;
  } else if (sample === "choices") {
    const rowH = lh + 4;
    SAMPLE_TEXT.choices.forEach((c, i) => {
      items.push({ kind: "row", rect: { x: 0, y: contentH, w: 0, h: rowH }, highlighted: i === 0 });
      addText(wrap((t) => measure(t), c, textWidth)[0] ?? c, i === 0 ? "choiceHighlight" : "choice", "left", false, contentH + 2);
      contentH += rowH + 2;
    });
    contentH -= 2;
    contentW += 8;
  } else {
    if (sample === "speech") {
      addText(SPEAKER, "speaker", "center", true);
      contentH += lh;
    }
    for (const paragraph of SAMPLE_TEXT[sample === "speech" ? "speech" : sample]) {
      for (const line of wrap((t) => measure(t), paragraph, textWidth)) {
        addText(line, sample === "speech" ? "speech" : "text", "center");
        contentH += lh;
      }
      if (sample === "narrationLong") contentH += Math.round(lh / 2);
    }
    if (sample === "narrationLong") contentH -= Math.round(lh / 2);
  }

  const w = fixed ? fixed.w : Math.round(contentW) + padL + padR;
  const h = fixed ? fixed.h : contentH + padT + padB;
  const frame = { x: Math.round((SCENE_WIDTH - w) / 2), y: Math.round((SCENE_HEIGHT - h) / 2), w, h };
  const inner = { x: frame.x + padL, y: frame.y + padT, w: Math.max(0, w - padL - padR), h: Math.max(0, h - padT - padB) };
  // Centred lines centre in the inner area; rows fill its width.
  const placed = items.map((it): PreviewItem => {
    if (it.kind === "text") return { ...it, x: it.align === "center" ? inner.x + inner.w / 2 : inner.x + 4, y: inner.y + it.y };
    if (it.kind === "cell") return { ...it, rect: { ...it.rect, x: inner.x + it.rect.x, y: inner.y + it.rect.y } };
    return { ...it, rect: { ...it.rect, x: inner.x, y: inner.y + it.rect.y, w: inner.w } };
  });
  return { frame, inner, items: placed, size };
}
