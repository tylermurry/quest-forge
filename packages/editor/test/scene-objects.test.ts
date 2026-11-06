import { describe, expect, it } from "vitest";
import { moveObject } from "../src/model/scene/commands.ts";
import { drawOrder } from "../src/model/scene/things.ts";
import { sizedImages, sceneEditor } from "./support/scene.ts";

const SIZES = { palm_img: [60, 200], boulder_img: [84, 66], flowerpot_img: [32, 32], rock_img: [70, 40], workbench_img: [80, 40] } as Record<string, [number, number]>;

describe("Objects layer (spec 09, D95, D106)", () => {
  it("moves an object left as well as right; its baseline and obstacle follow", async () => {
    const { editor, dispose } = await sceneEditor(undefined, "shed", SIZES);
    const bench = (p = editor.project) => p.scenes.find((x) => x.data.id === "shed")!.data.objects.find((o) => o.id === "workbench")!;
    const before = bench();
    const left = bench(moveObject(editor.project, "shed", "workbench", -30, 0));
    expect(left.x).toBe(before.x - 30);
    expect(left.obstacle![0]![0]).toBe(before.obstacle![0]![0] - 30);
    const right = bench(moveObject(editor.project, "shed", "workbench", 30, 0));
    expect(right.x).toBe(before.x + 30);
    // Vertically the obstacle (12 px tall, ending on the baseline) stops at the scene top.
    const up = bench(moveObject(editor.project, "shed", "workbench", 0, -10_000));
    expect(up.baseline).toBe(12);
    dispose();
  });

  it("dropping an image places an object with its bottom-centre at the drop point", async () => {
    const { c, editor, scene, at, dispose } = await sceneEditor(undefined, "garden", SIZES);
    expect(c.dropEntry({ section: "image", id: "palm_img" }, at([100, 380]).screen)).toBe(true);
    const o = scene().objects.at(-1)!;
    // `palm` is taken in the garden, so the new one is palm_2.
    expect(o).toEqual({ id: "palm_2", image: "palm_img", x: 70, y: 180, visible: true, rules: [] });
    expect(editor.history.undoLabel).toBe("Place object");
    expect(c.selection).toEqual({ list: "objects", key: "palm_2" });
    expect(c.ui.layer).toBe("objects");
    dispose();
  });

  it("dropping a character places it at the drop point, but never the player or a second copy", async () => {
    const { c, editor, scene, at, dispose } = await sceneEditor(undefined, "garden", SIZES);
    expect(c.dropEntry({ section: "character", id: "visitor" }, at([400, 360]).screen)).toBe(true);
    expect(scene().characters.at(-1)).toEqual({ character: "visitor", x: 400, y: 360, facing: "down", visible: true, rules: [] });
    expect(c.dropEntry({ section: "character", id: "visitor" }, at([420, 360]).screen)).toBe(false);
    expect(editor.notice?.text).toContain("already in this scene");
    expect(c.dropEntry({ section: "character", id: "hero" }, at([420, 360]).screen)).toBe(false);
    expect(editor.notice?.text).toContain("spawn points");
    dispose();
  });

  it("reordering an object in the list sets its baseline between its new neighbours (D95)", async () => {
    const { c, editor, scene, dispose } = await sceneEditor(undefined, "garden", SIZES);
    const images = sizedImages(editor.project, SIZES);
    const frontFirst = () => drawOrder(scene(), images).reverse().map((r) => r.key);
    const before = frontFirst();
    // Move the rearmost object to the very front, then to second place.
    const back = before.at(-1)!;
    expect(c.reorder(back, 0)).toBe(true);
    expect(frontFirst()[0]).toBe(back);
    expect(editor.history.undoLabel).toBe("Reorder object");
    c.reorder(back, 1);
    expect(frontFirst()[1]).toBe(back);
    // Whatever the list says is what the engine draws: the same sort.
    const sprites = c.frame()!.sprites.map((s) => s.d.id).reverse();
    expect(sprites).toEqual(frontFirst());
    dispose();
  });

  it("refuses to place things on a locked Objects layer", async () => {
    const { c, ws, scene, at, dispose } = await sceneEditor(undefined, "garden", SIZES);
    ws.sceneUi.toggleLocked("garden", "objects");
    const n = scene().objects.length;
    expect(c.dropEntry({ section: "image", id: "palm_img" }, at([100, 380]).screen)).toBe(false);
    expect(scene().objects.length).toBe(n);
    dispose();
  });
});
