import { describe, expect, it } from "vitest";
import { sceneEditor } from "./support/scene.ts";

// Garden (m1 fixture): the walkable area has one hole at [230,300] [330,290]
// [390,320] [330,350] [240,345]; the pond hotspot sits over it.
const HOLE = { list: "walkable", key: "hole:0" } as const;

describe("Select/Move", () => {
  it("the active layer wins: inside the hole selects the hole on Walkable, the pond on Hotspots", async () => {
    const { c, click, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    expect(c.selection).toEqual(HOLE);
    c.setLayer("hotspots");
    click([300, 320]);
    expect(c.selection).toEqual({ list: "hotspots", key: "pond" });
    // Empty space clears the selection back to the scene.
    c.setLayer("walkable");
    click([5, 390]);
    expect(c.selection).toBeNull();
    dispose();
  });

  it("a vertex drag is one undo step on release, and previews while dragging", async () => {
    const { c, editor, scene, click, at, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    const steps = editor.history.size;
    c.pointerDown(at([230, 300]));
    c.pointerMove(at([215, 305]));
    // The drag shows on the canvas but isn't in the project or history yet.
    expect(c.frame()!.scene.walkable.holes[0]![0]).toEqual([215, 305]);
    expect(scene().walkable.holes[0]![0]).toEqual([230, 300]);
    c.pointerMove(at([210.4, 309.6]));
    c.pointerUp(at([210.4, 309.6]));
    expect(scene().walkable.holes[0]![0]).toEqual([210, 310]); // whole pixels
    expect(editor.history.size).toBe(steps + 1);
    expect(editor.history.undoLabel).toBe("Move point");
    editor.undo();
    expect(scene().walkable.holes[0]![0]).toEqual([230, 300]);
    editor.redo();
    expect(scene().walkable.holes[0]![0]).toEqual([210, 310]);
    dispose();
  });

  it("a click that doesn't move anything records nothing", async () => {
    const { c, editor, click, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    const steps = editor.history.size;
    click([230, 300]);
    expect(editor.history.size).toBe(steps);
    dispose();
  });

  it("Alt-click deletes a vertex, but a shape keeps 3 points", async () => {
    const { c, editor, scene, click, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    click([230, 300], { alt: true });
    expect(scene().walkable.holes[0]!.length).toBe(4);
    expect(editor.history.undoLabel).toBe("Delete point");
    click([330, 290], { alt: true });
    expect(scene().walkable.holes[0]!.length).toBe(3);
    expect(click([390, 320], { alt: true }));
    expect(scene().walkable.holes[0]!.length).toBe(3);
    expect(editor.notice?.text).toContain("at least 3 points");
    dispose();
  });

  it("double-clicking an edge of the selected shape adds a point", async () => {
    const { c, scene, click, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    // Midway along the edge [330,350] → [240,345].
    click([285, 347.5], { clicks: 2 });
    expect(scene().walkable.holes[0]).toEqual([[230, 300], [330, 290], [390, 320], [330, 350], [285, 348], [240, 345]]);
    dispose();
  });

  it("dragging inside a shape moves it whole, kept inside the scene", async () => {
    const { c, scene, drag, dispose } = await sceneEditor();
    c.setLayer("walkable");
    drag([300, 320], [310, 300]);
    expect(scene().walkable.holes[0]![0]).toEqual([240, 280]);
    drag([320, 300], [320, 900]);
    expect(Math.max(...scene().walkable.holes[0]!.map((p) => p[1]))).toBe(400);
    dispose();
  });

  it("hidden and locked layers can't be clicked or edited", async () => {
    const { c, ws, scene, click, drag, dispose } = await sceneEditor();
    c.setLayer("walkable");
    ws.sceneUi.toggleLocked("garden", "walkable");
    click([300, 320]);
    // The pond on the next layer answers instead.
    expect(c.selection).toEqual({ list: "hotspots", key: "pond" });
    ws.sceneUi.toggleHidden("garden", "hotspots");
    click([300, 320]);
    expect(c.selection).toBeNull();
    const before = scene().walkable.holes[0];
    drag([300, 320], [320, 320]);
    expect(scene().walkable.holes[0]).toEqual(before);
    dispose();
  });

  it("moves objects with their obstacle and baseline, spawns, depth lines and baselines", async () => {
    const { c, scene, drag, click, dispose } = await sceneEditor(undefined, "garden", { boulder_img: [84, 66] });
    c.setLayer("objects");
    // The boulder's image covers x 288–372, y 186–252.
    drag([330, 200], [340, 210]);
    const boulder = scene().objects.find((o) => o.id === "boulder")!;
    expect([boulder.x, boulder.y, boulder.baseline]).toEqual([298, 196, 258]);
    expect(boulder.obstacle![0]).toEqual([304, 232]);
    // Its baseline handle drags on its own.
    expect(c.selection).toEqual({ list: "objects", key: "boulder" });
    drag([330, 258], [330, 240]);
    expect(scene().objects.find((o) => o.id === "boulder")!.baseline).toBe(240);
    // Spawn points and depth lines are on Guides.
    c.setLayer("guides");
    drag([200, 380], [210, 370]);
    expect(scene().spawns.default).toMatchObject({ x: 210, y: 370 });
    drag([320, 150], [320, 120]);
    expect(scene().depth.far.y).toBe(120);
    // The far line can't pass the near line.
    drag([320, 120], [320, 399]);
    expect(scene().depth.far.y).toBe(scene().depth.near.y - 1);
    click([5, 390]);
    dispose();
  });

  it("Escape during a drag drops it", async () => {
    const { c, scene, at, dispose } = await sceneEditor();
    c.setLayer("walkable");
    const before = scene().walkable.holes[0];
    c.pointerDown(at([300, 320]));
    c.pointerMove(at([330, 330]));
    c.cancel();
    c.pointerUp(at([330, 330]));
    expect(scene().walkable.holes[0]).toEqual(before);
    dispose();
  });

  it("snaps a dragged point to nearby vertices when Snap is on", async () => {
    const { c, ws, scene, click, drag, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    // The outline has a corner at [300, 240]; at 2× the snap radius is 3 scene px.
    drag([230, 300], [301, 242]);
    expect(scene().walkable.holes[0]![0]).toEqual([300, 240]);
    ws.sceneUi.update("garden", (u) => ({ ...u, snap: false }));
    drag([300, 240], [301, 242]);
    expect(scene().walkable.holes[0]![0]).toEqual([301, 242]);
    dispose();
  });

  it("snaps to the nearest point on an edge when no vertex is close", async () => {
    const { c, scene, click, drag, dispose } = await sceneEditor();
    c.setLayer("walkable");
    click([300, 320]);
    // The outline's bottom edge runs along y 395.
    drag([330, 350], [400, 393.5]);
    expect(scene().walkable.holes[0]![3]).toEqual([400, 395]);
    dispose();
  });
});
