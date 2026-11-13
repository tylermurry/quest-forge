import { SCENE_HEIGHT, SCENE_WIDTH, type EffectiveFrame, type FrameInsets } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// The shared frame as the game draws it: how much the picture is scaled, how thick its borders end up, and
// the pieces a panel needs to draw it. DOM-free (the image is only passed along), so it is tested in Node and
// shared by the game and the editor's Styling preview, which must size the borders the same way.

export type SizedImage = CanvasImageSource & { width: number; height: number };

/** A frame as drawn: its borders and how thick they are drawn (`EffectiveFrame.scale`). */
export interface FrameLook {
  insets: FrameInsets;
  scale: number;
}

/** The shared frame, ready to draw: configured and its picture has loaded. Without one a panel keeps its built-in look. */
export interface PanelSkin extends FrameLook {
  image: SizedImage;
}

/** How much the frame picture is scaled when drawn, so its thickest border is `scale` game pixels. 1 with no borders. */
export function frameScale(f: FrameLook): number {
  const thickest = Math.max(f.insets.left, f.insets.right, f.insets.top, f.insets.bottom);
  return thickest > 0 ? f.scale / thickest : 1;
}

/** How thick each border is drawn, in whole game pixels. Panels use this as the padding inside the frame. */
export function frameBorders(f: FrameLook): FrameInsets {
  const k = frameScale(f);
  return { left: Math.round(f.insets.left * k), right: Math.round(f.insets.right * k), top: Math.round(f.insets.top * k), bottom: Math.round(f.insets.bottom * k) };
}

/** The skin to draw panels with: undefined when no frame image is configured or it hasn't loaded (or failed to). */
export function panelSkin(frame: EffectiveFrame, image: (id: string) => CanvasImageSource | undefined): PanelSkin | undefined {
  const img = frame.image === undefined ? undefined : (image(frame.image) as SizedImage | undefined);
  return img ? { image: img, insets: frame.insets, scale: frame.scale } : undefined;
}

/**
 * Where to draw a fixed-size panel's frame so its borders sit outside the content: the panel grown on each side by
 * however much the border is thicker than the `pad` the layout leaves, then kept on the screen. The panel's own rect
 * (and so its content and hit areas) never moves. Where the screen edge cuts the growth, the border still overlaps
 * the content by the difference.
 */
export function outsetFrame(panel: Rect, borders: FrameInsets, pad: number): Rect {
  const grow = (border: number) => Math.max(0, border - pad);
  const x0 = Math.max(0, panel.x - grow(borders.left));
  const y0 = Math.max(0, panel.y - grow(borders.top));
  const x1 = Math.min(SCENE_WIDTH, panel.x + panel.w + grow(borders.right));
  const y1 = Math.min(SCENE_HEIGHT, panel.y + panel.h + grow(borders.bottom));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
