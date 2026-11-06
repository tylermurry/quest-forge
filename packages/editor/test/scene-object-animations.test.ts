import { validateProject, type Project, type SceneFile } from "@questforge/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  addObjectAnimation,
  changeObjectAnimationId,
  deleteObjectAnimation,
  patchObjectAnimation,
  patchObjectLoop,
  removeObjectLoop,
} from "../src/model/scene/objectAnimations.ts";
import { m1Project } from "./support/fixtures.ts";
import { sceneEditor } from "./support/scene.ts";

// Object animations in the scene editor (spec 05, D111–D113).

const scene = (p: Project, id: string) => p.scenes.find((s) => s.data.id === id)!.data as SceneFile;
const bench = (p: Project) => scene(p, "shed").objects.find((o) => o.id === "workbench")!;

describe("object animation commands", () => {
  it("adds a loop on the object's own image, edits it and removes it", async () => {
    const p = await m1Project();
    let next = patchObjectLoop(p, "shed", "workbench", {});
    expect(bench(next).animation).toEqual({ image: "workbench_img", frames: [0], fps: 8 });
    next = patchObjectLoop(next, "shed", "workbench", { image: "hero_sheet", frames: [0, 1, 2], fps: 6 });
    expect(bench(next).animation).toEqual({ image: "hero_sheet", frames: [0, 1, 2], fps: 6 });
    // A new image keeps only frames it has.
    expect(bench(patchObjectLoop(next, "shed", "workbench", { image: "rock_img" })).animation!.frames).toEqual([0]);
    expect(validateProject(next)).toEqual([]);
    expect(bench(removeObjectLoop(next, "shed", "workbench")).animation).toBeUndefined();
    expect(bench(p).animation).toBeUndefined();
  });

  it("adds one-shots with unique IDs and edits, renames and deletes them", async () => {
    const p = await m1Project();
    const a = addObjectAnimation(p, "shed", "workbench");
    const b = addObjectAnimation(a.project, "shed", "workbench");
    expect([a.id, b.id]).toEqual(["anim", "anim_2"]);
    let next = patchObjectAnimation(b.project, "shed", "workbench", "anim", { fps: 12 });
    expect(bench(next).animations![0]).toEqual({ id: "anim", image: "workbench_img", frames: [0], fps: 12 });
    next = changeObjectAnimationId(next, "shed", "workbench", "anim", "creak");
    expect(bench(next).animations!.map((x) => x.id)).toEqual(["creak", "anim_2"]);
    expect(() => changeObjectAnimationId(next, "shed", "workbench", "creak", "anim_2")).toThrow("This object already has an animation with ID anim_2");
    next = deleteObjectAnimation(deleteObjectAnimation(next, "shed", "workbench", "creak"), "shed", "workbench", "anim_2");
    expect(bench(next)).not.toHaveProperty("animations");
  });

  it("refuses bad fields in plain English", async () => {
    const p = await m1Project();
    expect(() => patchObjectLoop(p, "shed", "workbench", { fps: 0 })).toThrow("Frames per second must be more than 0 and at most 60.");
    expect(() => patchObjectLoop(p, "shed", "workbench", { image: "nope" })).toThrow("There's no image with ID nope.");
    expect(() => patchObjectLoop(p, "shed", "ghost", {})).toThrow("That's no longer in the scene.");
  });
});

describe("live canvas (D113)", () => {
  let dispose = () => {};
  afterEach(() => dispose());

  it("animates object loops on the canvas clock, and only redraws while something moves", async () => {
    const p = await m1Project();
    const s = await sceneEditor(p, "shed", { hero_sheet: [128, 144], workbench_img: [120, 60] });
    dispose = s.dispose;
    expect(s.c.animating).toBe(false);
    s.editor.apply("Add looping animation", (q) => patchObjectLoop(q, "shed", "workbench", { image: "hero_sheet", frames: [0, 1], fps: 2 }));
    expect(s.c.animating).toBe(true);
    const src = () => s.c.frame()!.sprites.find((x) => x.d.id === "workbench")!.d.src.x;
    expect(src()).toBe(0);
    s.c.clock = 0.5;
    expect(src()).toBe(32);
  });

  it("plays placed characters' idle animations", async () => {
    const s = await sceneEditor(undefined, "garden", { gardener_sheet: [128, 144] });
    dispose = s.dispose;
    expect(s.c.animating).toBe(true); // the gardener's idle has two frames
  });
});
