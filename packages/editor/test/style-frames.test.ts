import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, resolveStyle, saveProject, type FrameInsets } from "@questforge/schema";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { dragGuide, imageOptions, insetWarnings, maxInset, nudgeGuide, setFrameImage, setFrameInsets, setSharedFrameImage, toImagePixels, withSide } from "../src/model/style.ts";
import { layoutSample, SAMPLES, SHAPES } from "../src/model/stylePreview.ts";
import { m1Project } from "./support/fixtures.ts";

const SIZE = { width: 48, height: 32 };
const ZERO: FrameInsets = { left: 0, right: 0, top: 0, bottom: 0 };
const insets = (left: number, right: number, top: number, bottom: number): FrameInsets => ({ left, right, top, bottom });

async function open() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  return { fs, editor: await Editor.open({ fs }, { autosave: false }) };
}
const frame = (e: Editor) => e.project.game!.data.style?.sharedFrame;

describe("frame commands", () => {
  it("picks, keeps the borders on a new image, and clears back to the built-in look", async () => {
    const p0 = await m1Project();
    expect(p0.game!.data.style).toBeUndefined();
    const picked = setFrameInsets(setSharedFrameImage(p0, "garden_bg"), "sharedFrame", insets(4, 4, 6, 6));
    expect(resolveStyle(picked.game!.data.style).sharedFrame).toEqual({ image: "garden_bg", insets: insets(4, 4, 6, 6) });
    const other = setSharedFrameImage(picked, "palm_img");
    expect(other.game!.data.style!.sharedFrame).toEqual({ image: "palm_img", insets: insets(4, 4, 6, 6) });
    const cleared = setSharedFrameImage(other, undefined);
    expect(cleared.game!.data.style!.sharedFrame).toEqual({ insets: insets(4, 4, 6, 6) });
    // Nothing left to say: no style at all, so the legacy look returns.
    const bare = setFrameInsets(cleared, "sharedFrame", ZERO);
    expect(bare.game!.data.style).toBeUndefined();
  });

  it("refuses an image that isn't in the library and borders that aren't whole pixels", async () => {
    const p0 = await m1Project();
    expect(() => setSharedFrameImage(p0, "nope")).toThrow(CommandError);
    expect(() => setFrameInsets(p0, "sharedFrame", insets(-1, 0, 0, 0))).toThrow(CommandError);
    expect(() => setFrameInsets(p0, "sharedFrame", insets(1.5, 0, 0, 0))).toThrow(CommandError);
  });

  it("the same commands edit the icon bar's frame without touching the shared one or the bar's other settings", async () => {
    const p0 = setSharedFrameImage(await m1Project(), "garden_bg");
    const p1 = setFrameInsets(setFrameImage(p0, "iconBar", "palm_img"), "iconBar", insets(2, 2, 2, 2));
    const style = p1.game!.data.style!;
    expect(style.sharedFrame).toEqual({ image: "garden_bg" });
    expect(style.iconBar).toEqual({ frame: { image: "palm_img", insets: insets(2, 2, 2, 2) } });
    const p2 = setFrameImage(setFrameInsets(p1, "iconBar", ZERO), "iconBar", undefined);
    expect(p2.game!.data.style).toEqual({ sharedFrame: { image: "garden_bg" } });
  });

  it("lists the project's images for the picker", async () => {
    expect(imageOptions(await m1Project()).map((o) => o.id)).toContain("garden_bg");
  });
});

describe("guide math", () => {
  it("a drag sets the border from the pointer, rounded and held inside the image", () => {
    expect(dragGuide(ZERO, "left", { x: 10.4, y: 0 }, SIZE)).toEqual(insets(10, 0, 0, 0));
    expect(dragGuide(ZERO, "right", { x: 40, y: 0 }, SIZE)).toEqual(insets(0, 8, 0, 0));
    expect(dragGuide(ZERO, "top", { x: 0, y: 5 }, SIZE)).toEqual(insets(0, 0, 5, 0));
    expect(dragGuide(ZERO, "bottom", { x: 0, y: 30 }, SIZE)).toEqual(insets(0, 0, 0, 2));
    expect(dragGuide(insets(5, 0, 0, 0), "left", { x: -20, y: 0 }, SIZE).left).toBe(0);
    expect(dragGuide(insets(0, 10, 0, 0), "left", { x: 500, y: 0 }, SIZE).left).toBe(38);
    expect(dragGuide(ZERO, "top", { x: 0, y: Number.NaN }, SIZE).top).toBe(0);
  });

  it("guides can meet but not cross, and arrow nudges follow the screen direction", () => {
    expect(maxInset("left", insets(0, 20, 0, 0), SIZE)).toBe(28);
    expect(nudgeGuide(insets(3, 5, 0, 0), "left", 1, SIZE).left).toBe(4);
    expect(nudgeGuide(insets(3, 5, 0, 0), "right", 1, SIZE).right).toBe(4);
    expect(nudgeGuide(insets(3, 5, 0, 0), "right", -1, SIZE).right).toBe(6);
    expect(nudgeGuide(insets(0, 0, 0, 0), "top", -1, SIZE).top).toBe(0);
    expect(withSide(insets(0, 40, 0, 0), "left", 30, SIZE).left).toBe(8);
  });

  it("turns a pointer position into image pixels through the shown box", () => {
    const box = { left: 100, top: 50, width: 96, height: 64 };
    expect(toImagePixels({ x: 148, y: 82 }, box, SIZE)).toEqual({ x: 24, y: 16 });
    expect(toImagePixels({ x: 1, y: 1 }, { ...box, width: 0 }, SIZE)).toEqual({ x: 0, y: 0 });
  });
});

describe("inset warnings", () => {
  it("are empty while a centre remains and explain the empty middle when none does", () => {
    expect(insetWarnings(insets(10, 10, 8, 8), SIZE)).toEqual([]);
    const w = insetWarnings(insets(24, 24, 8, 8), SIZE);
    expect(w[0]).toMatch(/left and right borders/);
    expect(w.at(-1)).toMatch(/leaves the middle of the panel empty/);
    expect(insetWarnings(insets(0, 0, 16, 16), SIZE)[0]).toMatch(/top and bottom borders/);
  });
});

describe("history and saving", () => {
  it("a drag committed as one apply is one undo step; typing in one box merges until blur", async () => {
    const { editor } = await open();
    editor.apply("Pick shared frame image", (p) => setSharedFrameImage(p, "garden_bg"));
    editor.history.breakMerge();
    // A guide drag: many previews (not applied), then one commit.
    const drag = insets(12, 0, 0, 0);
    editor.apply("Move shared frame guide", (p) => setFrameInsets(p, "sharedFrame", drag));
    expect(frame(editor)?.insets).toEqual(drag);
    editor.undo();
    expect(frame(editor)).toEqual({ image: "garden_bg" });
    editor.redo();
    expect(frame(editor)?.insets).toEqual(drag);
    // Typing "1", "12", "120" in the left box then leaving it.
    for (const n of [1, 12, 20]) editor.apply("Change shared frame border", (p) => setFrameInsets(p, "sharedFrame", insets(n, 0, 0, 0)), "style:sharedFrame:left");
    editor.history.breakMerge();
    editor.apply("Change shared frame border", (p) => setFrameInsets(p, "sharedFrame", insets(20, 3, 0, 0)), "style:sharedFrame:right");
    editor.undo();
    expect(frame(editor)?.insets).toEqual(insets(20, 0, 0, 0));
    editor.undo();
    expect(frame(editor)?.insets).toEqual(drag);
  });

  it("persists the image and borders across save and reopen, and the image stays in the library when cleared", async () => {
    const { fs, editor } = await open();
    editor.apply("Pick", (p) => setSharedFrameImage(p, "garden_bg"));
    editor.apply("Borders", (p) => setFrameInsets(p, "sharedFrame", insets(4, 5, 6, 7)));
    await editor.flush();
    const reopened = await Editor.open({ fs }, { autosave: false });
    expect(resolveStyle(reopened.project.game!.data.style).sharedFrame).toEqual({ image: "garden_bg", insets: insets(4, 5, 6, 7) });
    reopened.apply("Clear", (p) => setSharedFrameImage(p, undefined));
    expect(reopened.project.assets!.data.images.some((i) => i.id === "garden_bg")).toBe(true);
    await reopened.flush();
    const again = (await loadProject(fs)).project;
    expect(again.game!.data.style?.sharedFrame).toEqual({ insets: insets(4, 5, 6, 7) });
  });
});

describe("preview layout", () => {
  const measure = (s: string) => s.length * 6;
  const text = { size: 10 };

  it("lays out every sample at every shape inside the 640×400 screen without negative sizes", () => {
    for (const s of SAMPLES) {
      for (const shape of SHAPES) {
        const l = layoutSample(s.id, shape.id, insets(8, 8, 8, 8), text, measure);
        expect(l.frame.w).toBeGreaterThan(0);
        expect(l.frame.h).toBeGreaterThan(0);
        expect(l.inner.w).toBeGreaterThanOrEqual(0);
        expect(l.inner.h).toBeGreaterThanOrEqual(0);
        expect(l.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("fixed shapes are narrow, wide, tall and short, and longer narration makes a taller fitted panel", () => {
    const at = (shape: (typeof SHAPES)[number]["id"]) => layoutSample("narrationShort", shape, ZERO, text, measure).frame;
    expect(at("narrow").w).toBeLessThan(at("tall").w + 1);
    expect(at("wide").w).toBeGreaterThan(at("narrow").w * 2);
    expect(at("tall").h).toBeGreaterThan(at("short").h * 4);
    const short = layoutSample("narrationShort", "fit", ZERO, text, measure).frame;
    const long = layoutSample("narrationLong", "fit", ZERO, text, measure).frame;
    expect(long.h).toBeGreaterThan(short.h);
  });

  it("borders push the content inward so it stays inside the frame art", () => {
    const l = layoutSample("speech", "fit", insets(20, 20, 20, 20), text, measure);
    expect(l.inner.x - l.frame.x).toBe(26);
    expect(l.inner.y - l.frame.y).toBe(26);
  });
});
