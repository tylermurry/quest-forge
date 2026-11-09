import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildQuest, isEmptyPlan, loadProject, planSave, validateProject, type CharacterFile, type Project } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { loadQuest } from "../src/quest.ts";
import { DEFAULT_SETTINGS, MemoryStore, SaveSlots } from "../src/saves.ts";
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
    // The stress scene is only opened from the dev page, so nothing in the game leads to it (D122).
    expect(validateProject(project).map((p) => [p.code, p.location.file])).toEqual([["scene_unreachable", "scenes/stress.scene.yaml"]]);
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

/** The M2 puzzle chain, touch only at phone size (spec 06); also played from a built `.quest` (D153). */
function playM2Chain(project: Project, images: Map<string, LoadedImage>) {
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
}

describe("the M2 puzzle chain, touch only at phone size (spec 06)", () => {
  it("plays pick up → exit → take → combine → use → gated sequence → ledge", async () => {
    const { project } = await load();
    playM2Chain(project, await imagesOf(project));
  });

  it("plays the same from the built .quest file (D153)", async () => {
    const { project } = await load();
    const bundle = await loadQuest(await buildQuest(project, (p) => readFile(join(ROOT, p)).then((b) => new Uint8Array(b))));
    const images = new Map<string, LoadedImage>();
    for (const asset of bundle.project.assets!.data.images) {
      const v = new DataView(await (await fetch(bundle.assetUrl(asset.path))).arrayBuffer());
      images.set(asset.id, { asset, size: { w: v.getUint32(16), h: v.getUint32(20) } });
    }
    playM2Chain(bundle.project, images);
    bundle.dispose();
  });
});

describe("the M7 shop, touch only at phone size (spec 11, spec 06)", () => {
  it("plays coin → talk → once-only question → buy while holding the coin → loop → goodbye", async () => {
    const { project } = await load();
    const images = await imagesOf(project);
    const s = new Session(project, (id) => images.get(id), { scene: "shed", spawn: "door" });
    const ui = new PlayerUi(s);
    const cssScale = fitViewport(844, 390).scale; // iPhone 14 landscape
    ui.setScale(cssScale);

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
    const said: string[] = [];
    /** Tap through text boxes until the game is idle or the list box waits for a pick. */
    const settle = () => {
      for (let i = 0; i < 60 * 60; i++) {
        if (s.text) {
          said.push(s.text.text);
          tap([320, 120]);
        }
        step();
        if (s.choices && !s.text) return;
        if (!s.busy && !s.world.walking && !s.text) return;
      }
      throw new Error("never settled");
    };
    const verb = (id: string) => {
      tap(center(ui.layout.tab.hit));
      tap(center(ui.layout.barButtons.find((b) => b.id === id)!.rect));
    };
    const shown = () => s.choices?.options.map((o) => o.text) ?? [];
    /** Taps an option of the list box; every row is at least 44 CSS px tall (D76). */
    const pick = (text: string) => {
      const box = ui.choiceBox!;
      for (const r of box.rows) expect(r.h * cssScale).toBeGreaterThanOrEqual(44);
      tap(center(box.rows[shown().indexOf(text) - box.first]!));
      settle();
    };

    tap([100, 385]);
    settle();
    // Hand on the workbench (not the string on it) → the coin.
    verb("hand");
    tap([420, 240]);
    settle();
    expect(s.state.inventory).toEqual(["coin"]);

    // Talk to the visitor: the greeting in their color, then the menu.
    verb("talk");
    const visitor = s.world.drawList().find((d) => d.kind === "character" && d.id === "visitor")!.dest;
    tap(center(visitor));
    settle();
    expect(said.at(-1)).toBe("Welcome! Have a look at my wares.");
    expect(shown()).toEqual(["Where are you headed?", "I'll buy the lantern.", "Goodbye."]);

    // The once-only question loops back to the menu without itself.
    pick("Where are you headed?");
    expect(said.at(-1)).toBe("Over the hills, once the rain stops.");
    expect(shown()).toEqual(["I'll buy the lantern.", "Goodbye."]);

    // Buying needs the coin; afterwards the option is gone.
    pick("I'll buy the lantern.");
    expect(s.state.inventory).toEqual(["lantern"]);
    expect(said.at(-1)).toBe("Mind the oil. Anything else?");
    expect(shown()).toEqual(["Goodbye."]);

    pick("Goodbye.");
    expect(s.busy).toBe(false);
    expect(s.dialogue).toBe(null);
    expect(s.state.dialogueChoices).toEqual(["shop/menu/ask"]);

    // Talking again: the question stays gone, and with no coin only Goodbye is left.
    tap(center(visitor));
    settle();
    expect(shown()).toEqual(["Goodbye."]);
  });
});

describe("the M8 shed: save, die, try again, restore (spec 07), touch only at phone size", () => {
  it("saves in the shed, dies on the saw, tries again, then restores the save after a fresh start", async () => {
    const { project } = await load();
    const images = await imagesOf(project);
    const store = new MemoryStore();
    const start = () => {
      const s = new Session(project, (id) => images.get(id), { scene: "shed", spawn: "door" });
      const ui = new PlayerUi(s, { slots: new SaveSlots(store, s.game), settings: DEFAULT_SETTINGS });
      ui.setScale(fitViewport(844, 390).scale);
      return { s, ui };
    };
    let { s, ui } = start();
    const center = (r: Rect): Vec => [r.x + r.w / 2, r.y + r.h / 2];
    const tap = (p: Vec) => {
      ui.pointerDown(p, "touch");
      s.tick(1 / 60);
      ui.tick(1 / 60);
      ui.pointerUp(p, "touch");
    };
    const settle = () => {
      for (let i = 0; i < 60 * 60; i++) {
        if (s.text) tap([320, 120]);
        s.tick(1 / 60);
        ui.tick(1 / 60);
        if (!s.busy && !s.world.walking && !s.text) return;
        if (s.ending) return;
      }
      throw new Error("never settled");
    };
    const bar = (id: string) => {
      tap(center(ui.layout.tab.hit));
      tap(center(ui.layout.barButtons.find((b) => b.id === id)!.rect));
    };
    const pressIn = <Id extends string>(list: { id: Id; rect: Rect }[], id: Id) => tap(center(list.find((b) => b.id === id)!.rect));

    settle();
    expect(s.state.music).toBe("shed_theme");
    bar("hand");
    tap([420, 240]);
    settle();
    expect(s.state.inventory).toEqual(["coin"]);
    expect(s.sounds).toEqual(["pickup"]);

    // Save into the first slot from Settings.
    bar("settings");
    pressIn(ui.layout.settings.buttons, "save");
    pressIn(ui.layout.slots.buttons, "act");
    const saved = structuredClone(s.state);

    // Grab the saw: the death box.
    bar("hand");
    tap([140, 150]);
    settle();
    expect(s.ending?.kind).toBe("die");
    pressIn(ui.layout.ending.buttons, "try_again");
    expect(s.ending).toBe(null);
    expect(s.state.inventory).toEqual([]);
    expect(s.state.visited).toEqual(["shed"]);

    // A fresh page, then Restore from the death box after dying again.
    ({ s, ui } = start());
    settle();
    bar("hand");
    tap([140, 150]);
    settle();
    pressIn(ui.layout.ending.buttons, "restore");
    expect(ui.panel).toBe("load");
    pressIn(ui.layout.slots.buttons, "act");
    expect(s.ending).toBe(null);
    expect(s.state).toEqual(saved);
  });
});
