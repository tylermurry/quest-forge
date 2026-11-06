import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Vec } from "./vec.ts";

// Back buffer → window (spec 03, D31): largest integer multiple that fits, fractional
// fit below 1×, always letterboxed, never cropped.

export interface Viewport {
  /** Device pixels per scene pixel. */
  scale: number;
  /** Top-left of the scene in device pixels. */
  offsetX: number;
  offsetY: number;
  /** Size of the whole drawing surface in device pixels. */
  width: number;
  height: number;
}

/** Fit 640×400 into a surface of `width`×`height` device pixels. */
export function fitViewport(width: number, height: number): Viewport {
  const fit = Math.min(width / SCENE_WIDTH, height / SCENE_HEIGHT);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  return {
    scale,
    offsetX: Math.floor((width - SCENE_WIDTH * scale) / 2),
    offsetY: Math.floor((height - SCENE_HEIGHT * scale) / 2),
    width,
    height,
  };
}

/** Device-pixel point → scene point. Null in the letterbox bars. */
export function toScene(v: Viewport, deviceX: number, deviceY: number): Vec | null {
  const x = (deviceX - v.offsetX) / v.scale;
  const y = (deviceY - v.offsetY) / v.scale;
  if (x < 0 || y < 0 || x >= SCENE_WIDTH || y >= SCENE_HEIGHT) return null;
  return [x, y];
}

/** Scene point → device-pixel point (for tests and overlays). */
export const toDevice = (v: Viewport, p: Vec): Vec => [v.offsetX + p[0] * v.scale, v.offsetY + p[1] * v.scale];

/**
 * Fixed-timestep driver (spec 03): logic ticks at exactly `hz`, decoupled from how
 * often frames render. Long stalls (a backgrounded tab) are capped, not replayed.
 */
export class FixedStep {
  readonly dt: number;
  private acc = 0;
  private last: number | null = null;

  constructor(
    private readonly tick: (dt: number) => void,
    hz = 60,
    private readonly maxSteps = 5,
  ) {
    this.dt = 1 / hz;
  }

  /** Advance to time `now` (ms, e.g. a rAF timestamp). Returns the ticks run. */
  advance(now: number): number {
    if (this.last === null) {
      this.last = now;
      return 0;
    }
    this.acc += Math.max(0, now - this.last) / 1000;
    this.last = now;
    let steps = 0;
    while (this.acc >= this.dt - 1e-9 && steps < this.maxSteps) {
      this.tick(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = Math.min(this.acc, this.dt);
    return steps;
  }
}
