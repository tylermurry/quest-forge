import { describe, expect, it } from "vitest";
import { sceneEditor } from "./support/scene.ts";

describe("Spawn point and Walk-to point tools", () => {
  it("a click adds a spawn facing down; dragging away sets its facing; one step each", async () => {
    const { c, editor, scene, click, drag, dispose } = await sceneEditor();
    c.setLayer("guides");
    c.setTool("spawn");
    const steps = editor.history.size;
    click([300, 380.4]);
    expect(scene().spawns.spawn).toEqual({ x: 300, y: 380, facing: "down" });
    expect(c.selection).toEqual({ list: "spawns", key: "spawn" });
    expect(editor.history.size).toBe(steps + 1);
    expect(editor.history.undoLabel).toBe("Add spawn point");
    drag([400, 380], [440, 375]);
    expect(scene().spawns.spawn_2).toEqual({ x: 400, y: 380, facing: "right" });
    // Pressing on an existing spawn drags it instead.
    drag([300, 380], [310, 370]);
    expect(scene().spawns.spawn).toMatchObject({ x: 310, y: 370 });
    expect(Object.keys(scene().spawns).length).toBe(4);
    dispose();
  });

  it("names the first spawn of a scene default", async () => {
    const { c, editor, scene, click, dispose } = await sceneEditor();
    c.deleteThing({ list: "spawns", key: "default" });
    c.setLayer("guides");
    c.setTool("spawn");
    click([250, 380]);
    expect(scene().spawns.default).toMatchObject({ x: 250, y: 380 });
    expect(editor.history.undoLabel).toBe("Add spawn point");
    dispose();
  });

  it("sets the selected hotspot's walk-to point, asking for a hotspot first", async () => {
    const { c, editor, scene, click, drag, dispose } = await sceneEditor();
    c.setLayer("hotspots");
    c.setTool("walkto");
    click([10, 395]);
    expect(editor.notice?.text).toContain("Select a hotspot first");
    // Clicking a hotspot picks it; the next click places its walk-to point.
    click([300, 320]);
    expect(c.selection).toEqual({ list: "hotspots", key: "pond" });
    drag([350, 378], [350, 340]);
    expect(scene().hotspots.find((h) => h.id === "pond")!.walkTo).toEqual({ x: 350, y: 378, facing: "up" });
    expect(editor.history.undoLabel).toBe("Set walk-to point");
    dispose();
  });

  it("refuses to add spawns on a locked Guides layer", async () => {
    const { c, ws, editor, scene, click, dispose } = await sceneEditor();
    c.setLayer("guides");
    c.setTool("spawn");
    ws.sceneUi.toggleLocked("garden", "guides");
    const before = Object.keys(scene().spawns);
    click([300, 380]);
    expect(Object.keys(scene().spawns)).toEqual(before);
    expect(editor.notice?.text).toContain("locked");
    dispose();
  });
});
