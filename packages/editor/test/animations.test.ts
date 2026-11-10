import { serialize, type CharacterFile, type Project } from "@questforge/schema";
import { describe, expect, it } from "vitest";
import { defaultSlotImage, patchSlot, pickFrames, rowFrames, setMirrorLeft, setSlot, slotLabel, slotView } from "../src/model/animations.ts";
import { errorsIn, m1Project } from "./support/fixtures.ts";

// Character animation slots.

const char = (p: Project, id: string) => p.characters.find((c) => c.data.id === id)!.data as CharacterFile;
const img = (p: Project, id: string) => p.assets!.data.images.find((i) => i.id === id)!;

describe("slot commands", () => {
  it("fills an empty slot with the character's usual image, looping at 8 fps", async () => {
    const p = await m1Project();
    expect(char(p, "hero").animations.talk_up).toBeUndefined();
    const next = patchSlot(p, "hero", "talk_up", { frames: [3, 4] });
    expect(char(next, "hero").animations.talk_up).toEqual({ image: "hero_sheet", frames: [3, 4], fps: 8, loop: true });
    expect(errorsIn(next)).toEqual([]);
  });

  it("writes slots in slot order, whatever order they were filled in", async () => {
    const p = await m1Project();
    const next = patchSlot(patchSlot(p, "hero", "talk_right", {}), "hero", "idle_up", {});
    const keys = Object.keys(char(next, "hero").animations);
    const order = [
      "idle_down",
      "idle_up",
      "idle_left",
      "idle_right",
      "walk_down",
      "walk_up",
      "walk_left",
      "walk_right",
      "talk_down",
      "talk_up",
      "talk_left",
      "talk_right",
    ];
    expect(keys).toEqual(order.filter((k) => keys.includes(k)));
    expect(serialize(char(next, "hero"))).toContain("animations:\n  idle_down:");
  });

  it("changes fps, loop and image, keeping only frames the new image has", async () => {
    const p = await m1Project();
    let next = patchSlot(p, "hero", "walk_down", { fps: 12, loop: false });
    expect(char(next, "hero").animations.walk_down).toMatchObject({ fps: 12, loop: false });
    next = patchSlot(next, "hero", "walk_down", { image: "rock_img" });
    expect(char(next, "hero").animations.walk_down).toMatchObject({ image: "rock_img", frames: [0] });
    expect(errorsIn(next)).toEqual([]);
  });

  it("refuses an invalid fps or no frames, in plain English", async () => {
    const p = await m1Project();
    expect(() => patchSlot(p, "hero", "walk_down", { fps: 0 })).toThrow("Frames per second must be more than 0 and at most 60.");
    expect(() => patchSlot(p, "hero", "walk_down", { frames: [] })).toThrow("An animation needs at least one frame.");
    expect(() => setSlot(p, "nobody", "walk_down", null)).toThrow("There's no character with ID nobody.");
  });

  it("empties a slot and toggles left mirroring", async () => {
    const p = await m1Project();
    const next = setMirrorLeft(setSlot(p, "hero", "walk_down", null), "hero", false);
    expect(char(next, "hero").animations.walk_down).toBeUndefined();
    expect(char(next, "hero").mirrorLeft).toBe(false);
    expect(char(p, "hero").animations.walk_down).toBeDefined();
  });

  it("starts a character with no slots on the first sliced image", async () => {
    const p = await m1Project();
    const bare = setSlot(setSlot(p, "hero", "idle_down", null), "hero", "walk_down", null);
    const empty = Object.keys(char(bare, "hero").animations).reduce((q, s) => setSlot(q, "hero", s as "walk_down", null), bare);
    expect(defaultSlotImage(empty, "hero")).toBe(p.assets!.data.images.find((i) => i.sheet)!.id);
  });
});

describe("what a slot shows (engine fallbacks)", () => {
  const anim = (frames: number[]) => ({ image: "s", frames, fps: 8, loop: true });
  const c = { mirrorLeft: true, animations: { idle_down: anim([0]), walk_down: anim([0, 1]), walk_right: anim([4, 5]) } };

  it("names a slot's own animation", () => {
    expect(slotLabel(slotView(c, "walk_down"), "walk_down")).toBe("2 frames · 8 fps");
  });

  it("shows a mirrored right walk for an empty left slot", () => {
    const v = slotView(c, "walk_left");
    expect(v.shown).toMatchObject({ mirror: true, from: "walk_right" });
    expect(slotLabel(v, "walk_left")).toBe("Mirrors walk_right");
  });

  it("says a left slot's own animation is unused while left mirrors right", () => {
    const withLeft = { ...c, animations: { ...c.animations, walk_left: anim([9]) } };
    expect(slotLabel(slotView(withLeft, "walk_left"), "walk_left")).toBe("Mirrors walk_right");
    expect(slotLabel(slotView({ ...withLeft, mirrorLeft: false }, "walk_left"), "walk_left")).toBe("1 frame · 8 fps");
    const noRight = { mirrorLeft: true, animations: { walk_down: anim([0]), walk_left: anim([9]) } };
    expect(slotLabel(slotView(noRight, "walk_left"), "walk_left")).toBe("Not used: left mirrors right");
  });

  it("explains the talk → idle → walk fallback and facing-down fallback", () => {
    expect(slotLabel(slotView(c, "talk_down"), "talk_down")).toBe("Empty: uses idle_down");
    expect(slotLabel(slotView(c, "idle_right"), "idle_right")).toBe("Empty: uses first frame of walk_right");
    expect(slotLabel(slotView(c, "walk_up"), "walk_up")).toBe("Empty: uses walk_down");
    expect(slotLabel(slotView({ ...c, mirrorLeft: false }, "walk_left"), "walk_left")).toBe("Empty: uses walk_down");
    expect(slotLabel(slotView({ mirrorLeft: false, animations: {} }, "walk_left"), "walk_left")).toBe("Empty");
  });
});

describe("frame picking", () => {
  it("picks one frame, a shift range either way, or toggles with Cmd/Ctrl", () => {
    expect(pickFrames([1, 2], 5)).toEqual([5]);
    expect(pickFrames([8], 11, { range: true }, 8)).toEqual([8, 9, 10, 11]);
    expect(pickFrames([8], 5, { range: true }, 8)).toEqual([8, 7, 6, 5]);
    expect(pickFrames([1, 2], 7, { toggle: true })).toEqual([1, 2, 7]);
    expect(pickFrames([1, 2], 1, { toggle: true })).toEqual([2]);
    expect(pickFrames([2], 2, { toggle: true })).toEqual([2]);
  });

  it("takes a whole sheet row", async () => {
    const p = await m1Project();
    expect(rowFrames(img(p, "hero_sheet"), 1)).toEqual([4, 5, 6, 7]);
    expect(rowFrames(img(p, "rock_img"), 0)).toEqual([0]);
    expect(() => rowFrames(img(p, "hero_sheet"), 3)).toThrow("The sheet has rows 1 to 3.");
  });
});
