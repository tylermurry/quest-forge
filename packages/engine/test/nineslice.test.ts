import { describe, expect, it } from "vitest";
import { drawNineSlice, nineSliceTiles, type NineSliceTile } from "../src/index.ts";

const ins = (left: number, right: number, top: number, bottom: number) => ({ left, right, top, bottom });
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** How many tiles cover each destination pixel in the box, as a w*h grid. */
function coverage(tiles: NineSliceTile[], w: number, h: number) {
  const grid = Array.from({ length: h }, () => Array<number>(w).fill(0));
  for (const t of tiles) for (let y = t.dy; y < t.dy + t.dh; y++) for (let x = t.dx; x < t.dx + t.dw; x++) grid[y]![x]!++;
  return grid;
}
const expectExactCover = (tiles: NineSliceTile[], w: number, h: number) => {
  for (const row of coverage(tiles, w, h)) for (const n of row) expect(n).toBe(1);
  for (const t of tiles) {
    expect(t.dw).toBe(t.sw);
    expect(t.dh).toBe(t.sh);
    expect(t.sw).toBeGreaterThan(0);
    expect(t.sh).toBeGreaterThan(0);
    expect(t.dx).toBeGreaterThanOrEqual(0);
    expect(t.dx + t.dw).toBeLessThanOrEqual(w);
    expect(t.dy + t.dh).toBeLessThanOrEqual(h);
  }
};

describe("nineSliceTiles", () => {
  it("returns the exact tiles for a small known case", () => {
    // 6x6 image with 2px insets: a 2x2 middle. Dest 8x8 at (10,20): middle region 4x4 is 2x2 tiles.
    const tiles = nineSliceTiles({ width: 6, height: 6 }, ins(2, 2, 2, 2), rect(10, 20, 8, 8));
    const t = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => ({ sx, sy, sw, sh, dx, dy, dw: sw, dh: sh });
    // Draw order is region by region; compare by position.
    const byPos = [...tiles].sort((a, b) => a.dy - b.dy || a.dx - b.dx);
    expect(byPos).toEqual([
      t(0, 0, 2, 2, 10, 20),
      t(2, 0, 2, 2, 12, 20),
      t(2, 0, 2, 2, 14, 20),
      t(4, 0, 2, 2, 16, 20),
      t(0, 2, 2, 2, 10, 22),
      t(2, 2, 2, 2, 12, 22),
      t(2, 2, 2, 2, 14, 22),
      t(4, 2, 2, 2, 16, 22),
      t(0, 2, 2, 2, 10, 24),
      t(2, 2, 2, 2, 12, 24),
      t(2, 2, 2, 2, 14, 24),
      t(4, 2, 2, 2, 16, 24),
      t(0, 4, 2, 2, 10, 26),
      t(2, 4, 2, 2, 12, 26),
      t(2, 4, 2, 2, 14, 26),
      t(4, 4, 2, 2, 16, 26),
    ]);
  });

  it("draws the source at native scale at its own size", () => {
    const tiles = nineSliceTiles({ width: 6, height: 6 }, ins(2, 2, 2, 2), rect(0, 0, 6, 6));
    expect(tiles).toHaveLength(9);
    expect(tiles.every((x) => x.sx === x.dx && x.sy === x.dy)).toBe(true);
  });

  it.each([
    ["wide", 40, 8],
    ["tall", 8, 40],
    ["compact", 9, 9],
  ])("covers a %s destination with no gaps or overlaps", (_n, w, h) => {
    expectExactCover(nineSliceTiles({ width: 8, height: 8 }, ins(3, 3, 3, 3), rect(0, 0, w, h)), w, h);
  });

  it("clips the last partial tile on both source and destination", () => {
    // Middle source is 2 wide; the middle region of a 2+5+2 destination needs 2, 2 and a 1px clip.
    const tiles = nineSliceTiles({ width: 6, height: 2 }, ins(2, 2, 0, 0), rect(0, 0, 9, 2));
    expect(tiles.map((t) => [t.sx, t.sw, t.dx, t.dw])).toEqual([
      [0, 2, 0, 2],
      [2, 2, 2, 2],
      [2, 2, 4, 2],
      [2, 1, 6, 1],
      [4, 2, 7, 2],
    ]);
    expectExactCover(tiles, 9, 2);
  });

  it("covers every size from 1 to 14 exactly", () => {
    for (let w = 1; w <= 14; w++) for (let h = 1; h <= 14; h++) expectExactCover(nineSliceTiles({ width: 7, height: 5 }, ins(2, 3, 1, 2), rect(0, 0, w, h)), w, h);
  });

  it("shrinks corners proportionally, clipped from their outer side, when the target is too small", () => {
    // Corners 3 and 1 share 2px: left gets round(2*3/4)=2, right gets 0.
    const tiles = nineSliceTiles({ width: 10, height: 2 }, ins(3, 1, 0, 0), rect(0, 0, 2, 2));
    expect(tiles).toEqual([{ sx: 0, sy: 0, sw: 2, sh: 2, dx: 0, dy: 0, dw: 2, dh: 2 }]);
    const even = nineSliceTiles({ width: 10, height: 2 }, ins(4, 4, 0, 0), rect(0, 0, 6, 2));
    expect(even.map((t) => [t.sx, t.sw, t.dx])).toEqual([
      [0, 3, 0],
      [7, 3, 3],
    ]);
    expectExactCover(even, 6, 2);
    expectExactCover(nineSliceTiles({ width: 10, height: 10 }, ins(4, 4, 4, 4), rect(0, 0, 3, 5)), 3, 5);
  });

  it("draws nothing for a zero-size middle", () => {
    expect(nineSliceTiles({ width: 4, height: 4 }, ins(2, 2, 2, 2), rect(0, 0, 4, 4))).toHaveLength(4);
    const tiles = nineSliceTiles({ width: 4, height: 4 }, ins(2, 2, 2, 2), rect(0, 0, 20, 20));
    // Edges have a 0-size source too (the centre of the image is empty), so only the four corners draw.
    expect(tiles).toHaveLength(4);
  });

  it("clamps insets larger than the source", () => {
    const tiles = nineSliceTiles({ width: 4, height: 4 }, ins(9, 9, 9, 9), rect(0, 0, 10, 10));
    for (const t of tiles) {
      expect(t.sx + t.sw).toBeLessThanOrEqual(4);
      expect(t.sy + t.sh).toBeLessThanOrEqual(4);
    }
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("supports a non-square source", () => {
    const tiles = nineSliceTiles({ width: 12, height: 4 }, ins(2, 2, 1, 1), rect(0, 0, 30, 9));
    expectExactCover(tiles, 30, 9);
    expect(tiles.every((t) => t.sx + t.sw <= 12 && t.sy + t.sh <= 4)).toBe(true);
  });

  it("snaps a fractional destination to whole pixels without seams", () => {
    const tiles = nineSliceTiles({ width: 6, height: 6 }, ins(2, 2, 2, 2), rect(0.4, 0.6, 9.3, 9.2));
    expect(tiles.every((t) => Number.isInteger(t.dx) && Number.isInteger(t.dy) && Number.isInteger(t.dw) && Number.isInteger(t.dh))).toBe(true);
    const minX = Math.min(...tiles.map((t) => t.dx));
    expect(minX).toBe(0);
    expectExactCover(
      tiles.map((t) => ({ ...t, dy: t.dy - 1 })),
      10,
      9,
    );
  });

  it.each([
    ["NaN dest", { w: NaN }],
    ["Infinity dest", { w: Infinity }],
    ["negative dest", { w: -5 }],
    ["zero dest", { h: 0 }],
    ["NaN position", { x: NaN }],
  ])("draws nothing for %s", (_n, patch) => {
    expect(nineSliceTiles({ width: 6, height: 6 }, ins(2, 2, 2, 2), { ...rect(0, 0, 10, 10), ...patch })).toEqual([]);
  });

  it("copes with invalid sources and insets without throwing or negative sizes", () => {
    expect(nineSliceTiles({ width: 0, height: 6 }, ins(1, 1, 1, 1), rect(0, 0, 9, 9))).toEqual([]);
    expect(nineSliceTiles({ width: NaN, height: 6 }, ins(1, 1, 1, 1), rect(0, 0, 9, 9))).toEqual([]);
    expect(nineSliceTiles({ width: -3, height: Infinity }, ins(1, 1, 1, 1), rect(0, 0, 9, 9))).toEqual([]);
    const tiles = nineSliceTiles({ width: 6, height: 6 }, ins(NaN, -2, Infinity, 2), rect(0, 0, 9, 9));
    expect(tiles.every((t) => t.sw > 0 && t.sh > 0 && t.dw > 0 && t.dh > 0)).toBe(true);
    expect(nineSliceTiles({ width: 6, height: 6 }, ins(0, 0, 0, 0), rect(0, 0, 9, 9))).toHaveLength(4);
  });
});

describe("drawNineSlice", () => {
  it("draws each tile with drawImage, smoothing off and nothing filled", () => {
    const calls: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...a: unknown[]) => calls.push(a),
      fillRect: () => {
        throw new Error("no fill behind the frame");
      },
    };
    const image = { width: 6, height: 6 };
    drawNineSlice(ctx as unknown as CanvasRenderingContext2D, image as unknown as CanvasImageSource & { width: number; height: number }, ins(2, 2, 2, 2), rect(10, 20, 8, 8));
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(calls).toHaveLength(16);
    expect(calls[0]).toEqual([image, 0, 0, 2, 2, 10, 20, 2, 2]);
    expect(calls[15]).toEqual([image, 4, 4, 2, 2, 16, 26, 2, 2]);
  });
});
