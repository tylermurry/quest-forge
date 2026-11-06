import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject, planSave, validateProject, type CharacterFile, type Project } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { sheetFits } from "../src/sprite.ts";
import { World, type LoadedImage } from "../src/world.ts";

// The hand-written M1 fixture (D68) that the dev page plays.

const ROOT = join(import.meta.dirname, "../fixtures/m1");

async function load() {
  const { project, problems } = await loadProject(new NodeFs(ROOT));
  return { project, problems };
}

/** Width and height from a PNG's IHDR chunk. */
async function pngSize(path: string) {
  const bytes = await readFile(join(ROOT, path));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

async function world(project: Project, sceneId = "garden") {
  const images = new Map<string, LoadedImage>();
  for (const asset of project.assets!.data.images) images.set(asset.id, { asset, size: await pngSize(asset.path) });
  const characters = new Map<string, CharacterFile>(project.characters.map((c) => [c.data.id, c.data]));
  const scene = project.scenes.find((s) => s.data.id === sceneId)!.data;
  return new World(project.game!.data, scene, characters, (id) => images.get(id), Object.keys(scene.spawns)[0]!);
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) w.tick(1 / 60);
};

describe("the M1 fixture", () => {
  it("loads with no problems and is in canonical form", async () => {
    const { project, problems } = await load();
    expect(problems).toEqual([]);
    expect(validateProject(project)).toEqual([]);
    expect(planSave(project)).toEqual({ writes: [], deletes: [] });
  });

  it("has real PNGs whose sheets fit", async () => {
    const { project } = await load();
    for (const asset of project.assets!.data.images) expect(sheetFits(asset, await pngSize(asset.path))).toBe(true);
    expect(await pngSize("assets/images/garden_bg.png")).toEqual({ w: 640, h: 400 });
  });

  it("has a stress scene with 15 objects and 3 characters (spec 03)", async () => {
    const { project } = await load();
    const w = await world(project, "stress");
    expect(w.scene.objects).toHaveLength(15);
    expect(w.drawList().filter((d) => d.kind === "character")).toHaveLength(3);
  });

  it("plays the M1 acceptance walk headlessly", async () => {
    const { project } = await load();
    const w = await world(project);
    const order = () => w.drawList().map((d) => d.id);

    // Around the pond.
    w.primaryClick([300, 270]);
    expect(w.route.length).toBeGreaterThan(1);
    run(w, 10);
    expect(Math.round(w.player.pos[0])).toBe(300);
    expect(Math.round(w.player.pos[1])).toBe(270);

    // Behind the palm (above its baseline), then in front of it.
    w.primaryClick([70, 345]);
    run(w, 10);
    expect(order().indexOf("hero")).toBeLessThan(order().indexOf("palm"));
    w.primaryClick([70, 385]);
    run(w, 10);
    expect(order().indexOf("hero")).toBeGreaterThan(order().indexOf("palm"));

    // In front of the rock.
    w.primaryClick([475, 320]);
    run(w, 10);
    expect(order().indexOf("hero")).toBeGreaterThan(order().indexOf("rock"));

    // The boulder blocks the path to the ledge; hiding it opens one.
    const before = w.playerScale;
    w.primaryClick([330, 160]);
    run(w, 15);
    expect(w.player.pos[1]).toBeGreaterThan(240);
    w.setObjectVisible("boulder", false);
    w.primaryClick([330, 160]);
    run(w, 15);
    expect(Math.round(w.player.pos[1])).toBe(160);
    // Shrunk toward the far line.
    expect(w.playerScale).toBeLessThan(0.4);
    expect(w.playerScale).toBeLessThan(before);
  });
});
