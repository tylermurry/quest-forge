import { describe, expect, it } from "vitest";
import { withFolder } from "@questforge/schema";
import { SECTIONS, buildSection, countEntries, filterTree, sectionFolders, type FolderNode } from "../src/model/browser.ts";
import { m1Project } from "./support/fixtures.ts";

/** Compact outline: folders as "name/" with children, entries by name. */
const outline = (n: FolderNode): unknown[] => [...n.folders.map((f) => ({ [`${f.name}/`]: outline(f) })), ...n.entries.map((e) => e.name)];

describe("project browser model", () => {
  it("has the seven sections of spec 08 in order", () => {
    expect(SECTIONS.map((s) => s.title)).toEqual(["Scenes", "Items", "Characters", "Dialogues", "Flags", "Audio", "Images"]);
  });

  it("builds the m1 fixture's trees, sorted by display name", async () => {
    const p = await m1Project();
    expect(outline(buildSection(p, "scene"))).toEqual(["Garden", "Garden shed", "Stress test"]);
    const images = outline(buildSection(p, "image"));
    expect(images.slice(0, 2)).toEqual([{ "characters/": ["gardener_sheet", "hero_sheet"] }, { "items/": ["fish_icon", "rod_icon", "stick_icon", "string_icon"] }]);
    expect(buildSection(p, "flag").entries.every((e) => e.detail)).toBe(true);
  });

  it("shows empty folders and nests them", async () => {
    const p = withFolder(withFolder(await m1Project(), "scenes/act1/caves"), "scenes/act2");
    expect(sectionFolders(p, "scene")).toEqual(["act1", "act1/caves", "act2"]);
    const tree = buildSection(p, "scene");
    expect(tree.folders.map((f) => f.name)).toEqual(["act1", "act2"]);
    expect(tree.folders[0]?.folders[0]?.path).toBe("act1/caves");
  });

  it("sorts folders and names naturally", async () => {
    const p = ["scenes/room10", "scenes/room2", "scenes/Room1"].reduce(withFolder, await m1Project());
    expect(buildSection(p, "scene").folders.map((f) => f.name)).toEqual(["Room1", "room2", "room10"]);
  });

  it("search filters by name or ID and keeps the path to matches", async () => {
    const p = await m1Project();
    const images = buildSection(p, "image");
    const hit = filterTree(images, "HERO")!;
    expect(outline(hit)).toEqual([{ "characters/": ["hero_sheet"] }]);
    expect(countEntries(filterTree(buildSection(p, "item"), "rod")!)).toBe(1);
    expect(filterTree(buildSection(p, "item"), "zzz")).toBeNull();
    expect(filterTree(images, "  ")).toBe(images);
  });
});
