// Where the Styling preview puts its sample panels and text, in game pixels. DOM-free: the caller passes a text
// measurer, so this runs in Node. The canvas code that draws the result is `ui/game/FramePreview.tsx`.
import { SCENE_HEIGHT, SCENE_WIDTH, type EffectiveStyle, type FrameInsets } from "@questforge/schema";
import { boxWidth, lineFor, shrinkToFit, wrap, type ChoiceBox, type Measure } from "@questforge/engine";
import type { StylingSection } from "./gameSettings.ts";

export const SAMPLES = [
  { id: "narrationShort", label: "Short Narration" },
  { id: "narrationLong", label: "Long Narration" },
  { id: "speech", label: "Character Speech" },
  { id: "choices", label: "Dialogue Choice" },
  { id: "inventory", label: "Inventory" },
  { id: "iconBar", label: "Icon Bar" },
] as const;
export type SampleId = (typeof SAMPLES)[number]["id"];
/** The samples drawn as a panel on the shared frame; the Icon Bar sample is the engine's bar instead. */
export type PanelSampleId = Exclude<SampleId, "iconBar">;

/** The sample the one Styling preview switches to when a section opens; Typography keeps whatever is showing. */
export const SECTION_SAMPLE: Record<StylingSection, SampleId | null> = {
  frames: "narrationShort",
  typography: null,
  characterDialogue: "speech",
  inventory: "inventory",
  iconBar: "iconBar",
};

/** The frame as the preview draws it: its borders, and how thick they are drawn (`EffectiveFrame.scale`). */
export interface PreviewFrame {
  insets: FrameInsets;
  scale: number;
}

/** How much the frame picture is scaled when drawn, so its thickest border is `scale` game pixels. 1 with no borders. */
export function frameScale(f: PreviewFrame): number {
  const thickest = Math.max(f.insets.left, f.insets.right, f.insets.top, f.insets.bottom);
  return thickest > 0 ? f.scale / thickest : 1;
}

const SAMPLE_TEXT = {
  narrationShort: ["You see a small garden with a pond."],
  narrationLong: [
    "The garden is quiet. A grumpy gardener glares at you from behind a wheelbarrow.",
    "A fishing rod leans against the shed, and the pond ripples as if something is watching.",
    "Perhaps it would be wise to leave the rod alone.",
  ],
  speech: ["Mind the flowers, you clumsy lump. I planted those myself."],
  choices: ["Ask about the pond", "Ask about the rod", "Ask about the weather", "Say goodbye"],
} as const;
/** The line the choices answer, said by the speaker above them. */
const CHOICES_PROMPT = "Well? What do you want to know?";
const SPEAKER = "Gardener";
const INVENTORY_CELLS = 8;
const CELL = 32;
const GAP = 4;
/** The gap inside the choices box around its rows, and between rows: GAP × 2 and GAP in the engine's `choiceLayout`. */
const CHOICE_PAD = 8;
const CHOICE_GAP = 4;
/** Widest text for panels that fit their content (narration has a fixed panel width instead). */
const MAX_TEXT_WIDTH: Record<Exclude<PanelSampleId, "narrationShort" | "narrationLong">, number> = { speech: 240, inventory: 260, choices: 300 };

export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PreviewItem =
  | { kind: "text"; text: string; x: number; y: number; align: "center" | "left"; bold: boolean; /** `speaker`: a name, in the name colour; `text`: everything else, in the text colour. */ tone: "text" | "speaker" }
  | { kind: "cell"; rect: PreviewRect }
  /** The dialogue list box, drawn by the engine's own choices drawing. `box` has the engine's shape: its rows are the hit areas. */
  | { kind: "choices"; box: ChoiceBox; options: readonly string[] };
export interface SampleLayout {
  /** The panel, where the frame is drawn. */
  frame: PreviewRect;
  /** The area inside the borders where content goes and is clipped. */
  inner: PreviewRect;
  items: PreviewItem[];
  /** The text size used: the one asked for, or smaller when a panel that fits its text would be taller than the screen. */
  size: number;
  /** How much the frame picture is scaled when drawn (`frameScale`). */
  scale: number;
}

/** Where narration goes: `top` in game pixels or "center", `width` in percent of the screen. */
export type NarrationPlacement = EffectiveStyle["narration"];

/**
 * Lays out one sample panel in the 640×400 game screen, centred across. Narration is `narration.width` percent of
 * the screen wide and sits `narration.top` pixels down (or in the middle); the other panels fit their content and
 * sit in the upper third. Content starts right inside the drawn borders: the frame's borders are the padding.
 * `text.size` is the size to try.
 */
export function layoutSample(sample: PanelSampleId, frame: PreviewFrame, narration: NarrationPlacement, text: { size: number }, measure: Measure): SampleLayout {
  // Like the game's own text boxes, a panel taller than the screen gets smaller text rather than run off it.
  return shrinkToFit(text.size, (size) => layoutAt(sample, frame, narration, size, measure), (l) => l.frame.h <= SCENE_HEIGHT && l.frame.w <= SCENE_WIDTH).result;
}

function layoutAt(sample: PanelSampleId, look: PreviewFrame, placement: NarrationPlacement, size: number, measureAt: Measure): SampleLayout {
  const lh = lineFor(size);
  const measure = (s: string, bold = false) => measureAt(s, size, bold);
  const scale = frameScale(look);
  const pad = (side: keyof FrameInsets) => Math.round(look.insets[side] * scale);
  const padL = pad("left");
  const padR = pad("right");
  const padT = pad("top");
  const padB = pad("bottom");
  const narration = sample === "narrationShort" || sample === "narrationLong";
  const narrationW = Math.round((SCENE_WIDTH * placement.width) / 100);
  const textWidth = narration ? Math.max(8, narrationW - padL - padR) : boxWidth(MAX_TEXT_WIDTH[sample], size);

  // Content in panel-relative coordinates (origin: top-left of the inner area).
  const items: PreviewItem[] = [];
  let contentW = 0;
  let contentH = 0;
  const addText = (s: string, tone: "text" | "speaker", align: "center" | "left", bold = false, y = contentH) => {
    items.push({ kind: "text", text: s, x: 0, y, align, bold, tone });
    contentW = Math.max(contentW, measure(s, bold));
  };
  if (sample === "inventory") {
    addText("Inventory", "text", "center", true);
    contentH += lh + GAP;
    const cols = 4;
    for (let i = 0; i < INVENTORY_CELLS; i++) {
      const rect = { x: (i % cols) * (CELL + GAP), y: contentH + Math.floor(i / cols) * (CELL + GAP), w: CELL, h: CELL };
      items.push({ kind: "cell", rect });
      contentW = Math.max(contentW, rect.x + CELL);
    }
    contentH += Math.ceil(INVENTORY_CELLS / cols) * (CELL + GAP) - GAP;
  } else if (sample === "choices") {
    addText(SPEAKER, "speaker", "center", true);
    contentH += lh;
    for (const line of wrap((t) => measure(t), CHOICES_PROMPT, textWidth)) {
      addText(line, "text", "center");
      contentH += lh;
    }
    contentH += CHOICE_GAP;
    // Row text is cut to the room it has, as the engine does; the box is as wide as its longest row.
    const options = SAMPLE_TEXT.choices.map((c) => wrap((t) => measure(t), c, textWidth)[0] ?? c);
    const rowH = lh + 4;
    const h = CHOICE_PAD * 2 + options.length * (rowH + CHOICE_GAP) - CHOICE_GAP;
    items.push({ kind: "choices", box: { panel: { x: 0, y: contentH, w: 0, h }, rows: options.map((_, i) => ({ x: 0, y: contentH + CHOICE_PAD + i * (rowH + CHOICE_GAP), w: 0, h: rowH })), first: 0, more: null, pages: 1 }, options });
    contentW = Math.max(contentW, ...options.map((o) => measure(o) + 16 + CHOICE_PAD * 2));
    contentH += h;
  } else {
    if (sample === "speech") {
      addText(SPEAKER, "speaker", "center", true);
      contentH += lh;
    }
    for (const paragraph of SAMPLE_TEXT[sample === "speech" ? "speech" : sample]) {
      for (const line of wrap((t) => measure(t), paragraph, textWidth)) {
        addText(line, "text", "center");
        contentH += lh;
      }
      if (sample === "narrationLong") contentH += Math.round(lh / 2);
    }
    if (sample === "narrationLong") contentH -= Math.round(lh / 2);
  }

  const w = narration ? narrationW : Math.round(contentW) + padL + padR;
  const h = contentH + padT + padB;
  // Down: narration where the creator put it; the others centred on the line a third of the way from the top. Kept on the screen.
  const wanted = !narration ? SCENE_HEIGHT / 3 - h / 2 : placement.top === "center" ? (SCENE_HEIGHT - h) / 2 : placement.top;
  const y = Math.max(0, Math.min(SCENE_HEIGHT - h, Math.round(wanted)));
  const frame = { x: Math.round((SCENE_WIDTH - w) / 2), y, w, h };
  const inner = { x: frame.x + padL, y: frame.y + padT, w: Math.max(0, w - padL - padR), h: Math.max(0, h - padT - padB) };
  // Centred lines centre in the inner area; rows fill its width.
  const placed = items.map((it): PreviewItem => {
    if (it.kind === "text") return { ...it, x: it.align === "center" ? inner.x + inner.w / 2 : inner.x + 4, y: inner.y + it.y };
    if (it.kind === "cell") return { ...it, rect: { ...it.rect, x: inner.x + it.rect.x, y: inner.y + it.rect.y } };
    const { panel, rows } = it.box;
    return { ...it, box: { ...it.box, panel: { x: inner.x, y: inner.y + panel.y, w: inner.w, h: panel.h }, rows: rows.map((r) => ({ x: inner.x + CHOICE_PAD, y: inner.y + r.y, w: inner.w - CHOICE_PAD * 2, h: r.h })) } };
  });
  return { frame, inner, items: placed, size, scale };
}
