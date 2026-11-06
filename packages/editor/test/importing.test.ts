import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, planSave, saveProject } from "@questforge/schema";
import { Actions } from "../src/model/actions.ts";
import { Editor } from "../src/model/editor.ts";
import { importFiles } from "../src/model/importing.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { errorsIn, m1Project } from "./support/fixtures.ts";

const f = (name: string) => ({ name, bytes: new Uint8Array([1, 2, 3]) });

describe("importing files (D88)", () => {
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
