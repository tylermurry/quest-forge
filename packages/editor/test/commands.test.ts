import { describe, expect, it } from "vitest";
import { planSave, validateProject, type SceneFile } from "@questforge/schema";
import { buildSection, sectionEntries, sectionFolders } from "../src/model/browser.ts";
import {
  CommandError,
  changeId,
  createEntry,
  createFolder,
  deleteEntry,
  deleteFolder,
  deleteSceneThing,
  describeReferences,
  duplicateEntry,
  entryReferences,
  folderReferences,
  moveEntry,
  relocateFolder,
  renameEntry,
  sceneThingReferences,
  slugify,
  summarizeReferences,
  uniqueFolderName,
  uniqueId,
} from "../src/model/commands.ts";
import { m1Project } from "./support/fixtures.ts";

const folderOfScene = (p: Awaited<ReturnType<typeof m1Project>>, id: string) => sectionEntries(p, "scene").find((e) => e.id === id)?.folder;

describe("IDs", () => {
  it("picks a free ID with a numeric suffix", () => {
    expect(uniqueId("garden_copy", ["garden"])).toBe("garden_copy");
    expect(uniqueId("garden_copy", ["garden_copy", "garden_copy_2"])).toBe("garden_copy_3");
    expect(uniqueId("a".repeat(64), ["a".repeat(64)])).toBe(`${"a".repeat(62)}_2`);
  });

  it("slugifies names and file names", () => {
    expect(slugify("Sunny Beach!")).toBe("sunny_beach");
    expect(slugify("Café Façade")).toBe("cafe_facade");
    expect(slugify("2nd floor", "img")).toBe("img_2nd_floor");
    expect(slugify("---")).toBe("id");
  });
});

describe("folders", () => {
  it("creates three nested folders and moves a scene between them", async () => {
    let p = await m1Project();
    p = createFolder(p, "scene", "", "act1").project;
    p = createFolder(p, "scene", "act1", "caves").project;
    p = createFolder(p, "scene", "act1/caves", "deep").project;
    expect(sectionFolders(p, "scene")).toEqual(["act1", "act1/caves", "act1/caves/deep"]);

    p = moveEntry(p, "scene", "garden", "act1/caves/deep");
    expect(folderOfScene(p, "garden")).toBe("act1/caves/deep");
    p = moveEntry(p, "scene", "garden", "act1");
    expect(p.scenes.find((s) => s.data.id === "garden")?.path).toBe("scenes/act1/garden.scene.yaml");
    // Only the path changed (D22): the moved file's content is identical.
    expect(planSave(p).writes).toEqual([{ path: "scenes/act1/garden.scene.yaml", content: (await m1Project()).saved["scenes/garden.scene.yaml"] }]);
    expect(validateProject(p)).toEqual([]);
  });

  it("refuses duplicate and invalid folder names", async () => {
    const p = createFolder(await m1Project(), "item", "", "tools").project;
    expect(() => createFolder(p, "item", "", "tools")).toThrow(CommandError);
    expect(() => createFolder(p, "item", "", ".git")).toThrow(/can't be a folder name/);
    expect(() => createFolder(p, "item", "", "a/b")).toThrow(CommandError);
    expect(uniqueFolderName(p, "item", "")).toBe("New folder");
    expect(uniqueFolderName(p, "item", "", "tools")).toBe("tools 2");
  });

  it("renaming or moving a folder carries its contents", async () => {
    let p = await m1Project();
    p = createFolder(p, "scene", "", "outside").project;
    p = moveEntry(p, "scene", "garden", "outside");
    p = relocateFolder(p, "scene", "outside", "world/outdoors");
    expect(folderOfScene(p, "garden")).toBe("world/outdoors");
    expect(p.folders).toEqual(expect.arrayContaining(["scenes/world", "scenes/world/outdoors"]));
    expect(p.folders).not.toContain("scenes/outside");
    expect(() => relocateFolder(p, "scene", "world", "world/outdoors/x")).toThrow(/inside itself/);
  });

  it("renaming an images folder moves the image paths", async () => {
    const p = relocateFolder(await m1Project(), "image", "items", "inventory");
    expect(p.assets?.data.images.find((i) => i.id === "rod_icon")?.path).toBe("assets/images/inventory/rod.png");
    expect(planSave(p).moves).toContainEqual({ from: "assets/images/items/rod.png", to: "assets/images/inventory/rod.png" });
    expect(buildSection(p, "image").folders.map((f) => f.name)).toEqual(["characters", "inventory"]);
  });

  it("flag folders live in flags.yaml", async () => {
    let p = await m1Project();
    const flagId = p.flags!.data.flags[0]!.id;
    p = createFolder(p, "flag", "", "puzzles").project;
    p = createFolder(p, "flag", "puzzles", "cave").project;
    p = moveEntry(p, "flag", flagId, "puzzles/cave");
    expect(p.flags?.data.folders).toEqual(["puzzles", "puzzles/cave"]);
    p = relocateFolder(p, "flag", "puzzles", "quests");
    expect(p.flags?.data.flags[0]?.folder).toBe("quests/cave");
    p = moveEntry(p, "flag", flagId, "");
    expect(p.flags?.data.flags[0]).not.toHaveProperty("folder");
    p = deleteFolder(p, "flag", "quests");
    expect(p.flags?.data).not.toHaveProperty("folders");
    expect(planSave(p).writes).toEqual([]); // back to the original file
  });

  it("deleting a folder deletes what's in it and warns about references", async () => {
    let p = createFolder(await m1Project(), "item", "", "tools").project;
    p = moveEntry(moveEntry(p, "item", "stick", "tools"), "item", "rod", "tools");
    expect(folderReferences(p, "item", "tools").length).toBeGreaterThan(0);
    p = deleteFolder(p, "item", "tools");
    expect(p.items.map((i) => i.data.id).sort()).toEqual(["fish", "string"]);
    expect(p.folders).not.toContain("items/tools");
  });
});

describe("entries", () => {
  it("creates new assets that start out valid", async () => {
    let p = await m1Project();
    for (const kind of ["scene", "item", "character", "dialogue", "flag"] as const) {
      const made = createEntry(p, kind, "");
      expect(made.id).toMatch(/^new_/);
      p = made.project;
    }
    expect(p.scenes.find((s) => s.data.id === "new_scene")?.data.background).toBe("garden_bg");
    expect(validateProject(p)).toEqual([]);
    expect(createEntry(p, "scene", "").id).toBe("new_scene_2");
    expect(() => createEntry(p, "image", "")).toThrow(/importing/);
  });

  it("creates into a new folder", async () => {
    const { project, id } = createEntry(await m1Project(), "item", "keys/brass");
    expect(project.items.find((i) => i.data.id === id)?.path).toBe("items/keys/brass/new_item.item.yaml");
    expect(project.folders).toEqual(expect.arrayContaining(["items/keys", "items/keys/brass"]));
  });

  it("rename changes the display name; Change ID updates references (D86)", async () => {
    let p = await m1Project();
    p = renameEntry(p, "item", "stick", "  Long stick ");
    expect(p.items.find((i) => i.data.id === "stick")?.data.name).toBe("Long stick");
    expect(() => renameEntry(p, "item", "stick", " ")).toThrow(/empty/);
    p = changeId(p, "item", "stick", "long_stick");
    expect(entryReferences(p, "item", "stick")).toEqual([]);
    expect(entryReferences(p, "item", "long_stick")).toHaveLength(3);
    expect(() => changeId(p, "item", "long_stick", "Bad ID")).toThrow(/can't be an ID/);
    expect(() => changeId(p, "item", "long_stick", "rod")).toThrow(/already exists/);
    expect(validateProject(p)).toEqual([]);
  });

  it("renaming a flag changes its ID", async () => {
    const p = await m1Project();
    const flag = p.flags!.data.flags[0]!.id;
    const next = renameEntry(p, "flag", flag, "renamed_flag");
    expect(next.flags?.data.flags[0]?.id).toBe("renamed_flag");
    expect(validateProject(next)).toEqual([]);
  });

  it("duplicates a scene, retargeting its references to itself", async () => {
    const { project: p, id } = duplicateEntry(await m1Project(), "scene", "garden");
    expect(id).toBe("garden_copy");
    const copy = p.scenes.find((s) => s.data.id === "garden_copy")!;
    expect(copy.path).toBe("scenes/garden_copy.scene.yaml");
    expect(copy.data.name).toBe("Garden (copy)");
    const text = JSON.stringify(copy.data);
    expect(text).not.toContain('"scene":"garden"');
    expect(text).toContain('"scene":"garden_copy"');
    expect(text).toContain('"scene":"shed"'); // other scenes untouched
    expect(validateProject(p)).toEqual([]);
    expect(duplicateEntry(p, "scene", "garden").id).toBe("garden_copy_2");
  });

  it("duplicates items and flags, but not images", async () => {
    const p = await m1Project();
    expect(duplicateEntry(p, "item", "rod").project.items.find((i) => i.data.id === "rod_copy")?.data.name).toBe("fishing rod (copy)");
    const flag = p.flags!.data.flags[0]!.id;
    expect(duplicateEntry(p, "flag", flag).project.flags?.data.flags[1]?.id).toBe(`${flag}_copy`);
    expect(() => duplicateEntry(p, "image", "rod_icon")).toThrow(CommandError);
  });

  it("moves an image between folders without clashing file names", async () => {
    let p = await m1Project();
    p = moveEntry(p, "image", "rod_icon", "");
    expect(p.assets?.data.images.find((i) => i.id === "rod_icon")?.path).toBe("assets/images/rod.png");
    expect(() => moveEntry(p, "image", "string_icon", "")).toThrow(/already in that folder/); // string.png exists at the root
  });
});

describe("delete with references (spec 08, D86)", () => {
  it("summarizes and lists the references", async () => {
    const p = await m1Project();
    const refs = entryReferences(p, "item", "stick");
    expect(summarizeReferences(refs)).toBe("Used by 2 rules in 1 scene and the game settings");
    expect(describeReferences(p, refs)).toHaveLength(3);
    expect(summarizeReferences(entryReferences(p, "image", "garden_bg"))).toBe("Used by 2 settings in 2 scenes");
    expect(summarizeReferences([])).toBeNull();
  });

  it("a confirmed delete leaves the references dangling as problems", async () => {
    const p = await m1Project();
    const refs = entryReferences(p, "item", "stick");
    const next = deleteEntry(p, "item", "stick");
    const problems = validateProject(next).filter((x) => x.code === "missing_reference");
    expect(problems.map((x) => x.location)).toEqual(refs.map((r) => r.location));
    expect(planSave(next).deletes).toEqual(["items/stick.item.yaml"]);
  });

  it("deleting an image drops its pending import", async () => {
    const p = await m1Project();
    const withPending = { ...p, pendingFiles: { "assets/images/rod.png": new Uint8Array([1]) } };
    expect(deleteEntry(withPending, "image", "string_img").pendingFiles).toHaveProperty(["assets/images/rod.png"]);
  });
});

describe("inside a scene (D89)", () => {
  it("deletes a hotspot with its rules", async () => {
    const p = await m1Project();
    const garden = p.scenes.find((s) => s.data.id === "garden")!.data;
    const i = garden.hotspots.findIndex((h) => h.rules.length > 0);
    const next = deleteSceneThing(p, "garden", "hotspots", i);
    const after = next.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;
    expect(after.hotspots).toHaveLength(garden.hotspots.length - 1);
    expect(after.hotspots.map((h) => h.id)).not.toContain(garden.hotspots[i]!.id);
    expect(() => deleteSceneThing(next, "garden", "hotspots", 99)).toThrow(CommandError);
  });

  it("finds references to a scene's object", async () => {
    const p = await m1Project();
    expect(sceneThingReferences(p, "garden", "object", "boulder").length).toBeGreaterThan(0);
  });
});
