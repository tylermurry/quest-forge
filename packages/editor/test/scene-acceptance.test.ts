// Spec 09 acceptance, end to end on a real folder: "From an empty scene: import a
// background, draw walkable + 1 hole, place a foreground object, set depth lines,
// and see the correct ghost scaling, all without leaving the canvas." Every step
// goes through the canvas controller (pointer input and drops), nothing else.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scaleAt, type LoadedImage } from "@questforge/engine";
import type { SceneFile } from "@questforge/schema";
import { errorsIn } from "./support/fixtures.ts";
import { NodeFs } from "@questforge/schema/node";
import { Actions } from "../src/model/actions.ts";
import { Editor } from "../src/model/editor.ts";
import { Bitmap } from "../src/model/png.ts";
import { imageSize } from "../src/model/imageSize.ts";
import { SceneTools } from "../src/model/scene/tools.ts";
import { toScreen } from "../src/model/scene/view.ts";
import { createBlankProject } from "../src/model/template.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import type { Vec } from "@questforge/engine";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const png = (name: string, w: number, h: number) => ({ name, bytes: new Bitmap(w, h).png() });

describe("scene editor acceptance", () => {
  it("builds a scene from empty on the canvas alone, and it persists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "questforge-m4-"));
    dirs.push(dir);
    const fs = new NodeFs(dir);
    await createBlankProject(fs, "Lantern Test");
    const editor = await Editor.open({ fs });
    const actions = new Actions(editor, new WorkspaceState());
    const ws = actions.ws;

    // A new, empty scene from the browser, opened in a tab.
    const sceneId = actions.newEntry("scene", "")!;
    // Images "decode" to the size their file header says, as the canvas would see them.
    const images = (id: string): LoadedImage | undefined => {
      const asset = editor.project.assets?.data.images.find((i) => i.id === id);
      const bytes = asset && editor.project.pendingFiles[asset.path];
      const size = bytes ? imageSize(bytes) : asset?.id === "player_sprite" ? { w: 24, h: 48 } : null;
      return asset && size ? { asset, size } : undefined;
    };
    const c = new SceneTools({ editor, ws, scene: sceneId, images });
    c.setSize({ w: 1300, h: 820 }); // fits 640×400 at 2×
    const at = (p: Vec) => ({ screen: toScreen(c.transform, p), button: 0 });
    const click = (p: Vec, clicks = 1) => {
      c.pointerDown({ ...at(p), clicks });
      c.pointerUp({ ...at(p), clicks });
    };
    const drag = (a: Vec, b: Vec) => {
      c.pointerDown(at(a));
      c.pointerMove(at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
      c.pointerMove(at(b));
      c.pointerUp(at(b));
    };
    const scene = () => editor.project.scenes.find((s) => s.data.id === sceneId)!.data as SceneFile;
    expect(scene().background).toBeUndefined();
    expect(scene().walkable.outer).toEqual([]);

    // 1. Import a background: drop a file from the OS onto the canvas.
    c.dropFiles([png("beach.png", 640, 400)], at([320, 200]).screen);
    expect(scene().background).toBe("beach");

    // 2. Draw the walkable area with the Polygon tool (double-click closes)…
    c.setLayer("walkable");
    c.setTool("polygon");
    for (const p of [
      [20, 395],
      [620, 395],
      [560, 190],
      [80, 190],
    ] as Vec[])
      click(p);
    click([80, 190], 2);
    expect(scene().walkable.outer).toEqual([
      [20, 395],
      [620, 395],
      [560, 190],
      [80, 190],
    ]);
    // …and one hole (a rock) with the Rectangle tool.
    c.setTool("rect");
    drag([280, 280], [360, 320]);
    expect(scene().walkable.holes).toEqual([
      [
        [280, 280],
        [360, 280],
        [360, 320],
        [280, 320],
      ],
    ]);

    // 3. Place a foreground object: drop a palm image near the front.
    c.dropFiles([png("palm.png", 60, 180)], at([150, 390]).screen);
    const palm = scene().objects.find((o) => o.id === "palm")!;
    expect(palm).toMatchObject({ image: "palm", x: 120, y: 210, visible: true });

    // 4. Set the depth lines by dragging them on the Guides layer.
    c.setLayer("guides");
    c.setTool("select");
    drag([320, scene().depth.far.y], [320, 190]);
    drag([320, scene().depth.near.y], [320, 395]);
    expect([scene().depth.far.y, scene().depth.near.y]).toEqual([190, 395]);

    // 5. The ghost scales correctly: tiny at the far line, full size at the near line,
    //    and the palm hides it when it stands behind the palm's baseline.
    const ghostAt = (p: Vec) => {
      c.pointerMove(at(p));
      return c.frame()!.sprites.find((s) => s.ghost)!;
    };
    const far = ghostAt([300, 192]);
    const near = ghostAt([300, 394]);
    expect(far.d.dest.h).toBeCloseTo(48 * scaleAt(scene().depth, far.d.baseline));
    expect(near.d.dest.h).toBeCloseTo(48 * scaleAt(scene().depth, near.d.baseline));
    expect(near.d.dest.h).toBeGreaterThan(far.d.dest.h * 1.5);
    c.pointerMove(at([150, 380]));
    const order = c.frame()!.sprites.map((s) => (s.ghost ? "ghost" : s.d.id));
    expect(order.indexOf("ghost")).toBeLessThan(order.indexOf("palm")); // behind the palm (baseline 390)

    // The default spawn now stands in the walkable area, so the scene is valid.
    expect(errorsIn(editor.project)).toEqual([]);

    // Autosave reaches "Saved", and a fresh load from disk has the same geometry.
    await editor.flush();
    expect(editor.status).toEqual({ state: "saved" });
    const text = await readFile(join(dir, `scenes/${sceneId}.scene.yaml`), "utf8");
    expect(text).toContain("- [80, 190]");
    const reopened = await Editor.open({ fs: new NodeFs(dir) });
    const again = reopened.project.scenes.find((s) => s.data.id === sceneId)!.data;
    expect(again).toEqual(scene());
    editor.dispose();
    reopened.dispose();
  });
});
