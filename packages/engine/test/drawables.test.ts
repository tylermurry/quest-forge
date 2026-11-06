import { describe, expect, it } from "vitest";
import { scaleAt } from "../src/depth.ts";
import { actorDrawable, sceneDrawables } from "../src/drawables.ts";
import { World } from "../src/world.ts";
import { testImages, testProject } from "./support/project.ts";

const p = testProject();
const yard = p.scenes[0]!.data;
const hero = p.characters.find((c) => c.data.id === "hero")!.data;
const gardener = p.characters.find((c) => c.data.id === "gardener")!.data;
const chars = new Map(p.characters.map((c) => [c.data.id, c.data]));

describe("shared scene draw list (D93)", () => {
  it("matches what the playing World draws", () => {
    const world = new World(yard, chars, testImages, { player: "hero", spawn: { x: 100, y: 380, facing: "up" } });
    const actors = [...world.npcs, world.player];
    expect(sceneDrawables(yard, testImages, () => true, actors)).toEqual(world.drawList());
  });

  it("draws a scene with no player, e.g. in the editor", () => {
    const placed = yard.characters.map((c) => ({ id: c.character, character: gardener, pos: [c.x, c.y] as const, facing: c.facing, kind: "idle" as const, animTime: 0 }));
    const list = sceneDrawables(yard, testImages, () => true, placed);
    expect(list.map((d) => d.id)).toEqual(["rock", "boulder", "gardener"]);
  });

  it("sorts an extra actor (the ghost) between sprites by its feet", () => {
    const ghost = { id: "hero", character: hero, pos: [210, 230] as const, facing: "down" as const, kind: "idle" as const, animTime: 0 };
    // rock and boulder both have baseline 240 (y 200 + height 40); feet at 230 draw behind them.
    expect(sceneDrawables(yard, testImages, () => true, [ghost]).map((d) => d.id)).toEqual(["hero", "rock", "boulder"]);
    const front = { ...ghost, pos: [210, 300] as const };
    expect(sceneDrawables(yard, testImages, () => true, [front]).map((d) => d.id)).toEqual(["rock", "boulder", "hero"]);
  });

  it("scales a character for depth", () => {
    const scene = { ...yard, depth: { far: { y: 200, scale: 0.5 }, near: { y: 400, scale: 1 } } };
    const d = actorDrawable({ id: "hero", character: hero, pos: [300, 300], facing: "down", kind: "idle", animTime: 0 }, scene.depth, testImages)!;
    expect(d.dest.h).toBeCloseTo(48 * scaleAt(scene.depth, 300));
    expect(d.dest.y + d.dest.h).toBeCloseTo(300);
  });
});

describe("scenes without a background (D97)", () => {
  it("need only their sprites' images and still play", async () => {
    const { sceneImageIds } = await import("../src/game.ts");
    const { Session } = await import("../src/session.ts");
    const proj = testProject();
    const { background: _bg, ...bare } = proj.scenes[0]!.data;
    proj.scenes = [{ ...proj.scenes[0]!, data: bare }, ...proj.scenes.slice(1)];
    const scene = proj.scenes[0]!.data;
    expect(scene.background).toBeUndefined();
    expect(sceneImageIds(scene, chars, "hero")).not.toContain(undefined);
    const session = new Session(proj, testImages, { scene: "yard", spawn: "default" });
    expect(session.scene.id).toBe("yard");
  });
});
