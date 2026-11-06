import { describe, expect, it } from "vitest";
import { loadProject, saveProject, type Project, type SceneFile } from "@questforge/schema";
import { deleteSceneThing, renameEntry } from "../src/model/commands.ts";
import { History, MERGE_WINDOW_MS, withDiskState } from "../src/model/history.ts";
import { m1Copy, m1Project } from "./support/fixtures.ts";

const garden = (p: Project) => p.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;
const itemName = (p: Project, id: string) => p.items.find((i) => i.data.id === id)!.data.name;

function clock() {
  let t = 0;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("undo/redo history (D84)", () => {
  it("undo restores a deleted hotspot including its rules (spec 08 acceptance)", async () => {
    const h = new History();
    const before = await m1Project();
    const index = garden(before).hotspots.findIndex((x) => x.rules.length > 0);
    const hotspot = garden(before).hotspots[index]!;
    expect(hotspot.rules.length).toBeGreaterThan(0);

    h.record(before, "Delete hotspot");
    const after = deleteSceneThing(before, "garden", "hotspots", index);
    expect(garden(after).hotspots).not.toContainEqual(hotspot);

    const undone = h.undo(after)!;
    expect(garden(undone).hotspots[index]).toEqual(hotspot);
    expect(h.redoLabel).toBe("Delete hotspot");
    const redone = h.redo(undone)!;
    expect(garden(redone).hotspots).not.toContainEqual(hotspot);
  });

  it("undo after a save keeps the new disk state, so the next save rewrites the file", async () => {
    const { fs } = await m1Copy();
    const h = new History();
    let { project } = await loadProject(fs);
    const index = garden(project).hotspots.findIndex((x) => x.rules.length > 0);
    const hotspot = garden(project).hotspots[index]!;
    h.record(project, "Delete hotspot");
    project = deleteSceneThing(project, "garden", "hotspots", index);
    ({ project } = await saveProject(fs, project));

    project = h.undo(project)!;
    const { plan, project: saved } = await saveProject(fs, project);
    expect(plan.writes.map((w) => w.path)).toEqual(["scenes/garden.scene.yaml"]);
    const reloaded = (await loadProject(fs)).project;
    expect(garden(reloaded).hotspots[index]).toEqual(hotspot);
    expect(saved.saved).toEqual(reloaded.saved);
  });

  it("typing into one field within the merge window is one step", async () => {
    const c = clock();
    const h = new History({ now: c.now });
    let p = await m1Project();
    const original = p;
    for (const name of ["F", "Fi", "Fis", "Fish"]) {
      h.record(p, "Rename item", "item:fish:name");
      p = renameEntry(p, "item", "fish", name);
      c.tick(300);
    }
    expect(h.size).toBe(1);
    expect(itemName(h.undo(p)!, "fish")).toBe(itemName(original, "fish"));
  });

  it("a pause or a blur starts a new step", async () => {
    const c = clock();
    const h = new History({ now: c.now });
    let p = await m1Project();
    h.record(p, "Rename item", "k");
    p = renameEntry(p, "item", "fish", "A");
    c.tick(MERGE_WINDOW_MS);
    h.record(p, "Rename item", "k");
    p = renameEntry(p, "item", "fish", "AB");
    h.breakMerge();
    h.record(p, "Rename item", "k");
    p = renameEntry(p, "item", "fish", "ABC");
    expect(h.size).toBe(3);
    expect(itemName(h.undo(p)!, "fish")).toBe("AB");
  });

  it("keeps at least 200 steps, capped at the limit", async () => {
    const h = new History();
    let p = await m1Project();
    const first = p;
    for (let i = 0; i < 250; i++) {
      h.record(p, `Rename ${i}`);
      p = renameEntry(p, "item", "fish", `Fish ${i}`);
    }
    for (let i = 0; i < 250; i++) p = h.undo(p)!;
    expect(itemName(p, "fish")).toBe(itemName(first, "fish"));
    expect(h.canUndo).toBe(false);

    const small = new History({ limit: 3 });
    for (let i = 0; i < 5; i++) small.record(p, `${i}`);
    expect(small.size).toBe(3);
  });

  it("a new edit clears redo; clear forgets everything", async () => {
    const h = new History();
    let p = await m1Project();
    h.record(p, "a");
    p = renameEntry(p, "item", "fish", "x");
    p = h.undo(p)!;
    expect(h.canRedo).toBe(true);
    h.record(p, "b");
    expect(h.canRedo).toBe(false);
    h.clear();
    expect(h.canUndo).toBe(false);
  });

  it("withDiskState swaps only the disk fields", async () => {
    const a = await m1Project();
    const b = { ...renameEntry(a, "item", "fish", "zz"), files: ["x"], trash: ["y"] };
    const merged = withDiskState(a, b);
    expect(merged.items).toBe(a.items);
    expect(merged.files).toEqual(["x"]);
    expect(merged.trash).toEqual(["y"]);
  });
});
