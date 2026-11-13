import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MemoryFs, isEmptyPlan, loadProject, planSave, validateProject } from "@questforge/schema";
import { Bitmap } from "../src/model/png.ts";
import { createBlankProject, folderNameFor } from "../src/model/template.ts";

describe("PNG writer", () => {
  it("writes a PNG whose pixels decode back", () => {
    const bmp = new Bitmap(3, 2);
    bmp.fill(1, 0, 1, 1, [255, 0, 0, 255]);
    const png = bmp.png();
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const idatAt = Buffer.from(png).indexOf("IDAT");
    const len = new DataView(png.buffer).getUint32(idatAt - 4);
    const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len));
    expect([...raw.subarray(0, 13)]).toEqual([0, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]);
  });
});

describe("new blank project", () => {
  it("makes a folder name from the title", () => {
    expect(folderNameFor("My Game")).toBe("My Game");
    expect(folderNameFor("  a/b:c?  ")).toBe("a b c");
    expect(folderNameFor("..hidden")).toBe("hidden");
    expect(folderNameFor("")).toBe("Untitled game");
  });

  it("validates with no problems and is in canonical form", async () => {
    const fs = new MemoryFs();
    await createBlankProject(fs, "The Lighthouse");
    expect(await fs.list()).toEqual([
      "assets.yaml",
      "assets/images/Styling/frame.jpg",
      "assets/images/first_scene_bg.png",
      "assets/images/player_sprite.png",
      "characters/player.character.yaml",
      "flags.yaml",
      "game.yaml",
      "scenes/first_scene.scene.yaml",
    ]);
    expect(fs.files.get(".gitignore")).toBe(".editor/\n");
    const { project, problems } = await loadProject(fs);
    expect(problems).toEqual([]);
    expect(validateProject(project)).toEqual([]);
    expect(planSave(project)).toSatisfy(isEmptyPlan);
    expect(project.game?.data.id).toBe("the_lighthouse");
    expect(project.game?.data.title).toBe("The Lighthouse");
    // Panels start on the built-in frame picture, a real JPEG in the Styling folder.
    expect(project.game?.data.style?.sharedFrame).toEqual({ image: "frame", insets: { left: 12, right: 12, top: 12, bottom: 12 } });
    // Text starts at the size the Typography settings show, not the legacy 10 px.
    expect(project.game?.data.style?.typography).toEqual({ size: 14 });
    // Character Dialogue starts unset: the choices and the names use the author defaults.
    expect(project.game?.data.style?.dialogueChoices).toBeUndefined();
    expect(project.game?.data.style?.speech).toBeUndefined();
    expect([...(fs.bytes.get("assets/images/Styling/frame.jpg")!).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
});
