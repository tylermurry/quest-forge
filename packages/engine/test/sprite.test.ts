import { describe, expect, it } from "vitest";
import type { Animation, CharacterFile, ImageAsset } from "@questforge/schema";
import { facingFor, frameAt, frameRect, frameSize, originOf, resolveAnim, sheetFits, sheetProblem, spriteRect } from "../src/sprite.ts";

const sheet: ImageAsset = { id: "hero_sheet", path: "assets/images/hero.png", sheet: { columns: 8, rows: 4, cellWidth: 32, cellHeight: 48 } };
const size = { w: 256, h: 192 };

describe("spritesheet slicing", () => {
  it("cuts an 8×4 sheet into cells counted row by row", () => {
    expect(frameRect(sheet, size, 0)).toEqual({ x: 0, y: 0, w: 32, h: 48 });
    expect(frameRect(sheet, size, 7)).toEqual({ x: 224, y: 0, w: 32, h: 48 });
    expect(frameRect(sheet, size, 9)).toEqual({ x: 32, y: 48, w: 32, h: 48 });
    expect(frameRect(sheet, size, 31)).toEqual({ x: 224, y: 144, w: 32, h: 48 });
  });
  it("treats an unsliced image as one frame", () => {
    const img = { id: "palm", path: "assets/images/palm.png" };
    expect(frameRect(img, { w: 60, h: 200 }, 0)).toEqual({ x: 0, y: 0, w: 60, h: 200 });
    expect(frameSize(img, { w: 60, h: 200 })).toEqual({ w: 60, h: 200 });
  });
  it("checks the sheet fits the decoded image", () => {
    expect(sheetFits(sheet, size)).toBe(true);
    expect(sheetFits(sheet, { w: 255, h: 192 })).toBe(false);
  });
  it("words the problem for a sheet that doesn't fit, for the playtest log", () => {
    expect(sheetProblem(sheet, size)).toBeNull();
    expect(sheetProblem({ id: "palm", path: "assets/images/palm.png" }, { w: 1, h: 1 })).toBeNull();
    expect(sheetProblem(sheet, { w: 255, h: 192 })).toBe("Image hero_sheet: its sheet is larger than the 255×192 image.");
  });
  it("defaults the origin to bottom-center", () => {
    expect(originOf(sheet, { w: 32, h: 48 })).toEqual([16, 48]);
    expect(originOf({ ...sheet, origin: [10, 44] }, { w: 32, h: 48 })).toEqual([10, 44]);
  });
});

describe("placing a sprite on its feet", () => {
  it("puts the origin on the feet point, scaled", () => {
    expect(spriteRect([100, 300], [16, 48], { w: 32, h: 48 }, 0.5, false)).toEqual({ x: 92, y: 276, w: 16, h: 24 });
  });
  it("keeps an off-center origin on the feet when mirrored", () => {
    const origin = [10, 48] as const;
    const normal = spriteRect([100, 300], origin, { w: 32, h: 48 }, 2, false);
    const mirrored = spriteRect([100, 300], origin, { w: 32, h: 48 }, 2, true);
    expect(normal.x).toBe(80); // origin 10px from the left edge
    expect(mirrored.x).toBe(56); // after the flip it's 10px from the right edge
    // Both land the (flipped) origin column exactly on the feet.
    expect(normal.x + origin[0] * 2).toBe(100);
    expect(mirrored.x + mirrored.w - origin[0] * 2).toBe(100);
  });
});

describe("animation timing", () => {
  const walk: Animation = { image: "hero_sheet", frames: [4, 5, 6, 7], fps: 8, loop: true };
  it("loops", () => {
    expect([0, 0.124, 0.125, 0.375, 0.5, 0.625].map((t) => frameAt(walk, t))).toEqual([4, 4, 5, 7, 4, 5]);
  });
  it("holds the last frame of a once animation", () => {
    expect([0, 0.25, 10].map((t) => frameAt({ ...walk, loop: false }, t))).toEqual([4, 6, 7]);
  });
});

describe("facing from movement", () => {
  it("uses the dominant axis", () => {
    expect(facingFor([10, 3], "down")).toBe("right");
    expect(facingFor([-10, 3], "down")).toBe("left");
    expect(facingFor([2, -9], "down")).toBe("up");
    expect(facingFor([2, 9], "up")).toBe("down");
    expect(facingFor([5, 5], "up")).toBe("right");
    expect(facingFor([0, 0], "up")).toBe("up");
  });
});

describe("animation slots", () => {
  const a = (frames: number[]): Animation => ({ image: "hero_sheet", frames, fps: 8, loop: true });
  const hero: Pick<CharacterFile, "animations" | "mirrorLeft"> = {
    mirrorLeft: true,
    animations: { idle_down: a([0]), walk_down: a([0, 1, 2, 3]), walk_right: a([4, 5, 6, 7]), talk_down: a([8, 9]) },
  };
  it("uses the slot when present", () => {
    expect(resolveAnim(hero, "talk", "down")).toEqual({ anim: a([8, 9]), mirror: false, still: false });
  });
  it("falls back talk → idle → first frame of walk", () => {
    expect(resolveAnim({ ...hero, animations: { idle_down: a([0]) } }, "talk", "down")!.anim.frames).toEqual([0]);
    expect(resolveAnim(hero, "talk", "right")).toEqual({ anim: a([4, 5, 6, 7]), mirror: false, still: true });
    expect(resolveAnim(hero, "idle", "right")!.still).toBe(true);
  });
  it("mirrors right for left when marked", () => {
    expect(resolveAnim(hero, "walk", "left")).toEqual({ anim: a([4, 5, 6, 7]), mirror: true, still: false });
    const own = { mirrorLeft: false, animations: { ...hero.animations, walk_left: a([12, 13]) } };
    expect(resolveAnim(own, "walk", "left")).toEqual({ anim: a([12, 13]), mirror: false, still: false });
  });
  it("falls back to facing down when a direction has nothing", () => {
    expect(resolveAnim(hero, "walk", "up")!.anim.frames).toEqual([0, 1, 2, 3]);
    expect(resolveAnim({ mirrorLeft: false, animations: {} }, "idle", "up")).toBe(null);
  });
});
