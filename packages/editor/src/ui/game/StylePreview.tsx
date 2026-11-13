import { Scaling } from "lucide-react";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { canvasMeasure, choicesLook, computeLayout, drawChoiceRows, drawIconBar, drawNineSlice, drawText, hitButton, lineFor, textStyle, type IconBarLook, type TextStyle, type Vec } from "@questforge/engine";
import { SCENE_HEIGHT, SCENE_WIDTH, resolveStyle, type EffectiveFrame, type GameStyle } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { SAMPLES, layoutSample, type PreviewRect, type SampleId, type SampleLayout } from "../../model/stylePreview.ts";
import { Button } from "../components/ui/button.tsx";
import { ToggleBar } from "../components/ui/toggle-group.tsx";
import { checkerboard } from "../scene/draw.ts";
import { useCanvasImages } from "../scene/images.ts";
import { FrameDraftContext } from "./FrameControls.tsx";
import { useStyleFont } from "./useStyleFont.ts";

// The Styling preview: the one preview above every Styling section, a 640×400 canvas drawn with the engine's own
// functions, so what you see is what the game draws, on the checkerboard a scene with no background shows.
// Panel samples: the engine's `drawNineSlice` (the frame scaled to its Scale), `drawText` in the game's typography
// and, for the choices, `drawChoiceRows`; pointing at a row, clicking it or the up and down arrow keys show its
// highlight. The Icon Bar sample: the engine's `drawIconBar` at the top of the screen; pointing, clicking and the
// left and right arrow keys show the hovered and selected looks. A frame with no image, or one that hasn't loaded,
// shows a plain stand-in for the engine's drawn panel. The canvas fills its pane's height (keeping the game's shape);
// Actual game size resizes the pane so the canvas is exactly 640×400.

/** Stand-in colors: the engine's panel fill and edge (`PANEL` and `EDGE` in its ui/draw.ts). */
const BUILT_IN = { fill: "#2a2018", edge: "#e8d8a8" };

export interface PreviewDraw {
  layout: SampleLayout;
  frame: EffectiveFrame;
  /** The decoded frame image, when it has loaded. */
  image: (CanvasImageSource & { width: number; height: number }) | undefined;
  style: GameStyle | undefined;
  /** CSS font-family to draw with: the custom font once it has loaded. */
  family: string;
  /** Where the pointer is, in game pixels: the row under it is drawn highlighted. */
  hover?: Vec | null;
}

/** Names in the one name color (`style.speech.name`); everything else in the text color. */
const textColor = (tone: Extract<SampleLayout["items"][number], { kind: "text" }>["tone"], t: TextStyle) => (tone === "speaker" ? t.name : t.color);

/** The sample's choice rows, top to bottom, as the pointer hits them. */
const choiceRows = (l: SampleLayout) => l.items.flatMap((it) => (it.kind === "choices" ? it.box.rows : []));
const inside = (r: PreviewRect, p: Vec) => p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h;
/** Which choice row a point in game pixels is over, or null. */
export const rowAt = (l: SampleLayout, p: Vec): number | null => {
  const i = choiceRows(l).findIndex((r) => inside(r, p));
  return i < 0 ? null : i;
};
/** A point inside choice row `i`, to draw it as hovered. */
export const rowPoint = (l: SampleLayout, i: number): Vec | null => {
  const r = choiceRows(l)[i];
  return r ? [r.x + r.w / 2, r.y + r.h / 2] : null;
};

/** Draws the backdrop, the panel and its content. */
export function drawPreview(ctx: CanvasRenderingContext2D, d: PreviewDraw) {
  const t = textStyle(d.style, d.family, 100);
  const look = choicesLook(d.style);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  checkerboard(ctx);
  const { frame, inner, items, scale } = d.layout;
  if (d.image) {
    // Scaled down, the picture is smoothed so thin lines don't break up.
    ctx.save();
    ctx.translate(frame.x, frame.y);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = scale < 1;
    drawNineSlice(ctx, d.image, d.frame.insets, { x: 0, y: 0, w: frame.w / scale, h: frame.h / scale });
    ctx.restore();
  } else {
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
    if (it.kind === "choices") {
      const size = d.layout.size;
      drawChoiceRows(ctx, { box: it.box, options: it.options, hover: d.hover ?? null }, { ...t, size, line: lineFor(size) }, look);
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

/** The bar at 1 game pixel per CSS pixel: the largest buttons the game ever draws. */
const BAR_LAYOUT = computeLayout(1);
const BAR_BUTTONS = BAR_LAYOUT.barButtons.map((b) => b.id);
/** Sample score for the bar's text. */
const SCORE = "Score: 12 of 100";

/** Draws the checkerboard and the engine's icon bar at the top of the screen. */
export function drawIconBarPreview(ctx: CanvasRenderingContext2D, d: { look: IconBarLook; style: GameStyle | undefined; family: string; image: (id: string) => CanvasImageSource | undefined; selected: string; hover: Vec | null }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  checkerboard(ctx);
  const bar = { layout: BAR_LAYOUT, selected: d.selected, itemHeld: false, itemImage: undefined, hover: d.hover ? ([d.hover[0], d.hover[1]] as [number, number]) : null, scoreText: SCORE };
  drawIconBar(ctx, bar, textStyle(d.style, d.family, 100), d.look, d.image);
}

/** Space kept around the canvas inside its pane, in CSS pixels. */
const BUFFER = 12;

/** The canvas's on-screen size: as tall as the room allows, as wide as the game's shape gives, held to the width. */
export function fitCanvas(room: { w: number; h: number }): { w: number; h: number } {
  const ratio = SCENE_WIDTH / SCENE_HEIGHT;
  const h = Math.max(0, Math.min(room.h, room.w / ratio));
  return { w: Math.round(h * ratio), h: Math.round(h) };
}

/**
 * The one Styling preview: the samples, an Actual game size button while the canvas isn't 640×400, and the canvas
 * filling the rest of its pane. `onResizePane(delta)` asks for the pane to grow (or shrink) by `delta` pixels.
 * Frame drags in progress come from FrameDraftContext.
 */
export function StylePreview(props: { actions: Actions; sample: SampleId; onSample(s: SampleId): void; onResizePane(delta: number): void }) {
  const { sample } = props;
  const p = props.actions.editor.project;
  const images = useCanvasImages(p);
  const style = p.game?.data.style;
  const family = useStyleFont(p, style, images).family;
  const drafts = useContext(FrameDraftContext)?.drafts ?? {};
  const resolved = resolveStyle(style);
  const frame: EffectiveFrame = { ...resolved.sharedFrame, insets: drafts.sharedFrame ?? resolved.sharedFrame.insets };
  const bar: IconBarLook = { ...resolved.iconBar, frame: { ...resolved.iconBar.frame, insets: drafts.iconBar ?? resolved.iconBar.frame.insets } };

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  // The choice row or bar button under the pointer, and the row a click or the arrow keys picked.
  const [over, setOver] = useState<Vec | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [selected, setSelected] = useState("walk");
  const shown = useRef<SampleLayout | null>(null);
  const loaded = frame.image ? images.lookup(frame.image) : undefined;

  // The room the canvas has: the pane below the samples, less a buffer. Unmeasured (or not laid out): game size.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRoom(r.width > 0 && r.height > 0 ? { w: r.width - BUFFER * 2, h: r.height - BUFFER * 2 } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const size = room ? fitCanvas(room) : { w: SCENE_WIDTH, h: SCENE_HEIGHT };
  const gameSize = size.w === SCENE_WIDTH && size.h === SCENE_HEIGHT;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (sample === "iconBar") {
      drawIconBarPreview(ctx, { look: bar, style, family, image: (id) => images.lookup(id)?.el, selected, hover: over });
      return;
    }
    const t = textStyle(style, family, 100);
    const layout = layoutSample(sample, frame, resolved.narration, t, canvasMeasure(ctx, family), style?.dialogueChoices !== undefined);
    // The store only holds an image once it has decoded; an unattached <img> reports its natural size.
    const ready = loaded && loaded.size.w > 0 ? (loaded.el as HTMLImageElement) : undefined;
    shown.current = layout;
    // While the pointer is on the canvas it alone decides; the picked row shows once it leaves.
    const hover = over ? over : picked === null ? null : rowPoint(layout, picked);
    drawPreview(ctx, { layout, frame, image: ready, style, family, hover });
  });

  /** A pointer event as a point in game pixels. */
  const scenePoint = (e: MouseEvent<HTMLCanvasElement>): Vec => {
    const box = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - box.left) / box.width) * SCENE_WIDTH, ((e.clientY - box.top) / box.height) * SCENE_HEIGHT];
  };
  const rows = shown.current ? choiceRows(shown.current).length : 0;
  const onKey = (e: KeyboardEvent) => {
    if (sample === "iconBar") {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      setSelected((s) => BAR_BUTTONS[(BAR_BUTTONS.indexOf(s as (typeof BAR_BUTTONS)[number]) + step + BAR_BUTTONS.length) % BAR_BUTTONS.length]!);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    setPicked((i) => Math.max(0, Math.min(rows - 1, (i ?? -1) + (e.key === "ArrowDown" ? 1 : -1))));
  };
  const label =
    sample === "iconBar"
      ? `Preview of the icon bar. The ${selected} button is selected. Point at a button, click it, or use the left and right arrow keys.`
      : sample === "choices"
        ? "Preview of the frame on a sample panel. Point at a choice, click it, or use the up and down arrow keys to see its highlight."
        : "Preview of the frame on a sample panel";

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="Style preview">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <span className="text-muted-foreground text-[11px]">Sample</span>
        <ToggleBar<SampleId> label="Sample" value={sample} options={SAMPLES} onChange={props.onSample} />
        {!gameSize && (
          <Button type="button" size="xs" variant="ghost" className="ml-auto gap-1 text-[12px]" onClick={() => props.onResizePane(SCENE_HEIGHT - size.h)}>
            <Scaling />
            Actual game size
          </Button>
        )}
      </div>
      <div ref={area} className="flex min-h-0 flex-1 items-center justify-center" style={{ padding: BUFFER }}>
        <canvas
          ref={canvas}
          width={SCENE_WIDTH}
          height={SCENE_HEIGHT}
          aria-label={label}
          role="img"
          tabIndex={sample === "choices" || sample === "iconBar" ? 0 : undefined}
          onMouseMove={(e) => setOver(scenePoint(e))}
          onMouseLeave={() => setOver(null)}
          onClick={(e) => {
            const at = scenePoint(e);
            if (sample === "iconBar") {
              const hit = hitButton(BAR_LAYOUT.barButtons, at);
              if (hit) setSelected(hit);
            } else setPicked(shown.current ? rowAt(shown.current, at) : null);
          }}
          onKeyDown={onKey}
          className="block shrink-0 rounded-md border"
          // A hand over a choice, as in the game.
          style={{ width: size.w, height: size.h, imageRendering: "pixelated", cursor: sample === "choices" && over && shown.current && rowAt(shown.current, over) !== null ? "pointer" : undefined }}
        />
      </div>
    </div>
  );
}
