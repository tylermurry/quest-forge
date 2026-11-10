import { describe, expect, it } from "vitest";
import { objectBaseline, scaleAt, sortByBaseline, walkSpeedAt } from "../src/depth.ts";

const depth = { far: { y: 180, scale: 0.4 }, near: { y: 390, scale: 1 } };

describe("depth scaling", () => {
  it("lerps between the far and near lines by feet-y", () => {
    expect(scaleAt(depth, 180)).toBeCloseTo(0.4);
    expect(scaleAt(depth, 390)).toBeCloseTo(1);
    expect(scaleAt(depth, 285)).toBeCloseTo(0.7);
  });
  it("clamps beyond the lines", () => {
    expect(scaleAt(depth, 0)).toBeCloseTo(0.4);
    expect(scaleAt(depth, 400)).toBeCloseTo(1);
  });
  it("handles both lines at the same y", () => {
    expect(scaleAt({ far: { y: 200, scale: 0.5 }, near: { y: 200, scale: 1 } }, 100)).toBe(1);
  });
  it("slows walking in the distance", () => {
    expect(walkSpeedAt(depth, 180, 80)).toBeCloseTo(32);
    expect(walkSpeedAt(depth, 390, 80)).toBeCloseTo(80);
  });
});

describe("baseline occlusion", () => {
  it("defaults an object's baseline to its bottom edge", () => {
    expect(objectBaseline({ y: 100 }, 64)).toBe(164);
    expect(objectBaseline({ y: 100, baseline: 120 }, 64)).toBe(120);
  });
  it("draws higher baselines later, keeping layer order on ties", () => {
    const palm = { id: "palm", baseline: 330 };
    const rock = { id: "rock", baseline: 280 };
    const hero = { id: "hero", baseline: 300 };
    const shell = { id: "shell", baseline: 300 };
    expect(sortByBaseline([palm, rock, hero, shell]).map((x) => x.id)).toEqual(["rock", "hero", "shell", "palm"]);
    // Walking down past the palm's baseline brings the hero in front.
    expect(sortByBaseline([palm, rock, { id: "hero", baseline: 340 }]).map((x) => x.id)).toEqual(["rock", "palm", "hero"]);
  });
});
