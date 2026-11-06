import { describe, expect, it } from "vitest";
import { addObstacle, changeThingId, setDepthScale, setThingName } from "../src/model/scene/commands.ts";
import { sceneEditor } from "./support/scene.ts";
import { m1Project } from "./support/fixtures.ts";

describe("Inspector commands (D99)", () => {
  it("changes a referenced object's ID with its references, and refuses taken IDs", async () => {
    const p = await m1Project();
    const next = changeThingId(p, "garden", { list: "objects", key: "boulder" }, "big_rock");
    const garden = next.scenes.find((s) => s.data.id === "garden")!.data;
    expect(garden.objects.some((o) => o.id === "big_rock")).toBe(true);
    expect(JSON.stringify(next.scenes.map((s) => s.data))).not.toMatch(/"object":"boulder"/);
    expect(() => changeThingId(p, "garden", { list: "objects", key: "boulder" }, "rock")).toThrow(/already has/);
  });

  it("an object's name is optional (empty makes it scenery); a hotspot's isn't", async () => {
    const p = await m1Project();
    const plain = setThingName(p, "garden", { list: "objects", key: "rock" }, "");
    expect(plain.scenes.find((s) => s.data.id === "garden")!.data.objects.find((o) => o.id === "rock")!.name).toBeUndefined();
    expect(() => setThingName(p, "garden", { list: "hotspots", key: "pond" }, " ")).toThrow(/needs a name/);
  });

  it("adds a starting obstacle along the object's baseline, and keeps depth scales in range", async () => {
    const p = await m1Project();
    const next = addObstacle(p, "garden", "palm", { w: 60, h: 120 });
    const palm = next.scenes.find((s) => s.data.id === "garden")!.data.objects.find((o) => o.id === "palm")!;
    expect(palm.obstacle!.length).toBe(4);
    expect(Math.max(...palm.obstacle!.map((q) => q[1]))).toBe(palm.baseline ?? palm.y + 120);
    expect(() => setDepthScale(p, "garden", "far", 0)).toThrow();
    expect(setDepthScale(p, "garden", "far", 0.333).scenes.find((s) => s.data.id === "garden")!.data.depth.far.scale).toBe(0.33);
  });
});

describe("live validation on the canvas (D100)", () => {
  it("marks a hole dragged outside the outline and a spawn outside the walkable area", async () => {
    const { c, drag, click, dispose } = await sceneEditor();
    expect(c.frame()!.invalid.size).toBe(0);
    c.setLayer("walkable");
    click([300, 320]);
    // Move the whole hole down past the outline's bottom edge (y 395); it stops at the scene's edge.
    drag([300, 320], [300, 380]);
    expect(c.frame()!.invalid.has("walkable:hole:0")).toBe(true);
    expect(c.problemsFor({ list: "walkable", key: "hole:0" })[0]!.message).toContain("sticks out");
    c.setLayer("guides");
    drag([200, 380], [5, 5]);
    expect(c.frame()!.invalid.has("spawns:default")).toBe(true);
    dispose();
  });
});
