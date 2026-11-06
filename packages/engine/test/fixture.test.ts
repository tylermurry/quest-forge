import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmptyPlan, loadProject, planSave, validateProject, type CharacterFile, type Project } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { Session } from "../src/session.ts";
import { sheetFits, type Rect } from "../src/sprite.ts";
import { score } from "../src/state.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { fitViewport } from "../src/viewport.ts";
import type { Vec } from "../src/vec.ts";
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
  return new World(scene, characters, (id) => images.get(id), { player: project.game!.data.player, spawn: Object.values(scene.spawns)[0]! });
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) w.tick(1 / 60);
};

async function imagesOf(project: Project) {
  const images = new Map<string, LoadedImage>();
  for (const asset of project.assets!.data.images) images.set(asset.id, { asset, size: await pngSize(asset.path) });
  return images;
}

describe("the M1 fixture", () => {
  it("loads with no problems and is in canonical form", async () => {
    const { project, problems } = await load();
    expect(problems).toEqual([]);
    expect(validateProject(project)).toEqual([]);
    expect(planSave(project)).toSatisfy(isEmptyPlan);
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
    w.walkTo([300, 270]);
    expect(w.route.length).toBeGreaterThan(1);
    run(w, 10);
    expect(Math.round(w.player.pos[0])).toBe(300);
    expect(Math.round(w.player.pos[1])).toBe(270);

    // Behind the palm (above its baseline), then in front of it.
    w.walkTo([70, 345]);
    run(w, 10);
    expect(order().indexOf("hero")).toBeLessThan(order().indexOf("palm"));
    w.walkTo([70, 385]);
    run(w, 10);
    expect(order().indexOf("hero")).toBeGreaterThan(order().indexOf("palm"));

    // In front of the rock.
    w.walkTo([475, 320]);
    run(w, 10);
    expect(order().indexOf("hero")).toBeGreaterThan(order().indexOf("rock"));

    // The boulder blocks the path to the ledge; hiding it opens one.
    const before = w.playerScale;
    w.walkTo([330, 160]);
    run(w, 15);
    expect(w.player.pos[1]).toBeGreaterThan(240);
    w.setObjectVisible("boulder", false);
    w.walkTo([330, 160]);
    run(w, 15);
    expect(Math.round(w.player.pos[1])).toBe(160);
    // Shrunk toward the far line.
    expect(w.playerScale).toBeLessThan(0.4);
    expect(w.playerScale).toBeLessThan(before);
  });
});

describe("the M2 puzzle chain, touch only at phone size (spec 06)", () => {
  it("plays pick up → exit → take → combine → use → gated sequence → ledge", async () => {
    const { project } = await load();
    const images = await imagesOf(project);
    const s = new Session(project, (id) => images.get(id));
    const ui = new PlayerUi(s);
    ui.setScale(fitViewport(844, 390).scale); // iPhone 14 landscape, CSS px per scene px

    const center = (r: Rect): Vec => [r.x + r.w / 2, r.y + r.h / 2];
    const step = () => {
      s.tick(1 / 60);
      ui.tick(1 / 60);
    };
    const tap = (p: Vec) => {
      ui.pointerDown(p, "touch");
      step();
      ui.pointerUp(p, "touch");
    };
    const texts: string[] = [];
    /** Play on, tapping through every text box, until the game is idle again. */
    const settle = () => {
      for (let i = 0; i < 60 * 60; i++) {
        if (s.text) {
          texts.push(s.text.text);
          tap([320, 200]);
        }
        step();
        if (!s.busy && !s.world.walking && !s.text) return;
      }
      throw new Error("never settled");
    };
    const verb = (id: string) => {
      tap(center(ui.layout.tab.hit));
      expect(ui.barOpen).toBe(true);
      tap(center(ui.layout.barButtons.find((b) => b.id === id)!.rect));
    };
    const invCell = (item: string) => center(ui.layout.inventory.cells[s.state.inventory.indexOf(item)]!);
    const invButton = (id: string) => center(ui.layout.inventory.buttons.find((b) => b.id === id)!.rect);

    // Touch input reveals the tab.
    tap([200, 385]);
    settle();

    // 1. Hand on the flowerpot → stick (+5).
    verb("hand");
    tap([155, 300]);
    settle();
    expect(s.state.inventory).toEqual(["stick"]);
    // A second Hand gets the next matching rule.
    tap([155, 300]);
    settle();
    expect(texts.at(-1)).toBe("Nothing else under there.");

    // Default response: talk to the rock.
    verb("talk");
    tap([475, 280]);
    settle();
    expect(texts.at(-1)).toBe("Nobody answers.");

    // 2. Walk into the east exit → the shed, with its first-time enter text.
    verb("walk");
    tap([615, 375]);
    settle();
    expect(s.scene.id).toBe("shed");
    expect(texts.at(-1)).toBe("A cramped garden shed. It smells of soil and oil.");

    // 3. Take the string from the workbench.
    verb("hand");
    tap([481, 195]);
    settle();
    expect(s.state.inventory).toEqual(["stick", "string"]);
    expect(s.world.isObjectVisible("string")).toBe(false);

    // Back to the garden through the west exit.
    verb("walk");
    tap([40, 385]);
    settle();
    expect(s.scene.id).toBe("garden");
    expect(s.state.visited).toEqual(["garden", "shed"]);

    // 4. Inventory: select the string, then hold it on the stick → fishing rod.
    tap(center(ui.layout.tab.hit));
    tap(center(ui.layout.barButtons.find((b) => b.id === "inventory")!.rect));
    tap(invButton("select"));
    tap(invCell("string"));
    expect(s.item).toBe("string");
    tap(center(ui.layout.tab.hit));
    tap(center(ui.layout.barButtons.find((b) => b.id === "inventory")!.rect));
    expect(ui.inventoryMode).toBe("item");
    tap(invCell("stick"));
    settle();
    expect(s.state.inventory).toEqual(["rod"]);
    tap(invButton("select"));
    tap(invCell("rod"));
    expect(ui.panel).toBe(null);
    expect(s.verb).toBe("item");

    // 5. Use the rod on the pond → fish (+5).
    tap([300, 320]);
    settle();
    expect(s.state.inventory).toEqual(["rod", "fish"]);

    // 6. Talk to the gardener holding the fish: the gated sequence (+10).
    verb("talk");
    tap([560, 312]);
    settle();
    expect(s.state.inventory).toEqual(["rod"]);
    expect(s.state.flags.path_open).toBe(true);
    expect(s.world.isObjectVisible("boulder")).toBe(false);
    expect(s.state.characters["garden/gardener"]).toEqual({ x: 372, y: 262, facing: "left" });
    expect(texts).toContain("With a grunt, the gardener rolls the boulder aside. The path to the ledge is open.");

    // 7. The ledge, now reachable (+5).
    verb("walk");
    tap([330, 160]);
    settle();
    expect(texts.at(-1)).toBe("From the ledge you can see the whole valley.");
    expect(score(s.state)).toBe(s.game.maxScore);
    expect(JSON.parse(JSON.stringify(s.state))).toEqual(s.state);
  });
});
