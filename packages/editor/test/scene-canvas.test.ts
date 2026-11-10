import { describe, expect, it } from "vitest";
import { layerRows } from "../src/model/scene/things.ts";
import { sceneEditor, sizedImages } from "./support/scene.ts";
import { m1Project } from "./support/fixtures.ts";

describe("scene canvas controller", () => {
  it("pans with space-drag and the middle button, and zooms with a pinch around the pointer", async () => {
    const { c, at, dispose } = await sceneEditor();
    c.setSpace(true);
    c.pointerDown({ screen: [100, 100], button: 0 });
    c.pointerMove({ screen: [130, 90], button: 0 });
    c.pointerUp({ screen: [130, 90], button: 0 });
    c.setSpace(false);
    expect(c.transform).toEqual({ scale: 2, x: 30, y: -10 });
    c.pointerDown({ screen: [0, 0], button: 1 });
    c.pointerMove({ screen: [-10, 0], button: 1 });
    c.pointerUp({ screen: [-10, 0], button: 1 });
    expect(c.transform.x).toBe(20);
    // Two-finger scroll pans.
    c.wheel({ screen: [0, 0], dx: 5, dy: 10, zoom: false });
    expect(c.transform).toEqual({ scale: 2, x: 15, y: -20 });
    // A pinch keeps the scene point under the fingers.
    const under = at([200, 150]).screen;
    c.wheel({ screen: under, dx: 0, dy: -100, zoom: true });
    expect(c.transform.scale).toBeGreaterThan(2);
    const back = [(under[0] - c.transform.x) / c.transform.scale, (under[1] - c.transform.y) / c.transform.scale];
    expect(back[0]).toBeCloseTo(200, 0);
    expect(back[1]).toBeCloseTo(150, 0);
    dispose();
  });

  it("zoom commands step 1×–8× and fit", async () => {
    const { c, dispose } = await sceneEditor();
    c.zoomIn();
    expect(c.transform.scale).toBe(3);
    for (let i = 0; i < 10; i++) c.zoomIn();
    expect(c.transform.scale).toBe(8);
    c.zoomActual();
    expect(c.transform.scale).toBe(1);
    c.zoomFit();
    expect(c.ui.zoom).toEqual({ fit: true });
    dispose();
  });

  it("draws placed characters and objects through the engine's draw list, hidden ones faint", async () => {
    const p = await m1Project();
    const { c, dispose } = await sceneEditor(p);
    const f = c.frame()!;
    const garden = p.scenes.find((s) => s.data.id === "garden")!.data;
    expect(f.sprites.map((s) => s.d.id).sort()).toEqual([...garden.objects.map((o) => o.id), ...garden.characters.map((x) => x.character)].sort());
    for (const s of f.sprites) {
      const o = garden.objects.find((x) => x.id === s.d.id);
      if (o) expect(s.alpha).toBe(o.visible ? 1 : 0.35);
    }
    dispose();
  });

  it("lists each layer's contents, objects and characters together in draw order", async () => {
    const p = await m1Project();
    const garden = p.scenes.find((s) => s.data.id === "garden")!.data;
    const rows = layerRows(garden, sizedImages(p));
    expect(rows.guides.slice(0, 2).map((r) => r.title)).toEqual(["Far line", "Near line"]);
    expect(rows.guides.slice(2).map((r) => r.ref.key)).toEqual(Object.keys(garden.spawns));
    expect(rows.walkable.map((r) => r.title)).toEqual(["Outline", ...garden.walkable.holes.map((_, i) => `Hole ${i + 1}`)]);
    expect(rows.objects.length).toBe(garden.objects.length + garden.characters.length);
    expect(rows.hotspots.map((r) => r.ref.key)).toEqual(garden.hotspots.map((h) => h.id));
  });

  it("deletes a hole as one undo step", async () => {
    const { c, editor, scene, dispose } = await sceneEditor();
    const holes = scene().walkable.holes.length;
    expect(c.deleteThing({ list: "walkable", key: "hole:0" })).toBe(true);
    expect(scene().walkable.holes.length).toBe(holes - 1);
    expect(editor.history.undoLabel).toBe("Delete hole");
    editor.undo();
    expect(scene().walkable.holes.length).toBe(holes);
    dispose();
  });
});
