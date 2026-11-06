// Spec 08 acceptance, end to end on real folders: "restart" means closing the
// Editor and opening the folder again from disk.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateProject, type SceneFile } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { Actions } from "../src/model/actions.ts";
import { sectionEntries, sectionFolders } from "../src/model/browser.ts";
import { Editor } from "../src/model/editor.ts";
import { createBlankProject } from "../src/model/template.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { m1Copy } from "./support/fixtures.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function open(dir: string) {
  const editor = await Editor.open({ fs: new NodeFs(dir) });
  return new Actions(editor, new WorkspaceState());
}

async function restart(a: Actions, dir: string) {
  await a.editor.flush();
  a.editor.dispose();
  return open(dir);
}

const sceneFolders = (a: Actions) => Object.fromEntries(sectionEntries(a.editor.project, "scene").map((e) => [e.id, e.folder]));

describe("spec 08 acceptance", () => {
  it("create a project, make 3 nested folders, move scenes between them, restart: the structure persists", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "questforge-accept-")), "My Game");
    dirs.push(dir);
    await createBlankProject(new NodeFs(dir), "My Game");
    let a = await open(dir);

    const act1 = a.newFolder("scene", "")!;
    a.renameFolder("scene", act1, "act1");
    a.newFolder("scene", "act1");
    a.renameFolder("scene", "act1/New folder", "caves");
    a.newFolder("scene", "act1/caves");
    a.renameFolder("scene", "act1/caves/New folder", "deep");
    a.newFolder("scene", ""); // an empty folder must persist too
    const second = a.duplicate("scene", "first_scene")!;
    const third = a.newEntry("scene", "")!;
    a.drop({ section: "scene", kind: "entry", id: "first_scene" }, "scene", "act1");
    a.drop({ section: "scene", kind: "entry", id: second }, "scene", "act1/caves/deep");
    a.drop({ section: "scene", kind: "entry", id: third }, "scene", "act1/caves");
    a.drop({ section: "scene", kind: "entry", id: third }, "scene", "act1/caves/deep");
    a.drop({ section: "scene", kind: "entry", id: second }, "scene", "act1/caves");
    const before = { folders: sectionFolders(a.editor.project, "scene"), scenes: sceneFolders(a) };
    expect(before.folders).toEqual(["New folder", "act1", "act1/caves", "act1/caves/deep"]);

    a = await restart(a, dir);
    expect(sectionFolders(a.editor.project, "scene")).toEqual(before.folders);
    expect(sceneFolders(a)).toEqual(before.scenes);
    expect(before.scenes).toEqual({ first_scene: "act1", [second]: "act1/caves", [third]: "act1/caves/deep" });
    expect(await readdir(join(dir, "scenes/New folder"))).toEqual([".keep"]);
    // New scenes start empty (D97): their only problem is the walkable area still to draw.
    const codes = validateProject(a.editor.project).map((x) => x.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes)).toEqual(new Set(["no_walkable_area"]));
    expect(a.editor.history.canUndo).toBe(false); // history is per session
  });

  it("undo restores a deleted hotspot including its rules, after autosave and a restart", async () => {
    const { dir } = await m1Copy();
    let a = await open(dir);
    const garden = () => a.editor.project.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;
    const index = garden().hotspots.findIndex((h) => h.rules.length > 1);
    const hotspot = garden().hotspots[index]!;

    a.deleteSceneThing("garden", "hotspots", index, "hotspot");
    await a.editor.flush(); // the delete reaches disk
    expect((await open(dir)).editor.project.scenes.find((s) => s.data.id === "garden")!.data.hotspots.map((h) => h.id)).not.toContain(hotspot.id);
    a.editor.undo();
    expect(garden().hotspots[index]).toEqual(hotspot);
    a = await restart(a, dir);
    expect(garden().hotspots[index]).toEqual(hotspot);
    expect(garden().hotspots[index]!.rules).toHaveLength(hotspot.rules.length);
  });
});
