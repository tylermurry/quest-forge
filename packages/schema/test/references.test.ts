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
    expect(findReferences(p, "counter", "visits")).toHaveLength(3);
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

describe("references inside dialogue nodes (M7)", () => {
  /** The fixture's dialogue, plus a branch on a flag and a counter and an animated line. */
  const withGraph = async () => {
    const p = structuredClone(await load());
    const nodes = p.dialogues[0]!.data.nodes;
    const hello = nodes.find((n) => n.id === "hello")!;
    if (hello.type === "line") hello.animation = "idle_down";
    nodes.push({
      id: "check",
      type: "branch",
      pos: [0, 600],
      if: [
        { type: "flag_is", flag: "talked_to_villager", value: true },
        { type: "counter", counter: "shop_visits", op: "gt", value: 1 },
      ],
      then: "done",
      else: "done",
    });
    const thanks = nodes.find((n) => n.id === "thanks")!;
    if (thanks.type === "line") thanks.next = "check";
    return p;
  };
  const dialogue = (p: Awaited<ReturnType<typeof withGraph>>) => p.dialogues[0]!.data;

  it("indexes the speaker, the speaker's animation slot, options, actions and branches", async () => {
    const refs = collectReferences(await withGraph()).filter((r) => r.fileKind === "dialogue" && r.kind !== "node");
    expect(refs.map((r) => [r.kind, r.id, r.location.path.join("."), r.scope ?? ""])).toEqual([
      ["character", "shopkeeper", "nodes.1.character", ""],
      ["slot", "idle_down", "nodes.1.animation", "shopkeeper"],
      ["item", "coin", "nodes.2.options.1.if.0.item", ""],
      ["character", "shopkeeper", "nodes.3.character", ""],
      ["item", "coin", "nodes.4.do.0.item", ""],
      ["item", "lantern", "nodes.4.do.1.item", ""],
      ["flag", "talked_to_villager", "nodes.7.if.0.flag", ""],
      ["counter", "shop_visits", "nodes.7.if.1.counter", ""],
    ]);
  });

  it("renaming a character, item, flag or dialogue updates the nodes", async () => {
    let p = await withGraph();
    p = renameId(p, "character", "shopkeeper", "merchant");
    p = renameId(p, "item", "coin", "gold");
    p = renameId(p, "flag", "talked_to_villager", "met");
    p = renameId(p, "flag", "shop_visits", "visits");
    const before = findReferences(p, "dialogue", "shopkeeper_chat").length;
    p = renameId(p, "dialogue", "shopkeeper_chat", "merchant_chat");
    const d = dialogue(p);
    expect(d.id).toBe("merchant_chat");
    expect(p.dialogues[0]!.path).toBe("dialogues/merchant_chat.dialogue.yaml");
    const at = (id: string) => d.nodes.find((n) => n.id === id)!;
    expect(at("hello")).toMatchObject({ character: "merchant", animation: "idle_down" });
    expect(at("menu")).toMatchObject({ options: [{}, { if: [{ item: "gold" }] }, {}] });
    expect(at("sell")).toMatchObject({ do: [{ item: "gold" }, { item: "lantern" }] });
    expect(at("check")).toMatchObject({ if: [{ flag: "met" }, { counter: "visits" }] });
    // start_dialogue / dialogue_end elsewhere follow the dialogue's new ID.
    expect(findReferences(p, "dialogue", "merchant_chat")).toHaveLength(before);
    expect(findReferences(p, "dialogue", "shopkeeper_chat")).toEqual([]);
    expect(validateProject(p).filter((x) => x.severity === "error")).toEqual([]);
  });

  it("deleting what a node uses leaves an error at that node (spec 14)", async () => {
    const p = await withGraph();
    p.characters = p.characters.filter((c) => c.data.id !== "shopkeeper");
    p.flags!.data.flags = p.flags!.data.flags.filter((f) => f.id !== "talked_to_villager");
    p.items = p.items.filter((i) => i.data.id !== "lantern");
    const errors = validateProject(p).filter((x) => x.code === "missing_reference" && x.location.file.startsWith("dialogues/"));
    expect(errors.map((e) => e.location.path.join("."))).toEqual(["nodes.1.character", "nodes.3.character", "nodes.4.do.1.item", "nodes.7.if.0.flag"]);
  });

  it("a slot the speaker doesn't have is a missing reference", async () => {
    const p = await withGraph();
    const hello = dialogue(p).nodes.find((n) => n.id === "hello")!;
    if (hello.type === "line") hello.animation = "wave";
    const errors = validateProject(p).filter((x) => x.code === "missing_reference");
    expect(errors.map((e) => [e.location.path.join("."), e.message])).toEqual([["nodes.1.animation", expect.stringMatching(/^plays animation wave on .*, who has no animation in that slot/)]]);
  });
});
