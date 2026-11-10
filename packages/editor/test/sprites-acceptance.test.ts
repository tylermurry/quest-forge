// Spec 05 acceptance, end to end on a real folder: "Import an 8×4 sheet, slice it, and
// assign walk cycles in under 2 minutes. Mirrored left walk renders correctly, with
// the origin preserved." Each step is one user action in the image or character tab,
// run as the UI runs it (one Editor.apply each), so the step count is the click count.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Session, type LoadedImage } from "@questforge/engine";
import { loadProject, validateProject, type CharacterFile } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { Actions } from "../src/model/actions.ts";
import { patchSlot, rowFrames, slotLabel, slotView } from "../src/model/animations.ts";
import { Editor } from "../src/model/editor.ts";
import { imageSize } from "../src/model/imageSize.ts";
import { setOrigin, sheetFromGrid, sliceImage } from "../src/model/sprites.ts";
import { createBlankProject } from "../src/model/template.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { ROWS, SHEET, walkSheet } from "./support/sheet.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("sprites and animation acceptance", () => {
  it("imports, slices and assigns walk cycles in a dozen actions; mirrored left keeps the origin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "questforge-m4b-"));
    dirs.push(dir);
    const fs = new NodeFs(dir);
    await createBlankProject(fs, "Sprite Test");
    const editor = await Editor.open({ fs });
    const actions = new Actions(editor, new WorkspaceState());
    let clicks = 0;
    const act = (label: string, run: Parameters<Editor["apply"]>[1]) => {
      clicks++;
      expect(editor.apply(label, run)).toBe(true);
    };

    // 1. Import the sheet (drop on the browser).
    clicks++;
    expect(actions.importFiles("image", "", [{ name: "hero_walk.png", bytes: walkSheet() }])).toBe(1);
    const size = imageSize(editor.project.pendingFiles["assets/images/hero_walk.png"]!)!;
    expect(size).toEqual({ w: 256, h: 192 });

    // 2–4. Image tab: Rows × columns, 8 columns, 4 rows; click the feet.
    act("Slice image", (p) => sliceImage(p, "hero_walk", size, sheetFromGrid(size, 1, 1)));
    act("Slice image", (p) => sliceImage(p, "hero_walk", size, sheetFromGrid(size, 8, 1)));
    act("Slice image", (p) => sliceImage(p, "hero_walk", size, sheetFromGrid(size, 8, 4)));
    act("Set origin", (p) => setOrigin(p, "hero_walk", size, [16, 47]));
    expect(editor.project.assets!.data.images.find((i) => i.id === "hero_walk")).toMatchObject({ sheet: SHEET, origin: [16, 47] });

    // 5–10. Character tab: for down, up and right, pick the image and take the row.
    const img = () => editor.project.assets!.data.images.find((i) => i.id === "hero_walk")!;
    for (const dir of ["down", "up", "right"] as const) {
      act("Change animation image", (p) => patchSlot(p, "player", `walk_${dir}`, { image: "hero_walk" }));
      act("Pick animation frames", (p) => patchSlot(p, "player", `walk_${dir}`, { image: "hero_walk", frames: rowFrames(img(), ROWS[dir]) }));
    }
    // "Left mirrors right" is on in a blank project, so left is done.
    const player = () => editor.project.characters.find((c) => c.data.id === "player")!.data as CharacterFile;
    expect(player().mirrorLeft).toBe(true);
    expect(slotLabel(slotView(player(), "walk_left"), "walk_left")).toBe("Mirrors walk_right");
    expect(player().animations.walk_right).toEqual({ image: "hero_walk", frames: [16, 17, 18, 19, 20, 21, 22, 23], fps: 8, loop: true });
    // A dozen clicks: well under 2 minutes.
    expect(clicks).toBeLessThanOrEqual(12);
    expect(validateProject(editor.project)).toEqual([]);

    // It persists, canonically.
    await editor.flush();
    const reloaded = await loadProject(fs);
    expect(reloaded.problems).toEqual([]);
    expect(reloaded.project.characters.find((c) => c.data.id === "player")!.data).toEqual(player());

    // The game walks left with the right row mirrored around the origin.
    const images = (id: string): LoadedImage | undefined => {
      const asset = reloaded.project.assets?.data.images.find((i) => i.id === id);
      return asset ? { asset, size: id === "hero_walk" ? size : { w: 640, h: 400 } } : undefined;
    };
    const s = new Session(reloaded.project, images);
    const start = s.world.player.pos;
    s.world.walkTo([start[0] - 100, start[1]]);
    s.tick(1 / 60);
    const sprite = s.world.drawList().find((d) => d.id === "player")!;
    const feet = s.world.player.pos;
    const scale = sprite.dest.w / SHEET.cellWidth;
    expect(s.world.player.facing).toBe("left");
    expect(sprite.mirror).toBe(true);
    expect(sprite.src.y).toBe(ROWS.right * SHEET.cellHeight);
    // Mirrored, the origin's x flips inside the frame: 32 - 16 = 16 from the left edge, at the feet.
    expect(sprite.dest.x + (SHEET.cellWidth - 16) * scale).toBeCloseTo(feet[0]);
    expect(sprite.dest.y + 47 * scale).toBeCloseTo(feet[1]);

    // An off-centre origin shows the flip: x 12 lands 20 px from the left edge when mirrored.
    act("Set origin", (p) => setOrigin(p, "hero_walk", size, [12, 47]));
    const s2 = new Session(editor.project, (id) => {
      const asset = editor.project.assets?.data.images.find((i) => i.id === id);
      return asset ? { asset, size: id === "hero_walk" ? size : { w: 640, h: 400 } } : undefined;
    });
    s2.world.walkTo([s2.world.player.pos[0] - 100, s2.world.player.pos[1]]);
    s2.tick(1 / 60);
    const left = s2.world.drawList().find((d) => d.id === "player")!;
    const k = left.dest.w / SHEET.cellWidth;
    expect(left.dest.x + 20 * k).toBeCloseTo(s2.world.player.pos[0]);
  });
});
