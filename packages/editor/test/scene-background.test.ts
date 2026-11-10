import { describe, expect, it } from "vitest";
import { serialize } from "@questforge/schema";
import { imageSize } from "../src/model/imageSize.ts";
import { Bitmap } from "../src/model/png.ts";
import { createEntry } from "../src/model/commands.ts";
import { blankProject } from "../src/model/template.ts";
import { sceneEditor } from "./support/scene.ts";

const png = (w: number, h: number) => ({ name: "Beach Day.png", bytes: new Bitmap(w, h).png() });

/** A blank project plus a new, empty scene. */
function withEmptyScene() {
  const made = createEntry(blankProject("Test"), "scene", "");
  return { project: made.project, id: made.id };
}

describe("backgrounds and empty scenes", () => {
  it("reads image sizes from PNG, JPEG and WebP headers", () => {
    expect(imageSize(new Bitmap(37, 21).png())).toEqual({ w: 37, h: 21 });
    // A minimal JPEG: SOI, an APP0 segment, then SOF0 with height 300 and width 500.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x2c, 0x01, 0xf4, 3, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ w: 500, h: 300 });
    const webp = new Uint8Array(30);
    webp.set([...("RIFF" as string)].map((c) => c.charCodeAt(0)), 0);
    webp.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
    webp.set([639 & 0xff, 639 >> 8, 0, 399 & 0xff, 399 >> 8, 0], 24);
    expect(imageSize(webp)).toEqual({ w: 640, h: 400 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("a new scene has no background and serializes without the key", async () => {
    const { project, id } = withEmptyScene();
    const doc = project.scenes.find((s) => s.data.id === id)!;
    expect(doc.data.background).toBeUndefined();
    expect(serialize(doc.data)).not.toContain("background");
  });

  it("dropping an image on a scene with no background imports it and sets it, as one step", async () => {
    const { project, id } = withEmptyScene();
    const { c, editor, scene, at, dispose } = await sceneEditor(project, id);
    c.setLayer("walkable");
    const steps = editor.history.size;
    expect(c.dropFiles([png(640, 400)], at([300, 200]).screen)).toBe(true);
    expect(scene().background).toBe("beach_day");
    expect(editor.project.assets!.data.images.find((i) => i.id === "beach_day")!.path).toBe("assets/images/Beach Day.png");
    expect(editor.history.size).toBe(steps + 1);
    expect(editor.history.undoLabel).toBe("Import background");
    expect(c.selection).toEqual({ list: "background", key: "background" });
    editor.undo();
    expect(scene().background).toBeUndefined();
    expect(editor.project.assets!.data.images.some((i) => i.id === "beach_day")).toBe(false);
    dispose();
  });

  it("with a background, an image dropped on another layer becomes an object standing at the drop point", async () => {
    const { c, editor, scene, at, dispose } = await sceneEditor(blankProject("T"), "first_scene");
    c.setLayer("walkable");
    c.dropFiles([{ ...png(40, 60), name: "palm.png" }], at([200, 350]).screen);
    expect(scene().background).toBe("first_scene_bg");
    expect(scene().objects).toEqual([{ id: "palm", image: "palm", x: 180, y: 290, visible: true, rules: [] }]);
    expect(editor.history.undoLabel).toBe("Import and place object");
    expect(c.ui.layer).toBe("objects");
    // On the Background layer the drop replaces the background.
    c.setLayer("background");
    c.dropFiles([{ ...png(640, 400), name: "night.png" }], at([10, 10]).screen);
    expect(scene().background).toBe("night");
    dispose();
  });

  it("sounds are only imported, and other files are refused, with a notice", async () => {
    const { c, editor, scene, at, dispose } = await sceneEditor(blankProject("T"), "first_scene");
    c.dropFiles([{ name: "waves.ogg", bytes: new Uint8Array([1]) }, { name: "notes.txt", bytes: new Uint8Array([1]) }], at([10, 10]).screen);
    expect(editor.project.assets!.data.audio.map((a) => a.id)).toEqual(["waves"]);
    expect(scene().background).toBe("first_scene_bg");
    expect(editor.notice?.text).toContain("notes.txt");
    dispose();
  });

  it("choosing and removing a background are undo steps; the row deletes it", async () => {
    const { c, editor, scene, dispose } = await sceneEditor(blankProject("T"), "first_scene");
    c.chooseBackground("player_sprite");
    expect(scene().background).toBe("player_sprite");
    c.deleteThing({ list: "background", key: "background" });
    expect(scene().background).toBeUndefined();
    expect(editor.history.undoLabel).toBe("Delete background");
    dispose();
  });
});
