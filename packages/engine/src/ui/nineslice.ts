import type { FrameInsets } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// Nine-slice geometry, DOM-free so it is tested in Node and shared by the game and the editor preview.
//
// The source image is cut by `insets` into four corners, four edges and a centre. Every piece is drawn at
// native scale: corners once, edges tiled along their length, the centre tiled both ways. A partial last
// tile is clipped, shrinking source and destination together, so nothing is ever stretched.
//
// Rules for awkward input (all deterministic, never a throw, never a negative size):
// - A non-finite or non-positive source or destination size draws nothing. Non-finite insets count as 0.
// - The destination is snapped to whole pixels by rounding its edges (x and x+w), so tiles share edges
//   exactly: no gaps, no overlaps.
// - Insets are floored to whole non-negative numbers. If an opposite pair is larger than the source side,
//   both are scaled down together (left and right share the side in proportion) so the centre is empty.
// - If the destination is smaller than a pair of opposite corners, the two corners share the destination
//   side in proportion to their insets (left gets round(size * left / (left + right)), right gets the rest).
//   Each corner then draws only that many pixels of itself, taken from its outer side (the left corner
//   keeps its left columns, the right corner its right columns): clipped, not stretched. The edges and
//   centre have no room and produce no draws.
// - A region whose source or destination size is zero (an inset of 0, or no room) produces no draws.

export interface NineSliceTile {
  /** Source rectangle in the image. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rectangle, whole pixels. Always `dw === sw` and `dh === sh`. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** One axis: source and destination segment lengths for [start corner, middle, end corner]. */
function axis(srcLen: number, startInset: number, endInset: number, destLen: number) {
  let a = whole(startInset);
  let b = whole(endInset);
  if (a + b > srcLen) {
    a = Math.floor((srcLen * a) / (a + b));
    b = srcLen - a;
  }
  const srcMid = srcLen - a - b;
  // Destination corners: native size, or a proportional share when there is no room for both.
  let da = a;
  let db = b;
  if (destLen < a + b) {
    da = Math.round((destLen * a) / (a + b));
    db = destLen - da;
  }
  const destMid = destLen - da - db;
  return {
    srcLen: [da, srcMid, db] as const,
    srcStart: [0, a, srcLen - db] as const,
    dest: [0, da, da + destMid] as const,
    destLen: [da, destMid, db] as const,
  };
}

/** The tiles that draw a nine-slice frame of an image of size `src` into `dest`. */
export function nineSliceTiles(src: { width: number; height: number }, insets: FrameInsets, dest: Rect): NineSliceTile[] {
  const sw = whole(src.width);
  const sh = whole(src.height);
  const x0 = Math.round(dest.x);
  const y0 = Math.round(dest.y);
  const dw = Math.round(dest.x + dest.w) - x0;
  const dh = Math.round(dest.y + dest.h) - y0;
  if (![dest.x, dest.y, dest.w, dest.h].every(Number.isFinite) || sw === 0 || sh === 0 || dw <= 0 || dh <= 0) return [];

  const ax = axis(sw, insets.left, insets.right, dw);
  const ay = axis(sh, insets.top, insets.bottom, dh);
  const tiles: NineSliceTile[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const srcW = ax.srcLen[col]!;
      const srcH = ay.srcLen[row]!;
      const regW = ax.destLen[col]!;
      const regH = ay.destLen[row]!;
      if (srcW <= 0 || srcH <= 0 || regW <= 0 || regH <= 0) continue;
      // Corners (and clipped corners) have regW === srcW; tiling only matters for the middle segments.
      const stepW = Math.min(srcW, regW);
      const stepH = Math.min(srcH, regH);
      for (let oy = 0; oy < regH; oy += stepH) {
        const th = Math.min(stepH, regH - oy);
        for (let ox = 0; ox < regW; ox += stepW) {
          const tw = Math.min(stepW, regW - ox);
          tiles.push({
            sx: ax.srcStart[col]!,
            sy: ay.srcStart[row]!,
            sw: tw,
            sh: th,
            dx: x0 + ax.dest[col]! + ox,
            dy: y0 + ay.dest[row]! + oy,
            dw: tw,
            dh: th,
          });
        }
      }
    }
  }
  return tiles;
}
