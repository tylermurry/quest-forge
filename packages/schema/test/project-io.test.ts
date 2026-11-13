import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIGRATIONS,
  MemoryFs,
  SaveError,
  classify,
  loadProject,
  migrate,
  isEmptyPlan,
  moveAsset,
  planSave,
  saveProject,
  serialize,
  validateProject,
  type Project,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE, fixtureCopy, snapshot } from "./helpers.ts";

describe("loading the fixture project", () => {
  it("loads every project file with no problems", async () => {
    const { project, problems } = await loadProject(new NodeFs(FIXTURE));
    expect(problems).toEqual([]);
    expect(project.game?.data.title).toBe("The Lantern");
    expect(project.scenes.map((s) => s.path)).toEqual([
      "scenes/outdoors/beach.scene.yaml",
      "scenes/outdoors/path.scene.yaml",
      "scenes/shop.scene.yaml",
    ]);
    expect(project.items).toHaveLength(4);
    expect(project.characters).toHaveLength(3);
    expect(project.dialogues).toHaveLength(1);
  });

  it("ignores .editor/ (UI state, never game data)", async () => {
    const { project } = await loadProject(new NodeFs(FIXTURE));
    expect(project.files.some((f) => f.startsWith(".editor"))).toBe(false);
    expect(Object.keys(project.saved).some((f) => f.startsWith(".editor"))).toBe(false);
  });

  it("classifies files by section folder and suffix", () => {
    expect(classify("game.yaml")).toBe("game");
    expect(classify("scenes/a/b/beach.scene.yaml")).toBe("scene");
    expect(classify("items/coin.item.yaml")).toBe("item");
    expect(classify("scenes/coin.item.yaml")).toBe(null);
    expect(classify("assets/images/beach.png")).toBe(null);
    expect(classify("notes.yaml")).toBe(null);
  });
});

describe("round-trip", () => {
  it("load → save produces byte-identical files", async () => {
    const { dir, fs } = await fixtureCopy();
    const before = await snapshot(dir);
    const { project } = await loadProject(fs);
    const { plan } = await saveProject(fs, project);
    expect(plan).toSatisfy(isEmptyPlan);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("re-serializes every loaded file to exactly its original bytes", async () => {
    const { project } = await loadProject(new NodeFs(FIXTURE));
    const docs = [project.game, project.flags, project.assets, ...project.scenes, ...project.items, ...project.characters, ...project.dialogues];
    expect(docs).toHaveLength(14);
    for (const doc of docs) {
      expect(serialize(doc!.data), doc!.path).toBe(await readFile(join(FIXTURE, doc!.path), "utf8"));
    }
  });

  it("normalizes a non-canonical file once, then is stable", async () => {
    const original = await readFile(join(FIXTURE, "items/coin.item.yaml"), "utf8");
    const messy = `# hand-edited\nicon: coin_icon\nid:   coin\nschemaVersion: 3\nname: "gold coin"\ndescription: 'A shiny gold coin.'\n`;
    const fs = new MemoryFs({ "items/coin.item.yaml": messy });
    const first = await saveProject(fs, (await loadProject(fs)).project);
    expect(first.plan.writes.map((w) => w.path)).toEqual(["items/coin.item.yaml"]);
    expect(fs.files.get("items/coin.item.yaml")).toBe(original);
    const second = await saveProject(fs, (await loadProject(fs)).project);
    expect(second.plan).toSatisfy(isEmptyPlan);
  });

  it("writes only the file whose data changed", async () => {
    const { fs } = await fixtureCopy();
    const { project } = await loadProject(fs);
    const items = project.items.map((d) => (d.data.id === "coin" ? { ...d, data: { ...d.data, name: "old coin" } } : d));
    const plan = planSave({ ...project, items });
    expect(plan.writes.map((w) => w.path)).toEqual(["items/coin.item.yaml"]);
    expect(plan.deletes).toEqual([]);
  });

  it("refuses to write invalid data", async () => {
    const { project } = await loadProject(new NodeFs(FIXTURE));
    const items = project.items.map((d) => ({ ...d, data: { ...d.data, id: "Not An Id" } }));
    expect(() => planSave({ ...project, items })).toThrow(SaveError);
  });

  it("emits keys in schema order even when built in another order", async () => {
    const fs = new MemoryFs();
    const project: Project = {
      ...(await loadProject(fs)).project,
      items: [{ path: "items/coin.item.yaml", data: { icon: "coin_icon", description: "A shiny gold coin.", name: "gold coin", id: "coin", schemaVersion: 3 } }],
    };
    await saveProject(fs, project);
    expect(fs.files.get("items/coin.item.yaml")).toBe(await readFile(join(FIXTURE, "items/coin.item.yaml"), "utf8"));
  });
});

describe("moving between folders", () => {
  it("moving a scene to another folder changes only that file's path", async () => {
    const { dir, fs } = await fixtureCopy();
    const before = await snapshot(dir);
    const { project } = await loadProject(fs);
    const moved = moveAsset(project, "scene", "beach", "coast/sunny");
    const { plan } = await saveProject(fs, moved);
    expect(plan.writes.map((w) => w.path)).toEqual(["scenes/coast/sunny/beach.scene.yaml"]);
    expect(plan.deletes).toEqual(["scenes/outdoors/beach.scene.yaml"]);

    const after = await snapshot(dir);
    const { "scenes/outdoors/beach.scene.yaml": oldBytes, ...restBefore } = before;
    const { "scenes/coast/sunny/beach.scene.yaml": newBytes, ...restAfter } = after;
    expect(newBytes).toBe(oldBytes);
    expect(restAfter).toEqual(restBefore);

    // And it reloads cleanly with the same data.
    const reloaded = await loadProject(fs);
    expect(reloaded.problems).toEqual([]);
    expect(reloaded.project.scenes.find((s) => s.data.id === "beach")?.data).toEqual(project.scenes[0]?.data);
  });

  it("moves to the section root and rejects bad folders or collisions", async () => {
    const { project } = await loadProject(new NodeFs(FIXTURE));
    expect(moveAsset(project, "scene", "beach", "").scenes[0]?.path).toBe("scenes/beach.scene.yaml");
    expect(() => moveAsset(project, "scene", "beach", "../outside")).toThrow();
    expect(() => moveAsset(project, "scene", "nope", "x")).toThrow();
    const beach = project.scenes[0]!;
    const clash = { ...project, scenes: [...project.scenes, { path: "scenes/beach.scene.yaml", data: beach.data }] };
    expect(() => moveAsset(clash, "scene", "beach", "")).toThrow(/already exists/);
  });
});

describe("load problems", () => {
  const base = async () => {
    const files: Record<string, string> = {};
    for (const f of ["game.yaml", "flags.yaml", "assets.yaml"]) files[f] = await readFile(join(FIXTURE, f), "utf8");
    return files;
  };

  it("reports YAML syntax errors with a line number and keeps the file out of the save", async () => {
    const fs = new MemoryFs({ ...(await base()), "items/coin.item.yaml": "schemaVersion: 3\nid: [coin\n" });
    const { project, problems } = await loadProject(fs);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: "yaml_syntax", location: { file: "items/coin.item.yaml" } });
    expect(problems[0]?.message).toMatch(/line \d/);
    expect(project.items).toEqual([]);
    expect(planSave(project).deletes).toEqual([]); // never deletes a file it couldn't read
  });

  it("reports unknown keys and missing fields in plain English", async () => {
    const fs = new MemoryFs({
      ...(await base()),
      "items/coin.item.yaml": "schemaVersion: 3\nid: coin\nname: gold coin\ndescription: Shiny.\nicon: coin_icon\ncolor: gold\n",
      "items/key.item.yaml": "schemaVersion: 3\nid: key\nname: key\nicon: key_icon\n",
    });
    const { problems } = await loadProject(fs);
    expect(problems.map((p) => [p.location.file, p.code, p.breadcrumb, p.message])).toEqual([
      ["items/coin.item.yaml", "invalid_data", 'Item "gold coin"', 'has unknown setting "color".'],
      ["items/key.item.yaml", "invalid_data", 'Item "key"', 'is missing "description".'],
    ]);
  });

  it("names the spot inside a scene", async () => {
    const scene = (await readFile(join(FIXTURE, "scenes/outdoors/beach.scene.yaml"), "utf8")).replace("type: hand", "type: wave");
    const { problems } = await loadProject(new MemoryFs({ ...(await base()), "scenes/beach.scene.yaml": scene }));
    expect(problems[0]?.breadcrumb).toBe('Sunny Beach › Hotspot "shell" › Rule 1');
    expect(problems[0]?.location.path).toEqual(["hotspots", 0, "rules", 0, "when", "type"]);
  });

  it("reports missing root files", async () => {
    const { problems } = await loadProject(new MemoryFs({}));
    expect(problems.map((p) => [p.code, p.location.file])).toEqual([
      ["missing_file", "game.yaml"],
      ["missing_file", "flags.yaml"],
      ["missing_file", "assets.yaml"],
    ]);
  });

  it("opens a v1 project: rules get IDs, and the next save writes the current version", async () => {
    const files = await base();
    const v1 = files["game.yaml"]!.replace("schemaVersion: 3", "schemaVersion: 1").replace(/^  - id: rule_\d+\n    when:/gm, "  - when:");
    expect(v1).not.toContain("id: rule_");
    const fs = new MemoryFs({ ...files, "game.yaml": v1 });
    const { project, problems } = await loadProject(fs);
    expect(problems).toEqual([]);
    expect(project.game!.data.schemaVersion).toBe(3);
    expect(project.game!.data.rules.map((r) => r.id)).toEqual(["rule_1"]);
    expect(planSave(project).writes.map((w) => [w.path, w.content])).toEqual([["game.yaml", files["game.yaml"]]]);
  });

  it("opens a v2 dialogue: its Choices node asks nothing yet, which is an error, and the next save writes the question", async () => {
    const { fs } = await fixtureCopy();
    const path = "dialogues/shopkeeper_chat.dialogue.yaml";
    const chat = await fs.readText(path);
    const v2 = chat.replace("schemaVersion: 3", "schemaVersion: 2").replace(/^    character: shopkeeper\n    text: .*\n(?=    options:)/m, "");
    expect(v2).not.toContain("What can I get you?");
    await fs.writeText(path, v2);
    const { project, problems } = await loadProject(fs);
    expect(problems).toEqual([]);
    expect(validateProject(project).map((p) => [p.code, p.severity, p.location.path])).toEqual([["empty_text", "error", ["nodes", 2, "text"]]]);
    const [write] = planSave(project).writes;
    expect(planSave(project).writes.map((w) => w.path)).toEqual([path]);
    expect(write!.content).toContain("schemaVersion: 3\n");
    expect(write!.content).toContain('    text: ""\n    options:');
  });

  it("refuses files from a newer schemaVersion", async () => {
    const fs = new MemoryFs({ ...(await base()), "items/coin.item.yaml": "schemaVersion: 4\nid: coin\n" });
    const { problems } = await loadProject(fs);
    expect(problems[0]?.code).toBe("unsupported_version");
  });
});

describe("migrations", () => {
  it("is a no-op for current files", () => {
    expect(migrate({ schemaVersion: 3, id: "x" })).toEqual({ ok: true, value: { schemaVersion: 3, id: "x" } });
  });

  it("v2 gives every rule an ID in list order and keeps existing ones", () => {
    const r = (text: string, id?: string) => ({ ...(id ? { id } : {}), when: { type: "look" }, if: [], do: [{ type: "narrate", text }], once: false });
    const v1 = {
      schemaVersion: 1,
      id: "yard",
      objects: [{ id: "rock", rules: [r("a"), r("b")] }],
      characters: [{ character: "cat", rules: [r("c", "kept")] }],
      hotspots: [{ id: "door", rules: [] }],
      regions: [{ id: "exit", rules: [r("d")] }],
      rules: [r("e"), r("f")],
    };
    const out = migrate(v1);
    expect(out).toEqual({
      ok: true,
      value: {
        schemaVersion: 3,
        id: "yard",
        objects: [{ id: "rock", rules: [r("a", "rule_1"), r("b", "rule_2")] }],
        characters: [{ character: "cat", rules: [r("c", "kept")] }],
        hotspots: [{ id: "door", rules: [] }],
        regions: [{ id: "exit", rules: [r("d", "rule_1")] }],
        rules: [r("e", "rule_1"), r("f", "rule_2")],
      },
    });
    expect(migrate({ schemaVersion: 1, id: "coin", name: "coin" })).toEqual({ ok: true, value: { schemaVersion: 3, id: "coin", name: "coin" } });
    expect(Object.keys(MIGRATIONS)).toEqual(["1", "2"]);
  });

  it("v3 gives every Choices node an empty question and no character, and only changes the version of other files", () => {
    const options = [{ id: "a", text: "Yes", if: [], once: false, next: null }];
    const v2 = {
      schemaVersion: 2,
      id: "chat",
      name: "Chat",
      nodes: [
        { id: "start", type: "start", pos: [0, 0], next: "hello" },
        { id: "hello", type: "line", pos: [0, 0], character: "cat", text: "Hi.", next: "menu" },
        { id: "menu", type: "choices", pos: [0, 0], options },
        { id: "again", type: "choices", pos: [0, 0], options: [] },
      ],
    };
    expect(migrate(v2)).toEqual({
      ok: true,
      value: {
        schemaVersion: 3,
        id: "chat",
        name: "Chat",
        nodes: [
          { id: "start", type: "start", pos: [0, 0], next: "hello" },
          { id: "hello", type: "line", pos: [0, 0], character: "cat", text: "Hi.", next: "menu" },
          { id: "menu", type: "choices", pos: [0, 0], text: "", options },
          { id: "again", type: "choices", pos: [0, 0], text: "", options: [] },
        ],
      },
    });
    expect(migrate({ schemaVersion: 2, id: "coin", name: "coin" })).toEqual({ ok: true, value: { schemaVersion: 3, id: "coin", name: "coin" } });
  });

  it("chains steps from old versions up to current", () => {
    const steps = {
      1: (raw: Record<string, unknown>) => ({ ...raw, title: raw.name }),
      2: (raw: Record<string, unknown>) => {
        const { name: _n, ...rest } = raw;
        return rest;
      },
    };
    expect(migrate({ schemaVersion: 1, name: "Beach" }, steps, 3)).toEqual({ ok: true, value: { schemaVersion: 3, title: "Beach" } });
    expect(migrate({ schemaVersion: 4 }, steps, 3)).toEqual({ ok: false, reason: "newer" });
  });
});
