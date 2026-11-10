import { describe, expect, it } from "vitest";
import { ImageAsset, formatProblem, loadProject, serialize, validateProject, type Project } from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE } from "./helpers.ts";

// Spritesheet slicing and origin.

const fixture = async () => structuredClone((await loadProject(new NodeFs(FIXTURE))).project);
const image = (p: Project, id: string) => p.assets!.data.images.find((i) => i.id === id)!;
const hero = (p: Project) => p.characters.find((c) => c.data.id === "hero")!.data;

describe("image assets with a sheet and origin", () => {
  it("parse strictly and serialize canonically", () => {
    const img = ImageAsset.parse({ id: "hero_sheet", path: "assets/images/hero.png", sheet: { columns: 4, rows: 2, cellWidth: 32, cellHeight: 48 }, origin: [16, 48] });
    expect(serialize(img)).toBe(
      "id: hero_sheet\npath: assets/images/hero.png\nsheet:\n  columns: 4\n  rows: 2\n  cellWidth: 32\n  cellHeight: 48\norigin: [16, 48]\n",
    );
    expect(ImageAsset.safeParse({ id: "a", path: "assets/a.png", sheet: { columns: 0, rows: 1, cellWidth: 8, cellHeight: 8 } }).success).toBe(false);
    expect(ImageAsset.safeParse({ id: "a", path: "assets/a.png", sheet: { columns: 1, rows: 1, cellWidth: 8, cellHeight: 8, gap: 1 } }).success).toBe(false);
    expect(ImageAsset.safeParse({ id: "a", path: "assets/a.png", origin: [-1, 0] }).success).toBe(false);
  });

  it("are optional: a plain image parses without adding keys", () => {
    expect(ImageAsset.parse({ id: "a", path: "assets/a.png" })).toEqual({ id: "a", path: "assets/a.png" });
  });
});

describe("sprite validation", () => {
  it("reports frames past the end of the sheet", async () => {
    const p = await fixture();
    hero(p).animations.walk_right!.frames = [4, 8];
    expect(validateProject(p).map((x) => [x.code, x.location.path.join("."), formatProblem(x)])).toEqual([
      ["frame_out_of_range", "animations.walk_right.frames.1", 'Character "Hero": animation walk_right uses frame 8, but image hero_sheet has only 8 frames (0 to 7).'],
    ]);
  });

  it("treats an unsliced image as a single frame", async () => {
    const p = await fixture();
    delete image(p, "hero_sheet").sheet;
    delete image(p, "hero_sheet").origin;
    const problems = validateProject(p);
    expect(problems.every((x) => x.code === "frame_out_of_range")).toBe(true);
    expect(problems.map((x) => x.message)).toContain("animation walk_down uses frame 1, but image hero_sheet has only 1 frame (it isn't sliced into a sheet).");
  });

  it("reports an origin outside the frame", async () => {
    const p = await fixture();
    image(p, "hero_sheet").origin = [16, 49];
    const problems = validateProject(p);
    expect(problems.map((x) => [x.code, x.location.path.join("."), formatProblem(x)])).toEqual([
      ["origin_outside_frame", "images.9.origin", 'Assets › Image "hero_sheet": has its origin at (16, 49), outside its 32×48 frames.'],
    ]);
  });
});
