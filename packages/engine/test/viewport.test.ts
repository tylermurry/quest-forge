import { describe, expect, it } from "vitest";
import { FixedStep, fitViewport, toDevice, toScene } from "../src/viewport.ts";

describe("fitViewport", () => {
  it.each([
    [640, 400, 1, 0, 0],
    [1280, 800, 2, 0, 0],
    [1920, 1200, 3, 0, 0],
    [1919, 1199, 2, 319, 199], // just under 3× → 2×, letterboxed
    [2560, 1440, 3, 320, 120], // 16:9 landscape → bars on both axes
  ])("%i×%i → %i×, offset (%i, %i)", (w, h, scale, ox, oy) => {
    expect(fitViewport(w, h)).toEqual({ scale, offsetX: ox, offsetY: oy, width: w, height: h });
  });

  it("uses a fractional fit below 1× (phones)", () => {
    const v = fitViewport(320, 600); // portrait
    expect(v.scale).toBe(0.5);
    expect(v.offsetX).toBe(0);
    expect(v.offsetY).toBe(200); // letterboxed top and bottom
  });

  it("fill scales fractionally above 1× too, still letterboxed (playtest window)", () => {
    const v = fitViewport(1000, 560, 1, true);
    expect(v.scale).toBeCloseTo(1.4);
    expect(v.offsetX).toBe(52);
    expect(v.offsetY).toBe(0);
    expect(fitViewport(1000, 560).scale).toBe(1);
  });

  it("never crops: the scene always fits", () => {
    for (const [w, h] of [
      [375, 812],
      [812, 375],
      [1000, 1000],
      [641, 401],
      [3000, 500],
    ] as const) {
      const v = fitViewport(w, h);
      expect(v.offsetX).toBeGreaterThanOrEqual(0);
      expect(v.offsetY).toBeGreaterThanOrEqual(0);
      expect(v.offsetX + 640 * v.scale).toBeLessThanOrEqual(w);
      expect(v.offsetY + 400 * v.scale).toBeLessThanOrEqual(h);
    }
  });
});

describe("toScene: clicks map to the right scene pixel at all scales", () => {
  it.each([
    [640, 400],
    [1280, 800],
    [1920, 1200],
    [2560, 1440],
    [320, 600],
    [812, 375],
  ])("at %i×%i", (w, h) => {
    const v = fitViewport(w, h);
    for (const p of [
      [0, 0],
      [319, 199],
      [639, 399],
      [100.5, 250.25],
    ] as const) {
      const d = toDevice(v, p);
      const back = toScene(v, d[0], d[1])!;
      expect(back[0]).toBeCloseTo(p[0], 9);
      expect(back[1]).toBeCloseTo(p[1], 9);
    }
  });
  it("maps the middle of a 2× device pixel block to that scene pixel", () => {
    const v = fitViewport(1920, 1080); // 2×, offset (320, 140)
    expect(toScene(v, 320 + 2 * 10 + 1, 140 + 2 * 20 + 1)!.map(Math.floor)).toEqual([10, 20]);
  });
  it("returns null in the letterbox bars", () => {
    const v = fitViewport(1920, 1080);
    expect(toScene(v, 100, 500)).toBe(null);
    expect(toScene(v, 960, 10)).toBe(null);
    expect(toScene(v, 320 + 1280, 500)).toBe(null);
  });
});

describe("FixedStep (60 Hz logic)", () => {
  it("ticks at a fixed rate regardless of frame timing", () => {
    let ticks = 0;
    const loop = new FixedStep(() => ticks++);
    loop.advance(0);
    // 144 Hz display for one second.
    for (let i = 1; i <= 144; i++) loop.advance((i * 1000) / 144);
    expect(ticks).toBe(60);
    // 30 Hz display for one more second.
    for (let i = 1; i <= 30; i++) loop.advance(1000 + (i * 1000) / 30);
    expect(ticks).toBe(120);
  });
  it("passes a constant dt", () => {
    const dts: number[] = [];
    const loop = new FixedStep((dt) => dts.push(dt));
    loop.advance(0);
    loop.advance(50);
    expect(dts).toEqual([1 / 60, 1 / 60, 1 / 60]);
  });
  it("caps catch-up after a long stall", () => {
    let ticks = 0;
    const loop = new FixedStep(() => ticks++);
    loop.advance(0);
    loop.advance(10_000);
    expect(ticks).toBe(5);
    loop.advance(10_000 + 1000 / 60);
    expect(ticks).toBeLessThanOrEqual(7);
  });
});

describe("high-DPI screens", () => {
  it("chooses the integer multiple in CSS px", () => {
    // iPhone 14 landscape: 844×390 CSS at 2× → fractional fit, not 1 device px per scene px.
    const v = fitViewport(1688, 780, 2);
    expect(v.scale / 2).toBeCloseTo(0.975, 6);
    expect(v.offsetY).toBe(0);
    // Desktop 1440×900 CSS at 2×: 2× in CSS, 4 device px per scene px.
    expect(fitViewport(2880, 1800, 2).scale).toBe(4);
    // dpr 1 behaves as before.
    expect(fitViewport(1280, 800).scale).toBe(2);
  });
});
