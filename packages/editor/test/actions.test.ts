import { describe, expect, it } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { Actions } from "../src/model/actions.ts";
import { sectionEntries, sectionFolders } from "../src/model/browser.ts";
import { Editor } from "../src/model/editor.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { m1Project } from "./support/fixtures.ts";

async function setup() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  return new Actions(editor, new WorkspaceState());
}

describe("browser actions", () => {
  it("each action is one labelled undo step", async () => {
    const a = await setup();
    const f = a.newFolder("scene", "")!;
    expect(f).toBe("New folder");
    expect(a.editor.history.undoLabel).toBe("Create folder");
    expect(a.ws.selection).toEqual({ kind: "folder", section: "scene", path: "New folder" });
    expect(a.renameFolder("scene", f, "act1")).toBe(true);
    expect(a.drop({ section: "scene", kind: "entry", id: "garden" }, "scene", "act1")).toBe(true);
    expect(a.editor.history.undoLabel).toBe("Move scene");
    expect(a.drop({ section: "scene", kind: "entry", id: "garden" }, "item", "")).toBe(false);
    a.editor.undo();
    expect(sectionEntries(a.editor.project, "scene").find((e) => e.id === "garden")?.folder).toBe("");
    a.editor.redo();
    expect(sectionEntries(a.editor.project, "scene").find((e) => e.id === "garden")?.folder).toBe("act1");
  });

  it("dragging a folder into another nests it", async () => {
    const a = await setup();
    a.newFolder("item", "");
    a.renameFolder("item", "New folder", "tools");
    a.newFolder("item", "");
    a.renameFolder("item", "New folder", "shed");
    a.drop({ section: "item", kind: "entry", id: "rod" }, "item", "tools");
    expect(a.drop({ section: "item", kind: "folder", path: "tools" }, "item", "shed")).toBe(true);
    expect(sectionFolders(a.editor.project, "item")).toEqual(["shed", "shed/tools"]);
    expect(sectionEntries(a.editor.project, "item").find((e) => e.id === "rod")?.folder).toBe("shed/tools");
  });

  it("tabs follow Change ID and close when their entry is deleted", async () => {
    const a = await setup();
    a.ws.open({ section: "item", id: "rod" });
    expect(a.changeId("item", "rod", "fishing_rod")).toBe(true);
    expect(a.ws.tabs).toEqual([{ section: "item", id: "fishing_rod" }]);
    expect(a.changeIdImpact("item", "fishing_rod")).toMatch(/^Also updates \d+ references? to it\.$/);
    expect(a.deleteWarning("item", "fishing_rod")?.summary).toMatch(/^Used by/);
    a.delete("item", "fishing_rod");
    expect(a.ws.tabs).toEqual([]);
    a.editor.undo();
    expect(a.editor.project.items.some((i) => i.data.id === "fishing_rod")).toBe(true);
  });

  it("warns before deleting a non-empty folder, not an empty one", async () => {
    const a = await setup();
    a.newFolder("item", "");
    expect(a.deleteFolderWarning("item", "New folder")).toBeNull();
    a.drop({ section: "item", kind: "entry", id: "stick" }, "item", "New folder");
    expect(a.deleteFolderWarning("item", "New folder")?.summary).toBe("It holds 1 item. Used by 2 rules in 1 scene and the game settings.");
  });

  it("creates entries and opens them", async () => {
    const a = await setup();
    const id = a.newEntry("scene", "")!;
    expect(a.ws.tabs).toEqual([{ section: "scene", id }]);
    const flag = a.newEntry("flag", "")!;
    expect(a.ws.selection).toEqual({ kind: "entry", section: "flag", id: flag });
    expect(a.rename("flag", flag, "door_open")).toBe(true);
    expect(a.ws.selection).toEqual({ kind: "entry", section: "flag", id: "door_open" });
  });
});
