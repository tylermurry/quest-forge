import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, moveAsset, planSave, saveProject, sectionOfFolder, validateProject, withFolder, type ProjectFs } from "../src/index.ts";
import { fixtureCopy } from "./helpers.ts";

async function adapters(): Promise<[string, ProjectFs][]> {
  const { fs } = await fixtureCopy();
  return [
    ["NodeFs", fs],
    ["MemoryFs", new MemoryFs({ "game.yaml": "x", "scenes/a/b.scene.yaml": "y" })],
  ];
}

describe("ProjectFs folder and binary operations", () => {
  it("lists folders, moves files, and removes only empty folders", async () => {
    for (const [name, fs] of await adapters()) {
      await fs.makeFolder("scenes/x/y");
      expect(await fs.listFolders(), name).toEqual(expect.arrayContaining(["scenes", "scenes/x", "scenes/x/y"]));
      await fs.writeText("scenes/x/y/.keep", "");
      expect((await fs.list()).some((f) => f.endsWith(".keep")), name).toBe(false);

      await fs.writeBytes("assets/images/new.png", new Uint8Array([1, 2, 3]));
      await fs.move("assets/images/new.png", "assets/images/deep/new.png");
      expect(await fs.list(), name).toContain("assets/images/deep/new.png");
      expect(await fs.list(), name).not.toContain("assets/images/new.png");

      await fs.removeFolder("scenes/x"); // still holds y
      expect(await fs.listFolders(), name).toContain("scenes/x");
      await fs.removeFolder("scenes/x/y"); // only a .keep
      await fs.removeFolder("scenes/x");
      expect(await fs.listFolders(), name).not.toContain("scenes/x");

      await fs.move("assets/images/deep/new.png", ".editor/trash/assets/images/deep/new.png");
      await fs.removeTree(".editor/trash");
      await fs.removeTree(".editor/trash"); // no-op when missing
    }
  });
});

describe("browser folders on disk (D83)", () => {
  it("knows which section a folder belongs to", () => {
    expect(sectionOfFolder("scenes/a")).toBe("scene");
    expect(sectionOfFolder("assets/images/ui")).toBe("image");
    expect(sectionOfFolder("assets/images")).toBe(null);
    expect(sectionOfFolder("scenes")).toBe(null);
    expect(sectionOfFolder("assets/other/x")).toBe(null);
  });

  it("loads the folders inside sections only", async () => {
    const { fs } = await fixtureCopy();
    const { project } = await loadProject(fs);
    expect(project.folders).toEqual(["assets/images/items", "characters/npcs", "items/light", "scenes/outdoors"]);
  });

  it("keeps empty nested folders across a reload", async () => {
    const { dir, fs } = await fixtureCopy();
    let { project } = await loadProject(fs);
    project = withFolder(project, "scenes/act1/caves/deep");
    expect(planSave(project).makeFolders).toEqual(["scenes/act1", "scenes/act1/caves", "scenes/act1/caves/deep"]);
    ({ project } = await saveProject(fs, project));
    expect(await readdir(join(dir, "scenes/act1/caves/deep"))).toEqual([".keep"]);
    const reloaded = (await loadProject(fs)).project;
    expect(reloaded.folders).toContain("scenes/act1/caves/deep");
    expect(planSave(reloaded).makeFolders).toEqual([]);
    expect(planSave(reloaded).keeps).toEqual([]);
  });

  it("gives a folder a .keep when its last file moves out", async () => {
    const { dir, fs } = await fixtureCopy();
    let { project } = await loadProject(fs);
    project = moveAsset(project, "scene", "beach", "");
    project = moveAsset(project, "scene", "path", "");
    expect(planSave(project).keeps).toEqual(["scenes/outdoors"]);
    await saveProject(fs, project);
    expect(await readdir(join(dir, "scenes/outdoors"))).toEqual([".keep"]);
    expect((await loadProject(fs)).project.folders).toContain("scenes/outdoors");
  });

  it("moving into a new folder adds it and its parents", async () => {
    const { fs } = await fixtureCopy();
    const { project } = await loadProject(fs);
    const moved = moveAsset(project, "item", "coin", "money/gold");
    expect(moved.folders).toEqual(expect.arrayContaining(["items/money", "items/money/gold"]));
  });

  it("removes folders dropped from the project, deepest first", async () => {
    const { dir, fs } = await fixtureCopy();
    let { project } = await loadProject(fs);
    ({ project } = await saveProject(fs, withFolder(project, "items/a/b")));
    project = { ...project, folders: project.folders.filter((f) => !f.startsWith("items/a")) };
    expect(planSave(project).removeFolders).toEqual(["items/a/b", "items/a"]);
    await saveProject(fs, project);
    expect(await readdir(join(dir, "items"))).not.toContain("a");
  });

  it("refuses folder names that would escape or hide", () => {
    const p = { folders: [] } as never;
    expect(() => withFolder(p, "scenes/../x")).toThrow();
    expect(() => withFolder(p, "scenes/.hidden")).toThrow();
  });
});

describe("flag folders (D83)", () => {
  const flagsYaml = [
    "schemaVersion: 2",
    "folders:",
    "  - puzzles",
    "  - puzzles/cave",
    "  - empty",
    "flags:",
    "  - id: door_open",
    "    type: bool",
    "    initial: false",
    "    folder: puzzles/cave",
    "  - id: visits",
    "    type: counter",
    "    initial: 0",
    "",
  ].join("\n");

  it("round-trips flags in folders, including empty folders", async () => {
    const fs = new MemoryFs({ "flags.yaml": flagsYaml });
    const { project } = await loadProject(fs);
    expect(project.flags?.data.folders).toEqual(["puzzles", "puzzles/cave", "empty"]);
    expect(project.flags?.data.flags[0]?.folder).toBe("puzzles/cave");
    expect(planSave(project).writes).toEqual([]);
  });

  it("warns (without blocking) about a flag in an unlisted folder", async () => {
    const fs = new MemoryFs({ "flags.yaml": flagsYaml.replace("  - puzzles\n", "").replace("folder: puzzles/cave", "folder: nowhere") });
    const { project } = await loadProject(fs);
    const problems = validateProject(project).filter((p) => p.code === "missing_folder");
    expect(problems.map((p) => [p.severity, p.message, p.location.path])).toEqual([
      ["warning", "lists folder puzzles/cave without its parent folder puzzles.", ["folders", 0]],
      ["warning", "is in folder nowhere, which isn't in the folder list.", ["flags", 0, "folder"]],
    ]);
    expect(problems[1]?.breadcrumb).toBe('Flags › Flag "door_open"');
  });

  it("rejects folder paths that escape or hide", async () => {
    for (const bad of ["../x", ".git", "a//b", "a/"]) {
      const { problems } = await loadProject(new MemoryFs({ "flags.yaml": `schemaVersion: 2\nfolders:\n  - "${bad}"\nflags: []\n` }));
      expect(problems.some((p) => p.code === "invalid_data"), bad).toBe(true);
    }
  });
});
