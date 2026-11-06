import { describe, expect, it } from "vitest";
import type { Project, SceneFile } from "@questforge/schema";
import { blankProject } from "../src/model/template.ts";
import { sceneEditor } from "./support/scene.ts";

/** A blank project whose first scene has no walkable area yet. */
function emptyWalkable(): Project {
  const p = blankProject("Test");
  const doc = p.scenes[0]!;
  p.scenes = [{ ...doc, data: { ...(doc.data as SceneFile), walkable: { outer: [], holes: [] } } }];
  return p;
}

describe("Polygon tool (spec 09, D104)", () => {
  it("click adds points; nothing enters history until the shape closes; then outline, then holes", async () => {
    const { c, editor, scene, click, dispose } = await sceneEditor(emptyWalkable(), "first_scene");
    c.setLayer("walkable");
    c.setTool("polygon");
    const steps = editor.history.size;
    click([40, 200]);
    click([600, 200]);
    click([600, 390]);
    expect(c.isDrawing).toBe(true);
    expect(c.frame()!.drawing!.points).toEqual([[40, 200], [600, 200], [600, 390]]);
    expect(editor.history.size).toBe(steps);
    expect(scene().walkable.outer).toEqual([]);
    click([40, 390]);
    // Double-click closes (its second click adds no point).
    click([40, 390], { clicks: 2 });
    expect(scene().walkable.outer).toEqual([[40, 200], [600, 200], [600, 390], [40, 390]]);
    expect(editor.history.size).toBe(steps + 1);
    expect(editor.history.undoLabel).toBe("Draw walkable area");
    expect(c.selection).toEqual({ list: "walkable", key: "outer" });
    // With an outline in place, the next shape is a hole, closed by clicking its first point.
    click([250, 260]);
    click([350, 260]);
    click([300, 330]);
    click([250.5, 260.5]);
    expect(scene().walkable.holes).toEqual([[[250, 260], [350, 260], [300, 330]]]);
    expect(c.selection).toEqual({ list: "walkable", key: "hole:0" });
    dispose();
  });

  it("Enter closes, Backspace removes the last point, Escape cancels, under 3 points refuses", async () => {
    const { c, editor, scene, click, dispose } = await sceneEditor(emptyWalkable(), "first_scene");
    c.setLayer("walkable");
    c.setTool("polygon");
    click([10, 10]);
    click([100, 10]);
    c.finish();
    expect(editor.notice?.text).toContain("at least 3 points");
    expect(c.isDrawing).toBe(true);
    click([100, 100]);
    click([50, 150]);
    c.removeLastPoint();
    expect(c.frame()!.drawing!.points.length).toBe(3);
    c.cancel();
    expect(c.isDrawing).toBe(false);
    expect(scene().walkable.outer).toEqual([]);
    click([10, 10]);
    click([100, 10]);
    click([100, 100]);
    c.finish();
    expect(scene().walkable.outer.length).toBe(3);
    dispose();
  });

  it("shows the closing edge red when closing would cross itself (D100)", async () => {
    const { c, at, click, dispose } = await sceneEditor(emptyWalkable(), "first_scene");
    c.setLayer("walkable");
    c.setTool("polygon");
    click([10, 10]);
    click([100, 100]);
    click([100, 10]);
    c.pointerMove(at([10, 100]));
    expect(c.frame()!.drawing!.closeInvalid).toBe(true);
    c.pointerMove(at([55, 5]));
    expect(c.frame()!.drawing!.closeInvalid).toBe(false);
    dispose();
  });

  it("makes new hotspots and regions with unique default names and IDs, asking for a name (D99)", async () => {
    const { c, ws, scene, click, dispose } = await sceneEditor();
    c.setLayer("hotspots");
    c.setTool("polygon");
    for (const [x, y] of [[20, 20], [60, 20], [60, 60]] as const) click([x, y]);
    c.finish();
    for (const [x, y] of [[100, 20], [140, 20], [140, 60]] as const) click([x, y]);
    c.finish();
    const made = scene().hotspots.slice(-2);
    expect(made.map((h) => [h.id, h.name])).toEqual([["hotspot", "Hotspot"], ["hotspot_2", "Hotspot 2"]]);
    expect(made[0]!.rules).toEqual([]);
    expect(ws.takeFocusRequest()).toBe("name");
    c.setLayer("regions");
    c.setTool("polygon");
    for (const [x, y] of [[20, 100], [60, 100], [60, 140]] as const) click([x, y]);
    c.finish();
    expect(scene().regions.at(-1)!.id).toBe("region");
    dispose();
  });

  it("on Objects draws the selected object's obstacle, and asks for an object first", async () => {
    const { c, ws, editor, scene, click, dispose } = await sceneEditor(undefined, "garden", { rock_img: [70, 40] });
    ws.sceneUi.update("garden", (u) => ({ ...u, snap: false }));
    c.setLayer("objects");
    c.setTool("polygon");
    click([10, 10]);
    expect(editor.notice?.text).toContain("Select an object first");
    c.select({ list: "objects", key: "rock" });
    for (const [x, y] of [[440, 290], [500, 290], [500, 300], [440, 300]] as const) click([x, y]);
    c.finish();
    expect(scene().objects.find((o) => o.id === "rock")!.obstacle).toEqual([[440, 290], [500, 290], [500, 300], [440, 300]]);
    expect(editor.history.undoLabel).toBe("Draw obstacle");
    dispose();
  });

  it("locked layers refuse drawing", async () => {
    const { c, ws, editor, click, dispose } = await sceneEditor(emptyWalkable(), "first_scene");
    c.setLayer("walkable");
    c.setTool("polygon");
    ws.sceneUi.toggleLocked("first_scene", "walkable");
    click([10, 10]);
    expect(c.isDrawing).toBe(false);
    expect(editor.notice?.text).toContain("locked");
    dispose();
  });
});

describe("Rectangle tool (spec 09)", () => {
  it("drags out a 4-point polygon as one step", async () => {
    const { c, editor, scene, drag, dispose } = await sceneEditor(emptyWalkable(), "first_scene");
    c.setLayer("walkable");
    c.setTool("rect");
    const steps = editor.history.size;
    drag([20.4, 210], [620, 395.6]);
    expect(scene().walkable.outer).toEqual([[20, 210], [620, 210], [620, 396], [20, 396]]);
    expect(editor.history.size).toBe(steps + 1);
    // A zero-area drag makes nothing.
    drag([100, 300], [100, 350]);
    expect(scene().walkable.holes).toEqual([]);
    dispose();
  });
});
