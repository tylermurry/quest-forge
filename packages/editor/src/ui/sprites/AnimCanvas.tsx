import { frameAt, type ResolvedAnim } from "@questforge/engine";
import { useEffect, useRef } from "react";
import { effectiveOrigin, fitZoom, frameSizeOf } from "../../model/sprites.ts";
import type { CanvasImages } from "../scene/images.ts";
import { drawSpriteFrame, prepare } from "./draw.ts";

/** What to play: an animation, mirrored or not, or only its first frame. */
export type Shown = Pick<ResolvedAnim, "anim" | "mirror" | "still">;

/**
 * A slot playing as the engine plays it (frameAt, mirrored around the origin),
 * with its feet on a fixed point and the origin marked. Redraws every frame while shown.
 */
export function AnimCanvas({ images, shown, box }: { images: CanvasImages; shown: Shown | null; box: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const anim = shown?.anim;
  const mirror = shown?.mirror;
  const still = shown?.still;
  const image = shown ? images.lookup(shown.anim.image) : undefined;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!anim || !image) {
      prepare(canvas, box, box);
      return;
    }
    const f = frameSizeOf(image.asset, image.size);
    const pad = box >= 100 ? 12 : 3;
    const zoom = fitZoom(f, { w: box - 2 * pad, h: box - 2 * pad }, 12);
    const origin = effectiveOrigin(image.asset, image.size);
    // Feet where an unmirrored frame would sit centred, so mirroring visibly keeps them put.
    const feet: [number, number] = [(box - f.w * zoom) / 2 + origin[0] * zoom, (box - f.h * zoom) / 2 + origin[1] * zoom];
    const start = performance.now();
    let raf = 0;
    const draw = () => {
      const ctx = prepare(canvas, box, box);
      if (!ctx) return; // no 2D canvas (tests)
      const frame = still ? anim.frames[0]! : frameAt(anim, (performance.now() - start) / 1000);
      drawSpriteFrame(ctx, image, frame, zoom, feet, mirror);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [anim, mirror, still, image, box]);
  return <canvas ref={ref} aria-hidden className="shrink-0 rounded-sm" />;
}
