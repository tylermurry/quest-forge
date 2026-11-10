import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, loadProject, type Project, type SceneFile } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { deleteSceneThing, renameEntry } from "../src/model/commands.ts";
import { AUTOSAVE_DELAY_MS, Editor, VALIDATE_DELAY_MS, WATCH_SETTLE_MS, describeSaveError, type ProjectHost } from "../src/model/editor.ts";
import { M1 } from "./support/fixtures.ts";

/** The m1 fixture in memory, plus a hand-driven watcher. */
async function memoryHost() {
  const disk = new NodeFs(M1);
  const fs = new MemoryFs();
  for (const f of await disk.list()) {
    if (f.endsWith(".yaml")) fs.files.set(f, await disk.readText(f));
    else fs.bytes.set(f, new Uint8Array([0]));
  }
  let notify: ((paths: string[]) => void) | null = null;
  const host: ProjectHost = {
    fs,
    watch(cb) {
      notify = cb;
      return () => (notify = null);
    },
  };
  return { fs, host, emit: (paths: string[]) => notify?.(paths) };
}

const itemName = (p: Project, id: string) => p.items.find((i) => i.data.id === id)!.data.name;
const garden = (p: Project) => p.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("manual save", () => {
  it("keeps changes in memory until flush, then saves", async () => {
    const { fs, host } = await memoryHost();
    const ed = await Editor.open(host, { autosave: false });
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5);
    expect(ed.status.state).toBe("unsaved");
    expect(ed.hasUnsavedChanges).toBe(true);
    expect(fs.files.get("items/fish.item.yaml")).not.toContain("Trout");
    await ed.flush();
    expect(fs.files.get("items/fish.item.yaml")).toContain("name: Trout");
    expect(ed.status.state).toBe("saved");
  });

  it("a failed save keeps the edits and does not retry by itself", async () => {
    const { fs, host } = await memoryHost();
    const ed = await Editor.open(host, { autosave: false });
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    const write = vi.spyOn(fs, "writeText").mockRejectedValue(Object.assign(new Error("no"), { code: "EACCES" }));
    await ed.flush();
    expect(ed.status).toMatchObject({ state: "error" });
    const calls = write.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(write.mock.calls.length).toBe(calls);
    expect(ed.hasUnsavedChanges).toBe(true);
  });

  it("an outside change keeps unsaved edits and says so once", async () => {
    const { fs, host, emit } = await memoryHost();
    const ed = await Editor.open(host, { autosave: false });
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    fs.files.set("items/fish.item.yaml", fs.files.get("items/fish.item.yaml")! + "\n# edited elsewhere\n");
    emit(["items/fish.item.yaml"]);
    await vi.advanceTimersByTimeAsync(WATCH_SETTLE_MS * 2);
    expect(itemName(ed.project, "fish")).toBe("Trout");
    expect(ed.notice?.text).toContain("unsaved changes were kept");
  });
});

describe("autosave", () => {
  it("saves about 1 s after the last change and reports Saved", async () => {
    const { fs, host } = await memoryHost();
    const ed = await Editor.open(host);
    expect(ed.status.state).toBe("saved");
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    expect(ed.status.state).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Big trout"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    expect(fs.files.get("items/fish.item.yaml")).not.toContain("trout"); // debounced
    await vi.advanceTimersByTimeAsync(200);
    expect(fs.files.get("items/fish.item.yaml")).toContain("name: Big trout");
    expect(ed.status.state).toBe("saved");
    expect(ed.hasUnsavedChanges).toBe(false);
  });

  it("notifies subscribers and bumps the version", async () => {
    const { host } = await memoryHost();
    const ed = await Editor.open(host);
    const seen = vi.fn();
    ed.subscribe(seen);
    const v = ed.version;
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    expect(ed.version).toBeGreaterThan(v);
    expect(seen).toHaveBeenCalled();
  });

  it("a command error becomes a notice and changes nothing", async () => {
    const { host } = await memoryHost();
    const ed = await Editor.open(host);
    const before = ed.project;
    expect(ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", " "))).toBe(false);
    expect(ed.project).toBe(before);
    expect(ed.notice).toEqual({ kind: "error", text: "A name can't be empty." });
    expect(ed.history.canUndo).toBe(false);
  });

  it("undo after an autosave rewrites the file", async () => {
    const { fs, host } = await memoryHost();
    const ed = await Editor.open(host);
    const original = fs.files.get("scenes/garden.scene.yaml");
    const hotspot = garden(ed.project).hotspots[0]!;
    ed.apply("Delete hotspot", (p) => deleteSceneThing(p, "garden", "hotspots", 0));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(fs.files.get("scenes/garden.scene.yaml")).not.toBe(original);
    ed.undo();
    expect(garden(ed.project).hotspots[0]).toEqual(hotspot);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(fs.files.get("scenes/garden.scene.yaml")).toBe(original);
    ed.redo();
    await ed.flush();
    expect(fs.files.get("scenes/garden.scene.yaml")).not.toBe(original);
  });

  it("keeps edits made while a save is running", async () => {
    const { fs, host } = await memoryHost();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const write = fs.writeText.bind(fs);
    fs.writeText = async (path, content) => {
      await gate;
      return write(path, content);
    };
    const ed = await Editor.open(host);
    ed.apply("a", (p) => renameEntry(p, "item", "fish", "One"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(ed.status.state).toBe("saving");
    ed.apply("b", (p) => renameEntry(p, "item", "rod", "Two"));
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(ed.status.state).toBe("unsaved");
    expect(itemName(ed.project, "rod")).toBe("Two");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(fs.files.get("items/rod.item.yaml")).toContain("name: Two");
    expect(ed.status.state).toBe("saved");
  });
});

describe("save errors", () => {
  it("keeps edits, explains, and retries after 2 s, 5 s, then 10 s", async () => {
    const { fs, host } = await memoryHost();
    const write = fs.writeText.bind(fs);
    let readOnly = true;
    fs.writeText = async (path, content) => {
      if (readOnly) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return write(path, content);
    };
    const ed = await Editor.open(host);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(ed.status).toEqual({ state: "error", message: expect.stringContaining("the project folder is read-only") });
    expect(ed.status.state === "error" && ed.status.message).toContain("trying again in 2 s");
    expect(ed.hasUnsavedChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ed.status.state === "error" && ed.status.message).toContain("in 5 s");
    await vi.advanceTimersByTimeAsync(5000);
    expect(ed.status.state === "error" && ed.status.message).toContain("in 10 s");
    await vi.advanceTimersByTimeAsync(10000);
    expect(ed.status.state === "error" && ed.status.message).toContain("in 10 s");
    readOnly = false;
    await vi.advanceTimersByTimeAsync(10000);
    expect(ed.status.state).toBe("saved");
    expect(fs.files.get("items/fish.item.yaml")).toContain("Trout");
  });

  it("names common failures in plain English", () => {
    expect(describeSaveError(Object.assign(new Error("x"), { code: "ENOSPC" }))).toBe("the disk is full");
    expect(describeSaveError(new Error("Read-only file system (os error 30)"))).toBe("the project folder is read-only");
    expect(describeSaveError(new Error("weird"))).toBe("weird");
  });
});

describe("outside changes", () => {
  it("ignores watcher events caused by its own saves", async () => {
    const { host, emit } = await memoryHost();
    const ed = await Editor.open(host);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    ed.history.breakMerge();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    emit(["items/fish.item.yaml"]);
    await vi.advanceTimersByTimeAsync(WATCH_SETTLE_MS);
    expect(ed.notice).toBeNull();
    expect(ed.history.canUndo).toBe(true);
  });

  it("ignores events that arrive mid-save until the save is done", async () => {
    const { fs, host, emit } = await memoryHost();
    const write = fs.writeText.bind(fs);
    fs.writeText = async (path, content) => {
      await write(path, content);
      emit([path]);
    };
    const ed = await Editor.open(host);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + WATCH_SETTLE_MS * 2);
    expect(ed.notice).toBeNull();
    expect(ed.status.state).toBe("saved");
  });

  it("reloads with a notice when files change outside (e.g. git checkout)", async () => {
    const { fs, host, emit } = await memoryHost();
    const ed = await Editor.open(host);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "rod", "Rod"));
    await ed.flush();
    fs.files.set("items/fish.item.yaml", fs.files.get("items/fish.item.yaml")!.replace(/name: .*/, "name: Salmon"));
    emit(["items/fish.item.yaml"]);
    await vi.advanceTimersByTimeAsync(WATCH_SETTLE_MS);
    expect(itemName(ed.project, "fish")).toBe("Salmon");
    expect(ed.notice?.text).toContain("Files changed on disk outside the editor, so the project was reloaded.");
    expect(ed.notice?.text).not.toContain("discarded");
    expect(ed.history.canUndo).toBe(false);
  });

  it("says so when an unsaved edit is dropped by the reload", async () => {
    const { fs, host, emit } = await memoryHost();
    const ed = await Editor.open(host);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "rod", "Rod"));
    fs.files.delete("items/stick.item.yaml");
    emit(["items/stick.item.yaml"]);
    await vi.advanceTimersByTimeAsync(WATCH_SETTLE_MS);
    expect(ed.project.items.map((i) => i.data.id)).not.toContain("stick");
    expect(ed.notice?.text).toContain("Your last unsaved change was discarded.");
    expect(ed.hasUnsavedChanges).toBe(false);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(fs.files.get("items/rod.item.yaml")).not.toContain("name: Rod");
  });

  it("notices a new folder made outside", async () => {
    const { fs, host, emit } = await memoryHost();
    const ed = await Editor.open(host);
    await fs.makeFolder("scenes/from_git");
    emit(["scenes/from_git"]);
    await vi.advanceTimersByTimeAsync(WATCH_SETTLE_MS);
    expect(ed.project.folders).toContain("scenes/from_git");
  });

  it("doesn't loop on a file that failed to load", async () => {
    const { fs, host, emit } = await memoryHost();
    fs.files.set("items/broken.item.yaml", "id: [");
    const ed = await Editor.open(host);
    expect(ed.loadProblems).toHaveLength(1);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    emit(["items/fish.item.yaml"]);
    await vi.advanceTimersByTimeAsync(WATCH_SETTLE_MS);
    expect(ed.notice).toBeNull();
    expect(fs.files.get("items/broken.item.yaml")).toBe("id: ["); // never overwritten
  });
});

describe("opening", () => {
  it("empties last session's trash", async () => {
    const { fs, host } = await memoryHost();
    fs.bytes.set(".editor/trash/assets/images/old.png", new Uint8Array([1]));
    await Editor.open(host);
    expect([...fs.bytes.keys()].some((k) => k.startsWith(".editor/trash"))).toBe(false);
    expect((await loadProject(fs)).problems).toEqual([]);
  });
});

describe("continuous validation", () => {
  const dropStick = (p: Project) => ({ ...p, items: p.items.filter((i) => i.data.id !== "stick") });
  const missing = (ed: Editor) => ed.problems.filter((x) => x.code === "missing_reference").length;

  it("validates on open, then 250 ms after the last change, including undo", async () => {
    const { host } = await memoryHost();
    const ed = await Editor.open(host);
    expect(missing(ed)).toBe(0);
    expect(ed.validationPending).toBe(false);
    ed.apply("Delete item", dropStick);
    expect(ed.validationPending).toBe(true);
    await vi.advanceTimersByTimeAsync(VALIDATE_DELAY_MS - 50);
    ed.apply("Rename item", (p) => renameEntry(p, "item", "fish", "Trout"));
    await vi.advanceTimersByTimeAsync(VALIDATE_DELAY_MS - 50);
    expect(missing(ed)).toBe(0); // still typing: not yet
    const seen = vi.fn();
    ed.subscribe(seen);
    await vi.advanceTimersByTimeAsync(100);
    expect(missing(ed)).toBeGreaterThan(0);
    expect(seen).toHaveBeenCalled();
    ed.undo();
    ed.undo();
    await vi.advanceTimersByTimeAsync(VALIDATE_DELAY_MS);
    expect(missing(ed)).toBe(0);
  });

  it("an autosave doesn't make validation stale, and validateNow skips the wait", async () => {
    const { host } = await memoryHost();
    const ed = await Editor.open(host);
    ed.apply("Delete item", dropStick);
    ed.validateNow();
    const problems = ed.problems;
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 100);
    expect(ed.status.state).toBe("saved");
    expect(ed.validationPending).toBe(false);
    expect(ed.problems).toBe(problems);
  });
});
