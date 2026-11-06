import { describe, expect, it } from "vitest";
import {
  RenameError,
  collectReferences,
  describeReference,
  findReferences,
  loadProject,
  planSave,
  renameId,
  renameSceneId,
  saveProject,
  validateProject,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE, fixtureCopy } from "./helpers.ts";

const load = async () => (await loadProject(new NodeFs(FIXTURE))).project;

describe("reference index", () => {
  it("finds every use of an item with its exact spot", async () => {
    const project = await load();
    const refs = findReferences(project, "item", "coin");
    expect(refs.map((r) => [r.location.file, r.location.path.join(".")])).toEqual([
      ["scenes/outdoors/beach.scene.yaml", "hotspots.0.rules.0.do.1.item"],
      ["dialogues/shopkeeper_chat.dialogue.yaml", "nodes.2.options.1.if.0.item"],
      ["dialogues/shopkeeper_chat.dialogue.yaml", "nodes.4.do.0.item"],
    ]);
    expect(refs.map((r) => describeReference(project, r))).toEqual([
      'Sunny Beach › Hotspot "shell" › Rule 1 › Action 2',
      'Dialogue "Shopkeeper" › Node "menu" › Choice "buy" › Condition 1',
      'Dialogue "Shopkeeper" › Node "sell" › Action 1',
    ]);
  });

  it("covers every reference kind", async () => {
    const kinds = new Set(collectReferences(await load()).map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["audio", "character", "counter", "dialogue", "flag", "image", "item", "node", "object", "scene", "spawn"]);
  });

  it("scopes spawn and object references to their scene", async () => {
    const refs = collectReferences(await load());
    expect(refs.find((r) => r.kind === "spawn" && r.id === "from_beach")?.scope).toBe("path");
    expect(refs.find((r) => r.kind === "object" && r.id === "boulder")?.scope).toBe("path");
    expect(refs.find((r) => r.kind === "spawn" && r.location.file === "game.yaml")).toMatchObject({ id: "default", scope: "beach" });
  });
});

describe("rename (spec 01 acceptance)", () => {
  it("renaming an item ID updates every referencing rule across the project", async () => {
    const { fs } = await fixtureCopy();
    const { project } = await loadProject(fs);
    const renamed = renameId(project, "item", "coin", "gold_coin");

    const plan = planSave(renamed);
    expect(plan.writes.map((w) => w.path).sort()).toEqual([
      "dialogues/shopkeeper_chat.dialogue.yaml",
      "items/gold_coin.item.yaml",
      "scenes/outdoors/beach.scene.yaml",
    ]);
    expect(plan.deletes).toEqual(["items/coin.item.yaml"]);

    await saveProject(fs, renamed);
    const reloaded = await loadProject(fs);
    expect(reloaded.problems).toEqual([]);
    expect(findReferences(reloaded.project, "item", "coin")).toEqual([]);
    expect(findReferences(reloaded.project, "item", "gold_coin")).toHaveLength(3);
    expect(reloaded.project.items.find((i) => i.data.id === "gold_coin")?.path).toBe("items/gold_coin.item.yaml");
  });

  it("only changes the ID text in the files it touches", async () => {
    const project = await load();
    const before = planSave({ ...project, saved: {} }).writes;
    const after = planSave({ ...renameId(project, "item", "coin", "gold_coin"), saved: {} }).writes;
    const beachBefore = before.find((w) => w.path.includes("beach"))!.content;
    const beachAfter = after.find((w) => w.path.includes("beach"))!.content;
    expect(beachAfter).toBe(beachBefore.replace("item: coin\n", "item: gold_coin\n"));
  });

  it("does not mutate the original project", async () => {
    const project = await load();
    const snapshot = structuredClone(project);
    renameId(project, "scene", "path", "village_path");
    expect(project).toEqual(snapshot);
  });

  it("renames a scene, keeping its folder and updating scene-scoped references", async () => {
    const renamed = renameId(await load(), "scene", "path", "village_path");
    expect(renamed.scenes.map((s) => s.path)).toContain("scenes/outdoors/village_path.scene.yaml");
    expect(findReferences(renamed, "scene", "path")).toEqual([]);
    const toPath = findReferences(renamed, "scene", "village_path").map((r) => r.location.file);
    expect(new Set(toPath)).toEqual(new Set(["scenes/outdoors/beach.scene.yaml", "scenes/outdoors/village_path.scene.yaml", "scenes/shop.scene.yaml"]));
    const hide = renamed.scenes.find((s) => s.data.id === "village_path")!.data.characters[0]!.rules[0]!.do[1];
    expect(hide).toEqual({ type: "hide_object", scene: "village_path", object: "boulder" });
  });

  it("renames flags, counters, images and audio defined in root files", async () => {
    let p = renameId(await load(), "flag", "talked_to_villager", "villager_helped");
    p = renameId(p, "flag", "shop_visits", "visits");
    p = renameId(p, "image", "coin_icon", "coin_img");
    p = renameId(p, "audio", "beach_theme", "waves");
    expect(p.flags?.data.flags.map((f) => f.id)).toEqual(["villager_helped", "visits"]);
    expect(findReferences(p, "flag", "villager_helped")).toHaveLength(2);
    expect(findReferences(p, "counter", "visits")).toHaveLength(1);
    expect(p.items.find((i) => i.data.id === "coin")?.data.icon).toBe("coin_img");
    expect(p.scenes[0]?.data.music).toBe("waves");
    expect(planSave(p).deletes).toEqual([]);
  });

  it("rejects invalid, unknown or taken IDs", async () => {
    const project = await load();
    expect(() => renameId(project, "item", "coin", "Gold Coin")).toThrow(RenameError);
    expect(() => renameId(project, "item", "nope", "x")).toThrow(RenameError);
    expect(() => renameId(project, "item", "coin", "lantern")).toThrow(/already exists/);
    expect(() => renameId(project, "flag", "shop_visits", "talked_to_villager")).toThrow(/already exists/);
    expect(renameId(project, "item", "coin", "coin")).toBe(project);
  });
});

describe("renameSceneId (M4 Inspector)", () => {
  it("renames an object and every { scene, object } reference to it", async () => {
    const project = await load();
    const before = collectReferences(project).filter((r) => r.kind === "object" && r.id === "boulder").length;
    expect(before).toBeGreaterThan(0);
    const next = renameSceneId(project, "path", "object", "boulder", "big_rock");
    expect(collectReferences(next).filter((r) => r.kind === "object" && r.id === "boulder")).toEqual([]);
    expect(collectReferences(next).filter((r) => r.kind === "object" && r.id === "big_rock").length).toBe(before);
    expect(next.scenes.find((s) => s.data.id === "path")!.data.objects.some((o) => o.id === "big_rock")).toBe(true);
    expect(validateProject(next)).toEqual([]);
  });

  it("renames a spawn in place, keeping its key order, and updates change_scene references", async () => {
    const project = await load();
    const keys = Object.keys(project.scenes.find((s) => s.data.id === "path")!.data.spawns);
    const next = renameSceneId(project, "path", "spawn", "from_beach", "shore");
    expect(Object.keys(next.scenes.find((s) => s.data.id === "path")!.data.spawns)).toEqual(keys.map((k) => (k === "from_beach" ? "shore" : k)));
    expect(validateProject(next)).toEqual([]);
  });

  it("refuses duplicates and invalid IDs", async () => {
    const project = await load();
    expect(() => renameSceneId(project, "path", "object", "boulder", "Big Rock")).toThrow(RenameError);
    const path = project.scenes.find((s) => s.data.id === "path")!.data;
    const other = Object.keys(path.spawns).find((k) => k !== "from_beach")!;
    expect(() => renameSceneId(project, "path", "spawn", "from_beach", other)).toThrow(/already has/);
  });
});
