import { describe, expect, it } from "vitest";
import { objectDrawable, sceneDrawables } from "../src/drawables.ts";
import { Session } from "../src/session.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// Object animations: looping at rest, one-shots from play_animation.

const torch = {
  id: "torch",
  name: "torch",
  image: "torch_sheet",
  animation: { image: "torch_sheet", frames: [0, 1, 2], fps: 4 },
  animations: [
    { id: "flare", image: "torch_sheet", frames: [4, 5], fps: 2 },
    { id: "smash", image: "rock_img", frames: [0], fps: 1 },
  ],
  x: 300,
  y: 250,
  visible: true,
  rules: [],
};
const yardWith = (objects: unknown[], rules: unknown[] = []) => ({ objects, rules });
const playOn = (object: string, animation: string, scene = "yard") => ({ type: "play_animation", target: { kind: "object", scene, object }, animation });
const run = (s: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.tick(1 / 60);
};
const torchSprite = (s: Session) => s.world.drawList().find((d) => d.id === "torch")!;

describe("objectDrawable", () => {
  const o = testProject({ yard: yardWith([torch]) }).scenes[0]!.data.objects[0]!;

  it("shows frame 0 of a sliced image at rest, with the frame's bottom as baseline", () => {
    const d = objectDrawable({ ...o, animation: undefined } as typeof o, testImages)!;
    expect(d.src).toEqual({ x: 0, y: 0, w: 16, h: 24 });
    expect(d.dest).toEqual({ x: 300, y: 250, w: 16, h: 24 });
    expect(d.baseline).toBe(274);
  });

  it("loops its animation on the given clock", () => {
    expect([0, 0.25, 0.5, 0.75].map((time) => objectDrawable(o, testImages, { time })!.src.x)).toEqual([0, 16, 32, 0]);
  });

  it("plays a one-shot from another image, keeping the rest baseline", () => {
    const d = objectDrawable(o, testImages, { time: 0, oneShot: { anim: o.animations![1]!, time: 0 } })!;
    expect(d.image.asset.id).toBe("rock_img");
    expect(d.dest).toEqual({ x: 300, y: 250, w: 60, h: 40 });
    expect(d.baseline).toBe(274);
  });

  it("is what sceneDrawables draws for the pose it's given", () => {
    const scene = testProject({ yard: yardWith([torch]) }).scenes[0]!.data;
    const list = sceneDrawables(
      scene,
      testImages,
      () => true,
      [],
      () => ({ time: 0.25 }),
    );
    expect(list.find((d) => d.id === "torch")!.src.x).toBe(16);
  });
});

describe("play_animation on objects", () => {
  it("loops at rest from scene entry", () => {
    const s = new Session(testProject({ yard: yardWith([torch]) }), testImages);
    expect(torchSprite(s).src.x).toBe(0);
    run(s, 0.25);
    expect(torchSprite(s).src.x).toBe(16);
  });

  it("blocks the sequence for a one-shot, then returns to the loop", () => {
    const rules = [rule({ type: "look" }, [playOn("torch", "flare"), narrate("It flares.")])];
    const s = new Session(testProject({ yard: yardWith([{ ...torch, rules }]) }), testImages);
    s.selectVerb("look");
    s.primaryClick([305, 260]);
    s.tick(1 / 60);
    expect(s.text).toBe(null);
    expect(torchSprite(s).src).toEqual({ x: 0, y: 24, w: 16, h: 24 }); // frame 4
    run(s, 0.5);
    expect(torchSprite(s).src.y).toBe(24); // frame 5
    run(s, 0.6);
    expect(s.text?.text).toBe("It flares.");
    expect(torchSprite(s).src.y).toBe(0); // back at rest, looping
    expect(s.log).toEqual([]);
  });

  it("is a no-op with a note for a hidden object, another scene's object or an unknown animation", () => {
    const rules = [
      rule({ type: "scene_enter" }, [
        { type: "hide_object", scene: "yard", object: "torch" },
        playOn("torch", "flare"),
        { type: "show_object", scene: "yard", object: "torch" },
        playOn("torch", "flare", "shed"),
        playOn("torch", "glow"),
        narrate("Done."),
      ]),
    ];
    const s = new Session(testProject({ yard: yardWith([torch], rules) }), testImages);
    run(s, 0.1);
    expect(s.text?.text).toBe("Done.");
    expect(s.log).toEqual([
      "Object torch is hidden, so it can't play flare.",
      "Object torch isn't in this scene, so it can't play flare.",
      "Object torch has no animation glow, so it can't play glow.",
    ]);
  });
});
