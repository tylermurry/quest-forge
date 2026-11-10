import { describe, expect, it } from "vitest";
import {
  RenameError,
  SceneObject,
  findReferences,
  formatProblem,
  loadProject,
  renameId,
  renameObjectAnimation,
  renameSceneId,
  serialize,
  validateProject,
  type Action,
  type Project,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE } from "./helpers.ts";

// Object animations and play_animation references.

/** The mini fixture with the path scene's own rules cleared, so new rules start at index 0. */
const fixture = async () => {
  const p = structuredClone((await loadProject(new NodeFs(FIXTURE))).project);
  p.scenes.find((s) => s.data.id === "path")!.data.rules = [];
  return p;
};
const path = (p: Project) => p.scenes.find((s) => s.data.id === "path")!.data;
const boulder = (p: Project) => path(p).objects.find((o) => o.id === "boulder")!;
const play = (p: Project, action: Action) =>
  path(p).rules.push({ id: `play_${path(p).rules.length}`, when: { type: "scene_enter" }, if: [], do: [action], once: false });
const onBoulder = (animation: string): Action => ({ type: "play_animation", target: { kind: "object", scene: "path", object: "boulder" }, animation });
const onHero = (animation: string): Action => ({ type: "play_animation", target: { kind: "character", character: "hero" }, animation });
const report = (p: Project) => validateProject(p).map((x) => [x.code, x.location.path.join("."), formatProblem(x)]);

describe("object animation schema", () => {
  const base = { id: "torch", image: "torch_img", x: 0, y: 0, visible: true, rules: [] };

  it("serializes the loop and one-shots in schema order, next to the image", () => {
    const o = SceneObject.parse({
      ...base,
      animation: { image: "torch_img", frames: [0, 1], fps: 6 },
      animations: [{ id: "flare", image: "flare_img", frames: [2, 3, 4], fps: 10 }],
    });
    expect(serialize(o)).toBe(
      "id: torch\nimage: torch_img\nanimation:\n  image: torch_img\n  frames: [0, 1]\n  fps: 6\nanimations:\n  - id: flare\n    image: flare_img\n    frames: [2, 3, 4]\n    fps: 10\nx: 0\ny: 0\nvisible: true\nrules: []\n",
    );
  });

  it("is optional and strict: no loop flag, no unknown keys, at least one frame", () => {
    expect(SceneObject.parse(base)).toEqual(base);
    expect(SceneObject.safeParse({ ...base, animation: { image: "a", frames: [0], fps: 6, loop: true } }).success).toBe(false);
    expect(SceneObject.safeParse({ ...base, animations: [{ image: "a", frames: [0], fps: 6 }] }).success).toBe(false);
    expect(SceneObject.safeParse({ ...base, animation: { image: "a", frames: [], fps: 6 } }).success).toBe(false);
  });
});

describe("object animation validation", () => {
  it("accepts a valid loop and one-shot played by a rule", async () => {
    const p = await fixture();
    boulder(p).animation = { image: "hero_sheet", frames: [0, 1], fps: 4 };
    boulder(p).animations = [{ id: "roll", image: "hero_sheet", frames: [4, 5, 6, 7], fps: 8 }];
    play(p, onBoulder("roll"));
    expect(report(p)).toEqual([]);
  });

  it("reports frames past the end of the sheet in loops and one-shots", async () => {
    const p = await fixture();
    boulder(p).animation = { image: "boulder_img", frames: [0, 1], fps: 4 };
    boulder(p).animations = [{ id: "roll", image: "hero_sheet", frames: [9], fps: 8 }];
    expect(report(p)).toEqual([
      [
        "frame_out_of_range",
        "objects.0.animation.frames.1",
        'Village Path › Object "boulder": its looping animation uses frame 1, but image boulder_img has only 1 frame (it isn\'t sliced into a sheet).',
      ],
      [
        "frame_out_of_range",
        "objects.0.animations.0.frames.0",
        'Village Path › Object "boulder": animation roll uses frame 9, but image hero_sheet has only 8 frames (0 to 7).',
      ],
    ]);
  });

  it("reports a missing image and duplicate one-shot IDs", async () => {
    const p = await fixture();
    boulder(p).animations = [
      { id: "roll", image: "boulder_imgg", frames: [0], fps: 8 },
      { id: "roll", image: "boulder_img", frames: [0], fps: 8 },
    ];
    expect(
      report(p)
        .map((r) => r[0] + " " + r[1])
        .sort(),
    ).toEqual(["duplicate_id objects.0.animations.1.id", "missing_reference objects.0.animations.0.image"]);
  });

  it("reports play_animation naming an animation the object doesn't have", async () => {
    const p = await fixture();
    boulder(p).animations = [{ id: "roll", image: "boulder_img", frames: [0], fps: 8 }];
    play(p, onBoulder("rol"));
    expect(report(p)).toEqual([
      [
        "missing_reference",
        "rules.0.do.0.animation",
        "Village Path › Rule 1 › Action 1: plays animation rol on object boulder, which has no animation with that ID. Did you mean roll?",
      ],
    ]);
  });

  it("reports only the missing object when the object itself is gone", async () => {
    const p = await fixture();
    play(p, { type: "play_animation", target: { kind: "object", scene: "path", object: "rock" }, animation: "roll" });
    expect(report(p).map((r) => r[1])).toEqual(["rules.0.do.0.target.object"]);
  });

  it("checks character slots, counting mirrored lefts", async () => {
    const p = await fixture();
    play(p, onHero("walk_left")); // mirrored from walk_right
    play(p, onHero("talk_up"));
    expect(report(p)).toEqual([
      ["missing_reference", "rules.1.do.0.animation", "Village Path › Rule 2 › Action 1: plays animation talk_up on Hero, who has no animation in that slot."],
    ]);
    p.characters.find((c) => c.data.id === "hero")!.data.mirrorLeft = false;
    expect(report(p).map((r) => r[1])).toEqual(["rules.0.do.0.animation", "rules.1.do.0.animation"]);
  });
});

describe("object animation references", () => {
  it("lists the images an object's animations use, so renaming an image updates them", async () => {
    const p = await fixture();
    boulder(p).animation = { image: "hero_sheet", frames: [0], fps: 4 };
    boulder(p).animations = [{ id: "roll", image: "hero_sheet", frames: [1], fps: 8 }];
    expect(
      findReferences(p, "image", "hero_sheet")
        .filter((r) => r.fileKind === "scene")
        .map((r) => r.location.path.join(".")),
    ).toEqual(["objects.0.animation.image", "objects.0.animations.0.image"]);
    const next = renameId(p, "image", "hero_sheet", "hero_art");
    expect(boulder(next).animation!.image).toBe("hero_art");
    expect(boulder(next).animations![0]!.image).toBe("hero_art");
  });

  it("renames a one-shot and every play_animation that plays it, leaving other objects alone", async () => {
    const p = await fixture();
    boulder(p).animations = [{ id: "roll", image: "boulder_img", frames: [0], fps: 8 }];
    play(p, onBoulder("roll"));
    play(p, onHero("walk_down"));
    const next = renameObjectAnimation(p, "path", "boulder", "roll", "tumble");
    expect(boulder(next).animations![0]!.id).toBe("tumble");
    expect(path(next).rules.map((r) => (r.do[0] as { animation: string }).animation)).toEqual(["tumble", "walk_down"]);
    expect(validateProject(next)).toEqual([]);
    expect(boulder(p).animations![0]!.id).toBe("roll");
    expect(() => renameObjectAnimation(p, "path", "boulder", "roll", "Tumble")).toThrow(RenameError);
    expect(() => renameObjectAnimation(p, "path", "boulder", "spin", "x")).toThrow(/No animation/);
  });

  it("keeps play_animation pointing at a renamed object's animations", async () => {
    const p = await fixture();
    boulder(p).animations = [{ id: "roll", image: "boulder_img", frames: [0], fps: 8 }];
    play(p, onBoulder("roll"));
    expect(validateProject(renameSceneId(p, "path", "object", "boulder", "rock"))).toEqual([]);
  });
});
