import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, resolveStyle, saveProject, SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { fontOptions, setSharedFrameImage, setTypographyColor, setTypographyFamily, setTypographyFont, setTypographySize, typographyOf } from "../src/model/style.ts";
import { layoutSample, TYPOGRAPHY_SAMPLES } from "../src/model/stylePreview.ts";
import { m1Project } from "./support/fixtures.ts";

// Styling > Typography: the commands, their undo steps, saving, and the preview layout at large sizes.

async function withFont() {
  const p = await m1Project();
  return { ...p, assets: { ...p.assets!, data: { ...p.assets!.data, fonts: [{ id: "title_font", path: "assets/fonts/title_font.woff2" }] } } };
}
async function open() {
  const fs = new MemoryFs();
  const project = await withFont();
  await saveProject(fs, { ...project, saved: {}, files: [], savedFolders: [] });
  return { fs, editor: await Editor.open({ fs }, { autosave: false }) };
}

describe("typography commands", () => {
  it("the first edit makes the section; a game that was never set stays on the legacy look", async () => {
    const p0 = await withFont();
    expect(p0.game!.data.style).toBeUndefined();
    expect(resolveStyle(p0.game!.data.style).typography).toMatchObject({ size: 10, family: "monospace" });
    const p1 = setTypographySize(p0, 20);
    expect(p1.game!.data.style).toEqual({ typography: { size: 20 } });
    expect(resolveStyle(p1.game!.data.style).typography).toMatchObject({ size: 20, color: "#ffffff", family: "monospace" });
  });

  it("a built-in family and a custom font replace each other, and the size and colour stay", async () => {
    const p = setTypographyColor(setTypographySize(await withFont(), 18), "#FFCC00");
    const serif = setTypographyFamily(p, "serif");
    expect(typographyOf(serif)).toEqual({ size: 18, color: "#ffcc00", family: "serif" });
    const custom = setTypographyFont(serif, "title_font");
    expect(typographyOf(custom)).toEqual({ size: 18, color: "#ffcc00", font: "title_font" });
    expect(typographyOf(setTypographyFamily(custom, "sans-serif"))).toEqual({ size: 18, color: "#ffcc00", family: "sans-serif" });
  });

  it("leaves the shared frame and the other sections alone", async () => {
    const p = setTypographySize(setSharedFrameImage(await withFont(), "garden_bg"), 14);
    expect(p.game!.data.style).toEqual({ sharedFrame: { image: "garden_bg" }, typography: { size: 14 } });
  });

  it("refuses a font that isn't in the library, a size out of range or fractional, and a bad colour", async () => {
    const p = await withFont();
    expect(() => setTypographyFont(p, "nope")).toThrow(CommandError);
    for (const size of [5, 73, 12.5, Number.NaN]) expect(() => setTypographySize(p, size)).toThrow(CommandError);
    for (const color of ["red", "#fff", "#12345g", ""]) expect(() => setTypographyColor(p, color)).toThrow(CommandError);
    expect(setTypographySize(p, 6).game!.data.style!.typography!.size).toBe(6);
    expect(setTypographySize(p, 72).game!.data.style!.typography!.size).toBe(72);
  });

  it("lists the project's fonts for the picker", async () => {
    expect(fontOptions(await withFont()).map((o) => o.id)).toEqual(["title_font"]);
    expect(fontOptions(await m1Project())).toEqual([]);
  });
});

describe("typography through the editor", () => {
  it("each change is one undo step, typing the size merges, and it saves to game.yaml", async () => {
    const { fs, editor } = await open();
    const typo = () => editor.project.game!.data.style?.typography;
    editor.apply("Change text colour", (q) => setTypographyColor(q, "#ff0000"));
    editor.apply("Change text size", (q) => setTypographySize(q, 20), "style:typography:size");
    editor.apply("Change text size", (q) => setTypographySize(q, 24), "style:typography:size");
    expect(typo()).toEqual({ color: "#ff0000", size: 24 });
    editor.history.breakMerge();
    editor.apply("Pick font", (q) => setTypographyFont(q, "title_font"));
    expect(typo()).toEqual({ color: "#ff0000", size: 24, font: "title_font" });
    editor.undo();
    expect(typo()).toEqual({ color: "#ff0000", size: 24 });
    editor.undo();
    expect(typo()).toEqual({ color: "#ff0000" });
    editor.undo();
    expect(editor.project.game!.data.style).toBeUndefined();
    editor.redo();
    editor.redo();
    editor.redo();
    await editor.flush();
    const saved = (await loadProject(fs)).project;
    expect(saved.game!.data.style?.typography).toEqual({ color: "#ff0000", size: 24, font: "title_font" });
  });
});

describe("typography preview layout", () => {
  const measure = (s: string, size: number) => s.length * size * 0.6;
  const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };

  it("keeps the panel on the screen at any size, shrinking the text rather than running off", () => {
    for (const size of [10, 16, 32, 72]) {
      for (const sample of TYPOGRAPHY_SAMPLES) {
        const l = layoutSample(sample.id, "fit", { left: 8, right: 8, top: 8, bottom: 8 }, { size }, measure);
        expect(l.frame.h).toBeLessThanOrEqual(SCENE_HEIGHT);
        expect(l.frame.w).toBeLessThanOrEqual(SCENE_WIDTH);
        expect(l.size).toBeLessThanOrEqual(size);
      }
    }
    expect(layoutSample("narrationLong", "fit", ZERO, { size: 72 }, measure).size).toBeLessThan(72);
    expect(layoutSample("narrationShort", "fit", ZERO, { size: 16 }, measure).size).toBe(16);
  });

  it("larger text makes a larger panel, and offers narration, long narration, speech and choices", () => {
    const small = layoutSample("narrationLong", "fit", ZERO, { size: 10 }, measure).frame;
    const big = layoutSample("narrationLong", "fit", ZERO, { size: 20 }, measure).frame;
    expect(big.h).toBeGreaterThan(small.h);
    expect(TYPOGRAPHY_SAMPLES.map((s) => s.id)).toEqual(["narrationShort", "narrationLong", "speech", "choices"]);
  });
});
