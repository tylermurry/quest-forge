import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, planSave, saveProject, serialize } from "@questforge/schema";
import { Actions } from "../src/model/actions.ts";
import { Editor } from "../src/model/editor.ts";
import { importFiles, isFontFile } from "../src/model/importing.ts";
import { CommandError, createEntry, duplicateEntry } from "../src/model/commands.ts";
import { sectionEntries } from "../src/model/browser.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { errorsIn, m1Project } from "./support/fixtures.ts";

const f = (name: string) => ({ name, bytes: new Uint8Array([1, 2, 3]) });
const WOFF2 = (name: string) => ({ name, bytes: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 9, 9]) });
const WOFF = (name: string) => ({ name, bytes: new Uint8Array([0x77, 0x4f, 0x46, 0x46, 9, 9]) });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("importing files", () => {
  it("puts images and sounds in their sections, in the drop folder when it matches", async () => {
    const p = await m1Project();
    const r = importFiles(p, [f("Sea Shell.PNG"), f("waves.ogg"), f("notes.txt")], "image", "items");
    expect(r.imported).toEqual([
      { section: "image", id: "sea_shell", path: "assets/images/items/Sea Shell.png" },
      { section: "audio", id: "waves", path: "assets/audio/waves.ogg" },
    ]);
    expect(r.refused).toEqual(["notes.txt"]);
    expect(Object.keys(r.project.pendingFiles)).toEqual(["assets/images/items/Sea Shell.png", "assets/audio/waves.ogg"]);
    expect(errorsIn(r.project)).toEqual([]);
  });

  it("makes IDs from file names and avoids clashes", async () => {
    const p = await m1Project();
    const r = importFiles(p, [f("rod.png"), f("rod.png"), f("2nd-floor.webp"), f("01 Theme.mp3")], "image", "items");
    expect(r.imported.map((i) => [i.id, i.path])).toEqual([
      ["rod", "assets/images/items/rod_2.png"], // rod.png exists there; no image is called rod yet
      ["rod_2", "assets/images/items/rod_3.png"],
      ["img_2nd_floor", "assets/images/items/2nd-floor.webp"],
      ["snd_01_theme", "assets/audio/01 Theme.mp3"],
    ]);
  });

  it("writes the files on save, and undo removes them", async () => {
    const fs = new MemoryFs();
    await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
    const a = new Actions(await Editor.open({ fs }), new WorkspaceState());
    expect(a.importFiles("image", "", [f("shell.png"), f("bad.gif")])).toBe(1);
    expect(a.editor.notice?.text).toContain("Not imported: bad.gif");
    expect(a.ws.selection).toEqual({ kind: "entry", section: "image", id: "shell" });
    await a.editor.flush();
    expect(fs.bytes.get("assets/images/shell.png")).toEqual(new Uint8Array([1, 2, 3]));
    a.editor.undo();
    await a.editor.flush();
    expect(fs.bytes.has("assets/images/shell.png")).toBe(false);
    expect(fs.bytes.has(".editor/trash/assets/images/shell.png")).toBe(true);
    a.editor.redo();
    await a.editor.flush();
    expect(fs.bytes.has("assets/images/shell.png")).toBe(true);
    expect(planSave((await loadProject(fs)).project).moves).toEqual([]);
  });
});

describe("importing fonts", () => {
  it("accepts WOFF2 and WOFF files into Fonts, whatever section they are dropped on", async () => {
    const p = await m1Project();
    const r = importFiles(p, [WOFF2("Ye Olde.WOFF2"), WOFF("plain.woff")], "image", "items");
    expect(r.imported).toEqual([
      { section: "font", id: "ye_olde", path: "assets/fonts/Ye Olde.woff2" },
      { section: "font", id: "plain", path: "assets/fonts/plain.woff" },
    ]);
    expect(r.refused).toEqual([]);
    expect(r.project.assets!.data.fonts).toEqual([
      { id: "ye_olde", path: "assets/fonts/Ye Olde.woff2" },
      { id: "plain", path: "assets/fonts/plain.woff" },
    ]);
    expect(Object.keys(r.project.pendingFiles)).toEqual(["assets/fonts/Ye Olde.woff2", "assets/fonts/plain.woff"]);
    expect(errorsIn(r.project)).toEqual([]);
  });

  it("refuses a PNG renamed to .woff2, and a file too short to have a signature", async () => {
    const p = await m1Project();
    const r = importFiles(p, [{ name: "sneaky.woff2", bytes: PNG }, { name: "empty.woff", bytes: new Uint8Array() }, { name: "wrong.woff", bytes: WOFF2("x").bytes }], "font", "");
    expect(r.imported).toEqual([]);
    expect(r.refused).toEqual(["sneaky.woff2", "empty.woff", "wrong.woff"]);
    expect(r.project).toBe(p);
  });

  it("checks the signature of each format", () => {
    expect(isFontFile("woff2", WOFF2("a").bytes)).toBe(true);
    expect(isFontFile("woff", WOFF("a").bytes)).toBe(true);
    expect(isFontFile("woff2", WOFF("a").bytes)).toBe(false);
    expect(isFontFile("ttf", WOFF2("a").bytes)).toBe(false);
  });

  it("leaves assets.yaml without a fonts list when no font is imported, and avoids ID and path clashes", async () => {
    const p = await m1Project();
    expect(importFiles(p, [f("shell.png")], "image", "").project.assets!.data.fonts).toBeUndefined();
    const first = importFiles(p, [WOFF2("hand.woff2")], "font", "").project;
    const again = importFiles(first, [WOFF2("hand.woff2")], "font", "");
    expect(again.imported.map((i) => [i.id, i.path])).toEqual([["hand_2", "assets/fonts/hand_2.woff2"]]);
  });

  it("is one undo step, saves the file, and rename, delete and undo follow the image path", async () => {
    const fs = new MemoryFs();
    await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
    const a = new Actions(await Editor.open({ fs }), new WorkspaceState());
    expect(a.importFiles("font", "", [WOFF2("hand.woff2"), { name: "fake.woff2", bytes: PNG }])).toBe(1);
    expect(a.editor.notice?.text).toContain("Not imported: fake.woff2");
    expect(a.ws.selection).toEqual({ kind: "entry", section: "font", id: "hand" });
    expect(sectionEntries(a.editor.project, "font")).toEqual([{ section: "font", id: "hand", name: "hand", folder: "" }]);
    await a.editor.flush();
    expect(fs.bytes.get("assets/fonts/hand.woff2")).toEqual(WOFF2("x").bytes);

    // Typography uses it: rename follows, and the delete warning names the use.
    a.editor.apply("Use font", (p) => ({ ...p, game: { ...p.game!, data: { ...p.game!.data, style: { typography: { font: "hand" } } } } }));
    expect(a.changeId("font", "hand", "scribble")).toBe(true);
    expect(a.editor.project.game!.data.style!.typography!.font).toBe("scribble");
    expect(a.deleteWarning("font", "scribble")).not.toBeNull();
    expect(a.delete("font", "scribble")).toBe(true);
    expect(a.editor.project.assets!.data.fonts).toBeUndefined();
    await a.editor.flush();
    expect(fs.bytes.has("assets/fonts/hand.woff2")).toBe(false);
    expect(fs.bytes.has(".editor/trash/assets/fonts/hand.woff2")).toBe(true);

    a.editor.undo();
    await a.editor.flush();
    expect(a.editor.project.assets!.data.fonts).toEqual([{ id: "scribble", path: "assets/fonts/hand.woff2" }]);
    expect(fs.bytes.has("assets/fonts/hand.woff2")).toBe(true);
    expect(planSave((await loadProject(fs)).project).moves).toEqual([]);
  });

  it("deleting the last font brings assets.yaml back byte for byte", async () => {
    const fs = new MemoryFs();
    await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
    const a = new Actions(await Editor.open({ fs }), new WorkspaceState());
    const original = serialize(a.editor.project.assets!.data);
    a.importFiles("font", "", [WOFF2("hand.woff2")]);
    expect(serialize(a.editor.project.assets!.data)).toContain("fonts:");
    a.delete("font", "hand");
    expect(serialize(a.editor.project.assets!.data)).toBe(original);
  });

  it("cannot be created or duplicated, only imported", async () => {
    const p = await m1Project();
    expect(() => createEntry(p, "font", "")).toThrow(CommandError);
    expect(() => duplicateEntry(p, "font", "x")).toThrow(CommandError);
  });
});
