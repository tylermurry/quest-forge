import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, resolveStyle, saveProject, type FrameInsets } from "@questforge/schema";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { BUILT_IN_FRAME, applyBuiltInFrame, narrationOf, setFrameScale, setNarrationCenter, setNarrationTop, setNarrationWidth, setSpeechNameColor, borderOf, dragGuide, imageOptions, isBuiltInFrame, insetWarnings, maxBorder, nudgeGuide, setFrameImage, setFrameInsets, toImagePixels, uniformInsets } from "../src/model/style.ts";
import { frameScale, layoutSample, SAMPLES } from "../src/model/stylePreview.ts";
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
    const picked = setFrameInsets(setFrameImage(p0, "sharedFrame", "garden_bg"), "sharedFrame", insets(4, 4, 6, 6));
    expect(resolveStyle(picked.game!.data.style).sharedFrame).toEqual({ image: "garden_bg", insets: insets(4, 4, 6, 6), scale: 16 });
    const other = setFrameImage(picked, "sharedFrame", "palm_img");
    expect(other.game!.data.style!.sharedFrame).toEqual({ image: "palm_img", insets: insets(4, 4, 6, 6) });
    const cleared = setFrameImage(other, "sharedFrame", undefined);
    expect(cleared.game!.data.style!.sharedFrame).toEqual({ insets: insets(4, 4, 6, 6) });
    // Nothing left to say: no style at all, so the legacy look returns.
    const bare = setFrameInsets(cleared, "sharedFrame", ZERO);
    expect(bare.game!.data.style).toBeUndefined();
  });

  it("refuses an image that isn't in the library and borders that aren't whole pixels", async () => {
    const p0 = await m1Project();
    expect(() => setFrameImage(p0, "sharedFrame", "nope")).toThrow(CommandError);
    expect(() => setFrameInsets(p0, "sharedFrame", insets(-1, 0, 0, 0))).toThrow(CommandError);
    expect(() => setFrameInsets(p0, "sharedFrame", insets(1.5, 0, 0, 0))).toThrow(CommandError);
  });

  it("the same commands edit the icon bar's frame without touching the shared one or the bar's other settings", async () => {
    const p0 = setFrameImage(await m1Project(), "sharedFrame", "garden_bg");
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

describe("built-in frame", () => {
  const BYTES = new Uint8Array([0xff, 0xd8, 0xff]);

  it("adds the picture to the Styling folder and picks it with its borders", async () => {
    const p0 = await m1Project();
    expect(isBuiltInFrame(p0)).toBe(false);
    const p = applyBuiltInFrame(p0, BYTES);
    expect(p.assets!.data.images.find((i) => i.path === BUILT_IN_FRAME.path)).toEqual({ id: "frame", path: "assets/images/Styling/frame.jpg" });
    expect(p.pendingFiles[BUILT_IN_FRAME.path]).toBe(BYTES);
    expect(p.game!.data.style!.sharedFrame).toEqual({ image: "frame", insets: insets(12, 12, 12, 12) });
    expect(isBuiltInFrame(p)).toBe(true);
    // Another picture, then back: the one already in the library is reused, not added again.
    const back = applyBuiltInFrame(setFrameImage(p, "sharedFrame", "garden_bg"), BYTES);
    expect(isBuiltInFrame(back)).toBe(true);
    expect(back.assets!.data.images.filter((i) => i.path === BUILT_IN_FRAME.path)).toHaveLength(1);
  });

  it("gets a fresh ID when another image is already called frame", async () => {
    const p0 = await m1Project();
    const taken = { ...p0, assets: { ...p0.assets!, data: { ...p0.assets!.data, images: [...p0.assets!.data.images, { id: "frame", path: "assets/images/other.png" }] } } };
    const p = applyBuiltInFrame(taken, BYTES);
    expect(p.game!.data.style!.sharedFrame!.image).toBe("frame_2");
    expect(isBuiltInFrame(p)).toBe(true);
  });
});

describe("scale, narration and name color commands", () => {
  it("sets the frame scale within 8 to 64 px, keeping the picture and borders", async () => {
    const p = setFrameScale(setFrameInsets(setFrameImage(await m1Project(), "sharedFrame", "garden_bg"), "sharedFrame", insets(6, 6, 6, 6)), 32);
    expect(p.game!.data.style!.sharedFrame).toEqual({ image: "garden_bg", insets: insets(6, 6, 6, 6), scale: 32 });
    expect(resolveStyle(p.game!.data.style).sharedFrame.scale).toBe(32);
    for (const bad of [7, 65, 12.5]) expect(() => setFrameScale(p, bad)).toThrow(CommandError);
  });

  it("places narration: top, centre (which keeps the top for later) and width", async () => {
    const p0 = await m1Project();
    expect(narrationOf(p0)).toBeUndefined();
    const top = setNarrationTop(p0, 120);
    expect(narrationOf(top)).toEqual({ top: 120 });
    const centred = setNarrationCenter(setNarrationWidth(top, 80), true);
    expect(narrationOf(centred)).toEqual({ top: 120, width: 80, center: true });
    expect(resolveStyle(centred.game!.data.style).narration).toEqual({ top: "center", width: 80 });
    expect(narrationOf(setNarrationCenter(centred, false))).toEqual({ top: 120, width: 80 });
    expect(() => setNarrationTop(p0, -1)).toThrow(CommandError);
    expect(() => setNarrationTop(p0, 401)).toThrow(CommandError);
    expect(() => setNarrationWidth(p0, 19)).toThrow(CommandError);
    expect(() => setNarrationWidth(p0, 101)).toThrow(CommandError);
  });

  it("sets one name color for every speaker, without touching the other sections", async () => {
    const p = setSpeechNameColor(await m1Project(), "#AABBCC");
    expect(p.game!.data.style).toEqual({ speech: { name: "#aabbcc" } });
    expect(() => setSpeechNameColor(p, "gold")).toThrow(CommandError);
  });
});

describe("guide math", () => {
  const all = (n: number) => insets(n, n, n, n);

  it("a drag on any guide sets all four borders from the pointer, rounded and held inside the image", () => {
    expect(dragGuide("left", { x: 10.4, y: 0 }, SIZE)).toEqual(all(10));
    expect(dragGuide("right", { x: 40, y: 0 }, SIZE)).toEqual(all(8));
    expect(dragGuide("top", { x: 0, y: 5 }, SIZE)).toEqual(all(5));
    expect(dragGuide("bottom", { x: 0, y: 30 }, SIZE)).toEqual(all(2));
    expect(dragGuide("left", { x: -20, y: 0 }, SIZE)).toEqual(ZERO);
    expect(dragGuide("top", { x: 0, y: Number.NaN }, SIZE)).toEqual(ZERO);
  });

  it("the border never leaves less than one pixel of centre, and arrow nudges follow the screen direction", () => {
    // 48×32: the short side leaves 15 + 1 + 15... rounded down, so at most 15.
    expect(maxBorder(SIZE)).toBe(15);
    expect(dragGuide("left", { x: 500, y: 0 }, SIZE)).toEqual(all(15));
    expect(uniformInsets(30, SIZE)).toEqual(all(15));
    expect(uniformInsets(4.6, SIZE)).toEqual(all(5));
    expect(nudgeGuide(all(3), "left", 1, SIZE)).toEqual(all(4));
    expect(nudgeGuide(all(3), "right", 1, SIZE)).toEqual(all(2));
    expect(nudgeGuide(all(3), "bottom", -1, SIZE)).toEqual(all(4));
    expect(nudgeGuide(ZERO, "top", -1, SIZE)).toEqual(ZERO);
  });

  it("a frame saved with unequal borders reads as its thickest, and the next move makes them equal", () => {
    expect(borderOf(insets(3, 5, 0, 2))).toBe(5);
    expect(nudgeGuide(insets(3, 5, 0, 2), "left", 1, SIZE)).toEqual(all(6));
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
    editor.apply("Pick shared frame image", (p) => setFrameImage(p, "sharedFrame", "garden_bg"));
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
    editor.apply("Pick", (p) => setFrameImage(p, "sharedFrame", "garden_bg"));
    editor.apply("Borders", (p) => setFrameInsets(p, "sharedFrame", insets(4, 5, 6, 7)));
    await editor.flush();
    const reopened = await Editor.open({ fs }, { autosave: false });
    expect(resolveStyle(reopened.project.game!.data.style).sharedFrame).toEqual({ image: "garden_bg", insets: insets(4, 5, 6, 7), scale: 16 });
    reopened.apply("Clear", (p) => setFrameImage(p, "sharedFrame", undefined));
    expect(reopened.project.assets!.data.images.some((i) => i.id === "garden_bg")).toBe(true);
    await reopened.flush();
    const again = (await loadProject(fs)).project;
    expect(again.game!.data.style?.sharedFrame).toEqual({ insets: insets(4, 5, 6, 7) });
  });
});

describe("preview layout", () => {
  const measure = (s: string) => s.length * 6;
  const text = { size: 10 };
  const PLACE = { top: 50, width: 60 } as const;
  const look = (i: FrameInsets, scale = 16) => ({ insets: i, scale });

  it("lays out every sample inside the 640×400 screen without negative sizes", () => {
    for (const s of SAMPLES) {
      if (s.id === "iconBar") continue;
      const l = layoutSample(s.id, look(insets(8, 8, 8, 8)), PLACE, text, measure);
      expect(l.frame.w).toBeGreaterThan(0);
      expect(l.frame.h).toBeGreaterThan(0);
      expect(l.inner.w).toBeGreaterThanOrEqual(0);
      expect(l.inner.h).toBeGreaterThanOrEqual(0);
      expect(l.items.length).toBeGreaterThan(0);
    }
  });

  it("narration is the set percentage of the screen wide, and longer narration only makes the panel taller", () => {
    const short = layoutSample("narrationShort", look(ZERO), PLACE, text, measure).frame;
    const long = layoutSample("narrationLong", look(ZERO), PLACE, text, measure).frame;
    expect(short.w).toBe(384);
    expect(long.w).toBe(384);
    expect(long.h).toBeGreaterThan(short.h);
    expect(layoutSample("narrationShort", look(ZERO), { top: 50, width: 25 }, text, measure).frame.w).toBe(160);
    expect(layoutSample("narrationShort", look(ZERO), { top: 50, width: 100 }, text, measure).frame).toMatchObject({ x: 0, w: 640 });
  });

  it("narration sits `top` pixels down, or in the middle when centred, and stays on the screen", () => {
    expect(layoutSample("narrationShort", look(ZERO), PLACE, text, measure).frame.y).toBe(50);
    expect(layoutSample("narrationShort", look(ZERO), { top: 0, width: 60 }, text, measure).frame.y).toBe(0);
    const centred = layoutSample("narrationShort", look(ZERO), { top: "center", width: 60 }, text, measure).frame;
    expect(centred.y).toBe(Math.round((400 - centred.h) / 2));
    const low = layoutSample("narrationShort", look(ZERO), { top: 400, width: 60 }, text, measure).frame;
    expect(low.y + low.h).toBe(400);
    // Speech, the choices and the inventory use the same position and width.
    for (const sample of ["speech", "choices", "inventory"] as const) {
      const f = layoutSample(sample, look(ZERO), { top: 70, width: 50 }, text, measure).frame;
      expect([f.y, f.w, f.x]).toEqual([70, 320, 160]);
    }
  });

  it("the drawn borders are the only padding: content starts right inside them", () => {
    const none = layoutSample("speech", look(ZERO), PLACE, text, measure);
    expect(none.inner).toEqual(none.frame);
    // 10 px borders drawn at the default 16.
    const l = layoutSample("speech", look(insets(10, 10, 10, 10)), PLACE, text, measure);
    expect(l.inner.x - l.frame.x).toBe(16);
    expect(l.inner.y - l.frame.y).toBe(16);
  });

  it("Scale sets how thick the thickest border is drawn, whatever the picture's size", () => {
    expect(frameScale(look(insets(12, 12, 12, 12)))).toBe(16 / 12);
    expect(frameScale(look(insets(48, 48, 24, 24), 8))).toBe(8 / 48);
    expect(frameScale(look(ZERO, 64))).toBe(1);
    const l = layoutSample("speech", look(insets(48, 48, 24, 24), 24), PLACE, text, measure);
    expect(l.scale).toBe(0.5);
    expect(l.inner.x - l.frame.x).toBe(24);
    expect(l.inner.y - l.frame.y).toBe(12);
  });
});
