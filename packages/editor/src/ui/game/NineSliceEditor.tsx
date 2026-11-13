import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { FrameInsets } from "@questforge/schema";
import { GUIDE_SIDES, borderOf, dragGuide, insetWarnings, maxBorder, nudgeGuide, toImagePixels, uniformInsets, type GuideSide } from "../../model/style.ts";
import { cn } from "../lib/utils.ts";
import { SliderField } from "./SliderField.tsx";

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
 * Edits the borders of a nine-slice frame, which move in lock step so all four corners are the same square: a
 * Border size slider for the rough size, and the source picture with a draggable guide on each side for fine
 * tuning (arrow keys move a focused guide; Shift moves ten pixels), the nine pieces tinted. The caller keeps the
 * borders. Gestures: a guide drag calls `onPreview` while moving and `onCommit` on release, so it is one undo
 * step; the slider and a key press call `onChange` (the caller merges a burst into one step). Reused by the Icon Bar.
 */
export function NineSliceEditor(props: {
  image: FrameImage | null;
  insets: FrameInsets;
  onChange(insets: FrameInsets): void;
  /** The borders while a drag is in progress; null drops the drag. */
  onPreview(insets: FrameInsets | null): void;
  onCommit(): void;
  /** A guide or the slider lost focus. */
  onBlurField(): void;
  /** Shown right under the Border size slider (the Frames section's Scale). */
  belowBorder?: ReactNode;
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
    props.onPreview(dragGuide(side, at, size));
  };
  const key = (side: GuideSide, e: KeyboardEvent) => {
    if (!size) return;
    const forward = VERTICAL[side] ? "ArrowRight" : "ArrowDown";
    const back = VERTICAL[side] ? "ArrowLeft" : "ArrowUp";
    if (e.key !== forward && e.key !== back) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    props.onChange(nudgeGuide(insets, side, e.key === forward ? step : -step, size));
  };

  const border = borderOf(insets);
  return (
    <div className="grid gap-3" aria-label="Nine-slice editor">
      {size && (
        <SliderField label="Border size" min={0} max={maxBorder(size)} value={border} unit="px" unitName="pixels" onChange={(n) => props.onChange(uniformInsets(n, size))} onBlur={props.onBlurField} />
      )}
      {props.belowBorder}
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
                  aria-valuemax={maxBorder(size)}
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
      ) : null}
      {warnings.length > 0 && (
        <div role="alert" className="text-warn grid gap-0.5 text-[12px]">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </div>
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
