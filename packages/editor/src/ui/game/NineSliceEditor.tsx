import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { FrameInsets } from "@questforge/schema";
import { GUIDE_SIDES, dragGuide, insetWarnings, maxInset, nudgeGuide, toImagePixels, type GuideSide } from "../../model/style.ts";
import { NumberField } from "../NumberField.tsx";
import { cn } from "../lib/utils.ts";

/** The source picture, with the dimensions the guides are measured in. */
export interface FrameImage {
  id: string;
  /** Where the browser loads it from. */
  src: string;
  width: number;
  height: number;
}

const SIDE_LABEL: Record<GuideSide, string> = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" };
const VERTICAL: Record<GuideSide, boolean> = { left: true, right: true, top: false, bottom: false };
/** The shown picture fits this box; small pictures are enlarged in whole steps so pixels stay sharp. */
const BOX = { w: 340, h: 300 };
const REGION = { corner: "bg-amber-400/35", edge: "bg-sky-400/30", centre: "bg-emerald-400/30" } as const;
const CHECKER = "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 50% / 12px 12px";

/**
 * Edits the four borders of a nine-slice frame: the source picture with a draggable guide on each side (arrow
 * keys move a focused guide; Shift moves ten pixels) and four number boxes that stay in step with them. The
 * caller keeps the borders. Gestures: a drag calls `onPreview` while moving and `onCommit` on release, so it
 * is one undo step; a key press or number calls `onChange` with the side it changed (the caller merges typing).
 * Reused by the Icon Bar.
 */
export function NineSliceEditor(props: {
  image: FrameImage | null;
  insets: FrameInsets;
  onChange(insets: FrameInsets, side: GuideSide): void;
  /** The borders while a drag is in progress; null drops the drag. */
  onPreview(insets: FrameInsets | null): void;
  onCommit(): void;
  /** A number box lost focus. */
  onBlurField(): void;
}) {
  const { image, insets } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<GuideSide | null>(null);
  const size = image ? { width: image.width, height: image.height } : null;
  const fit = image ? Math.min(BOX.w / image.width, BOX.h / image.height) : 1;
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const warnings = size ? insetWarnings(insets, size) : [];

  const move = (side: GuideSide, e: PointerEvent) => {
    if (dragging.current !== side || !size || !box.current) return;
    const at = toImagePixels({ x: e.clientX, y: e.clientY }, box.current.getBoundingClientRect(), size);
    props.onPreview(dragGuide(insets, side, at, size));
  };
  const key = (side: GuideSide, e: KeyboardEvent) => {
    if (!size) return;
    const forward = VERTICAL[side] ? "ArrowRight" : "ArrowDown";
    const back = VERTICAL[side] ? "ArrowLeft" : "ArrowUp";
    if (e.key !== forward && e.key !== back) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    props.onChange(nudgeGuide(insets, side, e.key === forward ? step : -step, size), side);
  };

  return (
    <div className="grid gap-3" aria-label="Nine-slice editor">
      {image && size ? (
        <div className="overflow-auto">
          <div
            ref={box}
            data-testid="nine-slice-image"
            className="relative"
            style={{ width: image.width * scale, height: image.height * scale, background: CHECKER, margin: 8 }}
          >
            <img src={image.src} alt={`Source image ${image.id}`} draggable={false} className="absolute inset-0 size-full select-none" style={{ imageRendering: "pixelated" }} />
            <Regions insets={insets} size={size} scale={scale} />
            {GUIDE_SIDES.map((side) => {
              const along = VERTICAL[side] ? image.width : image.height;
              const pos = (side === "left" || side === "top" ? insets[side] : along - insets[side]) * scale;
              return (
                <div
                  key={side}
                  role="slider"
                  tabIndex={0}
                  aria-label={`${SIDE_LABEL[side]} guide`}
                  aria-orientation={VERTICAL[side] ? "horizontal" : "vertical"}
                  aria-valuemin={0}
                  aria-valuemax={maxInset(side, insets, size)}
                  aria-valuenow={insets[side]}
                  aria-valuetext={`${insets[side]} pixels`}
                  className={cn("group absolute flex items-center justify-center outline-none touch-none", VERTICAL[side] ? "top-0 bottom-0 w-3 cursor-ew-resize" : "left-0 right-0 h-3 cursor-ns-resize")}
                  style={VERTICAL[side] ? { left: pos - 6 } : { top: pos - 6 }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragging.current = side;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    e.currentTarget.focus();
                  }}
                  onPointerMove={(e) => move(side, e)}
                  onPointerUp={() => {
                    if (dragging.current !== side) return;
                    dragging.current = null;
                    props.onCommit();
                  }}
                  onPointerCancel={() => {
                    if (dragging.current !== side) return;
                    dragging.current = null;
                    props.onPreview(null);
                  }}
                  onKeyDown={(e) => key(side, e)}
                  onBlur={props.onBlurField}
                >
                  <div className={cn("bg-primary group-focus-visible:bg-foreground", VERTICAL[side] ? "h-full w-0.5" : "h-0.5 w-full")} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-[13px]">{image === null ? "Choose an image to set its borders." : ""}</p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {GUIDE_SIDES.map((side) => (
          <NumberField
            key={side}
            label={`${SIDE_LABEL[side]} border (px)`}
            integer
            min={0}
            max={size ? maxInset(side, insets, size) : undefined}
            value={insets[side]}
            onChange={(n) => props.onChange({ ...insets, [side]: n }, side)}
            onBlur={props.onBlurField}
          />
        ))}
      </div>
      {warnings.length > 0 && (
        <div role="alert" className="text-warn grid gap-0.5 text-[12px]">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <ul aria-label="Legend" className="text-muted-foreground grid gap-1 text-[12px]">
        <Legend swatch={REGION.corner} name="Corners" text="stay exactly as drawn." />
        <Legend swatch={REGION.edge} name="Edges" text="repeat along each side to fit the panel." />
        <Legend swatch={REGION.centre} name="Centre" text="repeats to fill the middle." />
      </ul>
    </div>
  );
}

function Legend(props: { swatch: string; name: string; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-3 shrink-0 rounded-sm border border-white/30", props.swatch)} />
      <span>
        <strong className="text-foreground font-medium">{props.name}</strong> {props.text}
      </span>
    </li>
  );
}

/** Tints the nine pieces over the picture: corners, edges and the centre. */
function Regions(props: { insets: FrameInsets; size: { width: number; height: number }; scale: number }) {
  const { insets: i, size, scale: k } = props;
  const l = Math.min(i.left, size.width) * k;
  const r = Math.min(i.right, size.width) * k;
  const t = Math.min(i.top, size.height) * k;
  const b = Math.min(i.bottom, size.height) * k;
  const w = size.width * k;
  const h = size.height * k;
  const cell = (cls: string, x: number, y: number, cw: number, ch: number, id: string) =>
    cw > 0 && ch > 0 ? <div key={id} className={cn("pointer-events-none absolute", cls)} style={{ left: x, top: y, width: cw, height: ch }} /> : null;
  const mw = Math.max(0, w - l - r);
  const mh = Math.max(0, h - t - b);
  return (
    <>
      {cell(REGION.corner, 0, 0, l, t, "tl")}
      {cell(REGION.corner, w - r, 0, r, t, "tr")}
      {cell(REGION.corner, 0, h - b, l, b, "bl")}
      {cell(REGION.corner, w - r, h - b, r, b, "br")}
      {cell(REGION.edge, l, 0, mw, t, "t")}
      {cell(REGION.edge, l, h - b, mw, b, "b")}
      {cell(REGION.edge, 0, t, l, mh, "l")}
      {cell(REGION.edge, w - r, t, r, mh, "r")}
      {cell(REGION.centre, l, t, mw, mh, "c")}
    </>
  );
}
