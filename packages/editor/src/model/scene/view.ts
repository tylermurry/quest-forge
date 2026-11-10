// The scene canvas's zoom and pan (spec 09): fit or 1×–8×, pan, screen ↔ scene,
// pixel snapping, grid visibility. DOM-free. Screen coordinates are CSS pixels
// inside the canvas element; the canvas multiplies by devicePixelRatio itself.
import { SCENE_HEIGHT, SCENE_WIDTH, type Point } from "@questforge/schema";
import type { Vec } from "@questforge/engine";

/** Fixed zoom steps (spec 09: 1×–8×). */
const ZOOM_STEPS = [1, 2, 3, 4, 6, 8] as const;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** The pixel grid shows at this zoom and above (spec 09). */
const GRID_ZOOM = 4;
/** Space kept around the scene when fitting, in CSS px. */
const FIT_MARGIN = 16;

/** Zoom state saved per scene (D101): fitted to the canvas, or a fixed scale with a pan. */
export type Zoom = { fit: true } | { fit: false; scale: number; pan: Vec };

/** Where the scene sits on screen: CSS px per scene px, and the scene's top-left in CSS px. */
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** The scene fitted and centred in a canvas (may be below 1× in a small window). */
export function fitTransform(canvas: Size): Transform {
  const scale = Math.max(0.1, Math.min((canvas.w - 2 * FIT_MARGIN) / SCENE_WIDTH, (canvas.h - 2 * FIT_MARGIN) / SCENE_HEIGHT));
  return { scale, x: Math.round((canvas.w - SCENE_WIDTH * scale) / 2), y: Math.round((canvas.h - SCENE_HEIGHT * scale) / 2) };
}

/** The transform for a zoom state. A fixed zoom's pan is the scene's top-left. */
export function transformFor(zoom: Zoom, canvas: Size): Transform {
  if (zoom.fit) return fitTransform(canvas);
  return { scale: zoom.scale, x: zoom.pan[0], y: zoom.pan[1] };
}

const clampZoom = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));

/** Zoom to `scale` keeping the scene point under `anchor` (screen px) where it is. */
export function zoomAround(t: Transform, scale: number, anchor: Vec): Zoom {
  const s = clampZoom(scale);
  const sx = (anchor[0] - t.x) / t.scale;
  const sy = (anchor[1] - t.y) / t.scale;
  return { fit: false, scale: s, pan: [Math.round(anchor[0] - sx * s), Math.round(anchor[1] - sy * s)] };
}

/** The next zoom step in or out from the current scale. */
export function stepZoom(scale: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > scale + 1e-6) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < scale - 1e-6) ?? MIN_ZOOM;
}

/** Zoom by a step around the canvas centre (menu / toolbar), or around `anchor`. */
export function zoomStep(t: Transform, canvas: Size, dir: 1 | -1, anchor: Vec = [canvas.w / 2, canvas.h / 2]): Zoom {
  return zoomAround(t, stepZoom(t.scale, dir), anchor);
}

/** Smooth zoom for a pinch / ctrl-wheel: `delta` is wheel deltaY (negative zooms in). */
export function zoomByWheel(t: Transform, delta: number, anchor: Vec): Zoom {
  return zoomAround(t, t.scale * Math.exp(-delta * 0.01), anchor);
}

/** Exactly 1× (or another scale), centred. */
export function zoomTo(canvas: Size, scale: number): Zoom {
  const s = clampZoom(scale);
  return { fit: false, scale: s, pan: [Math.round((canvas.w - SCENE_WIDTH * s) / 2), Math.round((canvas.h - SCENE_HEIGHT * s) / 2)] };
}

/** Pan by a screen delta (space-drag, two-finger scroll). Leaves fit mode at the current scale. */
export function panBy(t: Transform, dx: number, dy: number): Zoom {
  return { fit: false, scale: t.scale, pan: [Math.round(t.x + dx), Math.round(t.y + dy)] };
}

/** Screen px → scene point (fractional, not clamped). */
export const toScene = (t: Transform, p: Vec): Vec => [(p[0] - t.x) / t.scale, (p[1] - t.y) / t.scale];

/** Scene point → screen px. */
export const toScreen = (t: Transform, p: Vec): Vec => [t.x + p[0] * t.scale, t.y + p[1] * t.scale];

/** Snapping to whole pixels, always (spec 09, spec 01: on-disk geometry is integer), clamped to the scene. */
export function snapPixel(p: Vec): Point {
  const x = Math.min(SCENE_WIDTH, Math.max(0, Math.round(p[0])));
  const y = Math.min(SCENE_HEIGHT, Math.max(0, Math.round(p[1])));
  return [x, y];
}

export const gridVisible = (t: Transform) => t.scale >= GRID_ZOOM - 1e-6;

/** The zoom shown in the toolbar, e.g. "Fit (1.4×)" or "4×". */
export function zoomLabel(zoom: Zoom, t: Transform): string {
  const s = Number.isInteger(t.scale) ? `${t.scale}` : t.scale.toFixed(1);
  return zoom.fit ? `Fit (${s}×)` : `${s}×`;
}
