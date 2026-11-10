import { MemoryFs, saveProject, serialize, validateProject, type Project } from "@questforge/schema";
import { describe, expect, it } from "vitest";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { cellAt, effectiveOrigin, fitZoom, formatFrames, frameCountOf, originAt, parseFrames, setOrigin, sheetFromCells, sheetFromGrid, sliceImage } from "../src/model/sprites.ts";
import { m1Project } from "./support/fixtures.ts";

// Spritesheet slicing and origins.

const img = (p: Project, id: string) => p.assets!.data.images.find((i) => i.id === id)!;
const SHEET = { w: 256, h: 192 }; // an 8×4 sheet of 32×48 frames

describe("slicing", () => {
  it("fills all four sheet fields from rows × columns", () => {
    expect(sheetFromGrid(SHEET, 8, 4)).toEqual({ columns: 8, rows: 4, cellWidth: 32, cellHeight: 48 });
  });

  it("fills all four sheet fields from a cell size", () => {
    expect(sheetFromCells(SHEET, 32, 48)).toEqual({ columns: 8, rows: 4, cellWidth: 32, cellHeight: 48 });
  });

  it("ignores leftover pixels when the size doesn't divide evenly", () => {
    expect(sheetFromGrid({ w: 100, h: 50 }, 3, 2)).toEqual({ columns: 3, rows: 2, cellWidth: 33, cellHeight: 25 });
    expect(sheetFromCells({ w: 100, h: 50 }, 30, 20)).toEqual({ columns: 3, rows: 2, cellWidth: 30, cellHeight: 20 });
  });

  it("refuses sizes that can't make a frame, in plain English", () => {
    expect(() => sheetFromGrid({ w: 4, h: 4 }, 8, 1)).toThrow("The image is 4×4 pixels, too small for 8 × 1 frames.");
    expect(() => sheetFromGrid(SHEET, 0, 4)).toThrow(CommandError);
    expect(() => sheetFromCells(SHEET, 300, 10)).toThrow("A 300×10 frame doesn't fit in the 256×192 image.");
    expect(() => sheetFromCells(SHEET, 2.5, 10)).toThrow("Frame width must be a whole number of at least 1.");
  });

  it("writes the sheet canonically and keeps an origin that still fits", async () => {
    const p = await m1Project();
    const next = sliceImage(p, "hero_sheet", { w: 128, h: 96 }, { columns: 2, rows: 2, cellWidth: 64, cellHeight: 48 });
    expect(serialize(img(next, "hero_sheet"))).toBe(
      "id: hero_sheet\npath: assets/images/characters/hero_sheet.png\nsheet:\n  columns: 2\n  rows: 2\n  cellWidth: 64\n  cellHeight: 48\norigin: [16, 47]\n",
    );
    expect(img(p, "hero_sheet").sheet!.columns).toBe(4); // immutable
  });

  it("clears an origin that would fall outside the new frame", async () => {
    const p = await m1Project();
    const next = sliceImage(p, "hero_sheet", { w: 128, h: 96 }, { columns: 8, rows: 4, cellWidth: 16, cellHeight: 24 });
    expect(img(next, "hero_sheet").origin).toBeUndefined();
    expect(validateProject(next).filter((x) => x.code === "origin_outside_frame")).toEqual([]);
  });

  it("keeps a given origin when it fits again, e.g. after typing through a small size", async () => {
    const p = await m1Project();
    const size = { w: 128, h: 144 };
    const tiny = sliceImage(p, "hero_sheet", size, sheetFromCells(size, 1, 48));
    expect(img(tiny, "hero_sheet").origin).toBeUndefined();
    const back = sliceImage(tiny, "hero_sheet", size, sheetFromCells(size, 16, 48), [16, 47]);
    expect(img(back, "hero_sheet").origin).toEqual([16, 47]);
    expect(img(sliceImage(tiny, "hero_sheet", size, sheetFromCells(size, 8, 48), [16, 47]), "hero_sheet").origin).toBeUndefined();
  });

  it("makes an image a single frame again", async () => {
    const p = await m1Project();
    const next = sliceImage(p, "hero_sheet", { w: 128, h: 96 }, null);
    expect(img(next, "hero_sheet")).toEqual({ id: "hero_sheet", path: "assets/images/characters/hero_sheet.png", origin: [16, 47] });
    expect(frameCountOf(img(next, "hero_sheet"))).toBe(1);
    // The character's walk frames are now out of range: shown as problems, not refused.
    expect(validateProject(next).some((x) => x.code === "frame_out_of_range")).toBe(true);
  });

  it("refuses an unknown image", async () => {
    const p = await m1Project();
    expect(() => sliceImage(p, "nope", SHEET, null)).toThrow("There's no image with ID nope.");
  });
});

describe("origin", () => {
  it("rounds a preview click to the nearest pixel corner inside the frame", () => {
    expect(originAt([15.6, 46.2], { w: 32, h: 48 })).toEqual([16, 46]);
    expect(originAt([-3, 60], { w: 32, h: 48 })).toEqual([0, 48]);
  });

  it("sets and clears the origin, defaulting to bottom-centre", async () => {
    const p = await m1Project();
    const size = { w: 128, h: 96 };
    const set = setOrigin(p, "gardener_sheet", size, [10, 40]);
    expect(img(set, "gardener_sheet").origin).toEqual([10, 40]);
    expect(Object.keys(img(set, "gardener_sheet"))).toEqual(["id", "path", "sheet", "origin"]);
    const cleared = setOrigin(set, "gardener_sheet", size, null);
    expect(img(cleared, "gardener_sheet").origin).toBeUndefined();
    expect(effectiveOrigin(img(cleared, "gardener_sheet"), size)).toEqual([16, 48]);
    expect(() => setOrigin(p, "gardener_sheet", size, [33, 0])).toThrow("The origin must be inside the 32×48 frame.");
  });

  it("is one undo step through the Editor", async () => {
    const fs = new MemoryFs();
    await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
    const editor = await Editor.open({ fs });
    editor.apply("Set origin", (p) => setOrigin(p, "hero_sheet", { w: 128, h: 96 }, [12, 40]));
    expect(img(editor.project, "hero_sheet").origin).toEqual([12, 40]);
    editor.undo();
    expect(img(editor.project, "hero_sheet").origin).toEqual([16, 47]);
  });
});

describe("sheet layout helpers", () => {
  it("finds the cell under a point, row by row", async () => {
    const hero = img(await m1Project(), "hero_sheet"); // 4 × 2 cells of 32×48
    const size = { w: 128, h: 96 };
    expect(cellAt(hero, size, [0, 0])).toBe(0);
    expect(cellAt(hero, size, [33, 50])).toBe(5);
    expect(cellAt(hero, size, [128, 0])).toBe(null);
    expect(cellAt({ ...hero, sheet: undefined }, size, [100, 90])).toBe(0);
  });

  it("zooms by whole multiples, or shrinks to fit", () => {
    expect(fitZoom({ w: 32, h: 48 }, { w: 200, h: 200 })).toBe(4);
    expect(fitZoom({ w: 32, h: 48 }, { w: 1000, h: 1000 })).toBe(8);
    expect(fitZoom({ w: 1280, h: 400 }, { w: 640, h: 640 })).toBe(0.5);
  });
});

describe("frames as text", () => {
  it("parses lists and runs either way, within the frame count", () => {
    expect(parseFrames("0-3, 6", 8)).toEqual([0, 1, 2, 3, 6]);
    expect(parseFrames("3-1", 8)).toEqual([3, 2, 1]);
    expect(parseFrames(" 5 ", 8)).toEqual([5]);
    expect(parseFrames("8", 8)).toBe(null);
    expect(parseFrames("", 8)).toBe(null);
    expect(parseFrames("1,,2", 8)).toBe(null);
    expect(parseFrames("a", 8)).toBe(null);
  });

  it("formats runs of three or more as ranges, round-tripping", () => {
    expect(formatFrames([0, 1, 2, 3, 6])).toBe("0-3, 6");
    expect(formatFrames([4, 5])).toBe("4, 5");
    expect(formatFrames([3, 2, 1, 0])).toBe("3-0");
    expect(formatFrames([1, 1, 1])).toBe("1, 1, 1");
    for (const f of [[0, 1, 2, 3, 6], [4, 5], [3, 2, 1, 0], [7]]) expect(parseFrames(formatFrames(f), 8)).toEqual(f);
  });
});
