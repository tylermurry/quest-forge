import { useEffect, useRef, useState } from "react";
import { canvasMeasure, drawNineSlice, drawText, textStyle, type TextStyle } from "@questforge/engine";
import { SCENE_HEIGHT, SCENE_WIDTH, resolveStyle, type EffectiveFrame, type GameStyle } from "@questforge/schema";
import { SAMPLES, SHAPES, layoutSample, type PreviewShape, type SampleChoice, type SampleId, type SampleLayout } from "../../model/stylePreview.ts";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";
import type { CanvasImages } from "../scene/images.ts";

// The Styling preview: one canvas at the game's 640×400, drawn with the engine's own `drawNineSlice`, so what you
// see is what the game draws. All preview drawing is in this file so the later Styling previews can share it.
// Text is placed with the engine's `wrap` and drawn with the engine's `drawText`, the function gameplay draws its
// text with, in the game's typography. A frame with no image, or one that hasn't loaded, shows a plain stand-in
// for the built-in look. The Shared Frames and Typography sections both show this preview.

const ZOOMS = [1, 2] as const;
type Zoom = (typeof ZOOMS)[number];

/** Stand-in colours: the engine's panel fill and edge (`PANEL` and `EDGE` in its ui/draw.ts). */
const BUILT_IN = { fill: "#2a2018", edge: "#e8d8a8" };

function drawBackdrop(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, SCENE_HEIGHT * 0.6);
  sky.addColorStop(0, "#5b8fd0");
  sky.addColorStop(1, "#bfe0f5");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = "#4f8a3c";
  ctx.fillRect(0, SCENE_HEIGHT * 0.6, SCENE_WIDTH, SCENE_HEIGHT * 0.4);
  ctx.fillStyle = "#f6d860";
  ctx.beginPath();
  ctx.arc(90, 70, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a6a2c";
  for (const [x, w] of [[470, 90], [540, 70], [150, 110]] as const) ctx.fillRect(x, SCENE_HEIGHT * 0.6 - 24, w, 24);
  ctx.fillStyle = "#c9b27a";
  ctx.fillRect(250, SCENE_HEIGHT * 0.6, 140, SCENE_HEIGHT * 0.4);
}

export interface PreviewDraw {
  layout: SampleLayout;
  frame: EffectiveFrame;
  /** The decoded frame image, when it has loaded. */
  image: (CanvasImageSource & { width: number; height: number }) | undefined;
  style: GameStyle | undefined;
  /** CSS font-family to draw with: the custom font once it has loaded. */
  family: string;
  zoom: number;
}

const SPEAKER = "#f0c040";

/** The game's colours: the speaker's name and, with no typography configured, speech in the speaker's colour; the author's colour otherwise. */
const textColor = (tone: Extract<SampleLayout["items"][number], { kind: "text" }>["tone"], t: TextStyle) =>
  tone === "speaker" || (tone === "speech" && !t.custom) ? SPEAKER : tone === "choiceHighlight" ? "#000" : t.color;

/** Draws the backdrop, the panel and its content. */
export function drawPreview(ctx: CanvasRenderingContext2D, d: PreviewDraw) {
  const t = textStyle(d.style, d.family, 100);
  const dialogueChoices = resolveStyle(d.style).dialogueChoices;
  ctx.setTransform(d.zoom, 0, 0, d.zoom, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawBackdrop(ctx);
  const { frame, inner, items } = d.layout;
  if (d.image) drawNineSlice(ctx, d.image, d.frame.insets, frame);
  else {
    ctx.fillStyle = BUILT_IN.fill;
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    ctx.strokeStyle = BUILT_IN.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(frame.x + 1, frame.y + 1, frame.w - 2, frame.h - 2);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  for (const it of items) {
    if (it.kind === "row") {
      if (it.highlighted) {
        ctx.fillStyle = dialogueChoices.highlight;
        ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      }
    } else if (it.kind === "cell") {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(it.rect.x + 0.5, it.rect.y + 0.5, it.rect.w - 1, it.rect.h - 1);
    } else {
      drawText(ctx, t, it.text, it.x, it.y, { size: d.layout.size, align: it.align, baseline: "top", bold: it.bold, color: textColor(it.tone, t) });
    }
  }
  ctx.restore();
}

/** The sample, shape and zoom controls above the canvas. */
function Choice<T extends string | number>(props: { label: string; value: T; options: readonly { id: T; label: string }[]; onPick(v: T): void }) {
  return (
    <div role="group" aria-label={props.label} className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground w-14 text-[11px]">{props.label}</span>
      {props.options.map((o) => (
        <Button key={o.id} type="button" size="xs" variant={o.id === props.value ? "secondary" : "ghost"} aria-pressed={o.id === props.value} onClick={() => props.onPick(o.id)} className={cn("text-[12px]", o.id === props.value && "font-semibold")}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Shows the frame on sample panels. `frame` is what is being edited (a drag in progress included); `images` are
 * the editor's decoded images, so an image loaded for the scene editor is shown without loading it again.
 */
export function FramePreview(props: {
  frame: EffectiveFrame;
  style: GameStyle | undefined;
  images: CanvasImages;
  /** CSS font-family for the text, from `useStyleFont`. */
  family: string;
  /** Which samples to offer; default all. */
  samples?: readonly SampleChoice[];
  /** Offer the panel shapes (Shared Frames, to see the frame stretch); the panel then always fits its text. Default true. */
  shapes?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const { frame, style, images, family } = props;
  const samples = props.samples ?? SAMPLES;
  const [sample, setSample] = useState<SampleId>(samples[0]!.id);
  const [shape, setShape] = useState<PreviewShape>("fit");
  const [zoom, setZoom] = useState<Zoom>(1);
  // `images` re-renders the caller when an image finishes loading, which gives `loaded` its value.
  const loaded = frame.image ? images.lookup(frame.image) : undefined;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const t = textStyle(style, family, 100);
    const layout = layoutSample(sample, props.shapes === false ? "fit" : shape, frame.insets, t, canvasMeasure(ctx, family));
    // The store only holds an image once it has decoded; an unattached <img> reports its natural size.
    const ready = loaded && loaded.size.w > 0 ? (loaded.el as HTMLImageElement) : undefined;
    drawPreview(ctx, { layout, frame, image: ready, style, family, zoom });
  }, [sample, shape, zoom, frame, style, loaded, family, props.shapes]);

  return (
    <div className="grid gap-2" aria-label="Frame preview">
      <Choice<SampleId> label="Sample" value={sample} options={samples} onPick={setSample} />
      {props.shapes !== false && <Choice<PreviewShape> label="Shape" value={shape} options={SHAPES} onPick={setShape} />}
      <Choice<Zoom> label="Zoom" value={zoom} options={ZOOMS.map((z) => ({ id: z, label: `${z}×` }))} onPick={setZoom} />
      <div className="overflow-auto rounded-md border">
        <canvas
          ref={canvas}
          width={SCENE_WIDTH * zoom}
          height={SCENE_HEIGHT * zoom}
          aria-label="Preview of the frame on a sample panel"
          role="img"
          className="block max-w-none"
          style={{ width: zoom === 1 ? "100%" : SCENE_WIDTH * zoom, maxWidth: SCENE_WIDTH * zoom, aspectRatio: `${SCENE_WIDTH} / ${SCENE_HEIGHT}`, imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}
