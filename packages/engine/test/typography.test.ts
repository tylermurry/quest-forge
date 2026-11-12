import { describe, expect, it } from "vitest";
import { SCENE_HEIGHT, SCENE_WIDTH, type GameStyle } from "@questforge/schema";
import { MemoryStore, SaveSlots, clampTextScale, readSettings, settingsKey, writeSettings } from "../src/saves.ts";
import { Session } from "../src/session.ts";
import type { Rect } from "../src/sprite.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { canvasMeasure, drawText } from "../src/ui/draw.ts";
import { boxWidth, layoutTextBox, narrateBox, sayBox } from "../src/ui/textbox.ts";
import { fontOf, lineFor, scaledSize, shrinkToFit, textStyle } from "../src/ui/typography.ts";
import type { Vec } from "../src/vec.ts";
import { testImages, testProject } from "./support/project.ts";

// Game typography: the effective text style, the legacy look, the player's Text Size, and reflow.

/** Monospace-like: every character is 0.6 of the size wide, whatever the size. */
const mono = (s: string, size: number) => s.length * size * 0.6;
/** What the old fixed 10 px measurer (6 px a character) gives. */
const sixPx = (s: string) => s.length * 6;
const center = (r: Rect): Vec => [r.x + r.w / 2, r.y + r.h / 2];
const tap = (ui: PlayerUi, p: Vec) => {
  ui.pointerDown(p, "touch");
  ui.tick(1 / 60);
  ui.pointerUp(p, "touch");
};
const button = <Id extends string>(list: { id: Id; rect: Rect }[], id: Id) => center(list.find((b) => b.id === id)!.rect);
const typed = (typography: NonNullable<GameStyle["typography"]>): GameStyle => ({ typography });

describe("effective text style", () => {
  it("a game with no style draws exactly as before: 10px monospace, 12 px lines, white", () => {
    const t = textStyle(undefined, "monospace", 100);
    expect(fontOf(t.family, t.size)).toBe("10px monospace");
    expect(t).toMatchObject({ size: 10, line: 12, color: "#ffffff", custom: false });
  });

  it("every speaker's name has one colour: pale gold, or the style's speech name colour", () => {
    expect(textStyle(undefined, "monospace", 100).name).toBe("#e8d8a8");
    expect(textStyle({ speech: { name: "#123456" } }, "monospace", 100).name).toBe("#123456");
  });

  it("a style with no typography section is still the legacy look", () => {
    expect(textStyle({ sharedFrame: { image: "frame" } }, "monospace", 100)).toMatchObject({ size: 10, line: 12, custom: false });
  });

  it("legacy narration and speech boxes land where the old fixed constants put them", () => {
    const n = layoutTextBox(narrateBox("Hello there."), sixPx);
    expect(n).toMatchObject({ x: 274, y: 144, w: 92, h: 32, textY: 154, size: 10, line: 12, lines: ["Hello there."] });
    const anchor = { x: 300, y: 250, w: 32, h: 48 };
    const say = layoutTextBox(sayBox("Good day.", { id: "g", name: "Gardener", color: "#88cc88", anchor }), sixPx, textStyle(undefined, "monospace", 100));
    // name row + one text row, 10 px padding all round, 12 px lines
    expect(say).toMatchObject({ w: 74, h: 44, y: 202, textY: 224, line: 12 });
    expect(say.x + say.w / 2).toBeCloseTo(316, 0);
  });

  it("the author's size, colour and font family come through", () => {
    const t = textStyle(typed({ family: "serif", size: 16, color: "#ff8800" }), "serif", 100);
    expect(t).toMatchObject({ family: "serif", size: 16, line: lineFor(16), color: "#ff8800", custom: true });
    expect(textStyle(typed({}), "monospace", 100)).toMatchObject({ size: 16, color: "#ffffff", custom: true });
  });

  it("the player's Text Size scales the author's size: 75%, 100% and 200%", () => {
    const style = typed({ size: 16 });
    expect([75, 100, 200].map((p) => textStyle(style, "monospace", p).size)).toEqual([12, 16, 32]);
    expect([75, 100, 200].map((p) => textStyle(undefined, "monospace", p).size)).toEqual([8, 10, 20]);
    expect(textStyle(style, "monospace", 200).line).toBe(lineFor(32));
  });

  it("a size outside 75–200% is held to it, and a small author size stays readable", () => {
    expect(scaledSize(16, 10)).toBe(12);
    expect(scaledSize(16, 5000)).toBe(32);
    expect(scaledSize(16, Number.NaN)).toBe(16);
    expect(scaledSize(6, 75)).toBe(6);
    expect(scaledSize(72, 200)).toBe(144);
  });
});

describe("player Text Size preference", () => {
  it("is stored per game beside the volumes, never in the game's own data, and survives a reload", () => {
    const store = new MemoryStore();
    writeSettings(store, "a", { music: 3, sfx: 4, textSize: 150 });
    expect(readSettings(store, "a")).toEqual({ music: 3, sfx: 4, textSize: 150 });
    expect(readSettings(store, "b").textSize).toBe(100);
    expect(JSON.parse(store.getItem(settingsKey("a"))!)).toEqual({ music: 3, sfx: 4, textSize: 150 });
  });

  it("an old settings entry with only volumes reads as 100%, and bad values are repaired", () => {
    const store = new MemoryStore();
    store.setItem(settingsKey("t"), JSON.stringify({ music: 5, sfx: 5 }));
    expect(readSettings(store, "t").textSize).toBe(100);
    store.setItem(settingsKey("t"), JSON.stringify({ music: 5, sfx: 5, textSize: 999 }));
    expect(readSettings(store, "t").textSize).toBe(200);
    store.setItem(settingsKey("t"), JSON.stringify({ music: 5, sfx: 5, textSize: "big" }));
    expect(readSettings(store, "t").textSize).toBe(100);
    expect([clampTextScale(60), clampTextScale(110), clampTextScale(113)]).toEqual([75, 100, 125]);
  });

  it("the Settings panel steps 75–200%, stops at the ends, and a new player UI reads the saved choice back", () => {
    const store = new MemoryStore();
    const make = () => {
      const s = new Session(testProject(), testImages);
      return new PlayerUi(s, { slots: new SaveSlots(store, s.game), settings: readSettings(store, "t"), onSettings: (next) => writeSettings(store, "t", next) });
    };
    const ui = make();
    ui.panel = "settings";
    tap(ui, button(ui.layout.settings.buttons, "textsize"));
    expect(ui.panel).toBe("textsize");
    const L = ui.layout.textSize;
    for (let i = 0; i < 6; i++) tap(ui, button(L.buttons, "size_up"));
    expect(ui.settings.textSize).toBe(200);
    expect(readSettings(store, "t").textSize).toBe(200);
    for (let i = 0; i < 9; i++) tap(ui, button(L.buttons, "size_down"));
    expect(ui.settings.textSize).toBe(75);
    tap(ui, button(L.buttons, "size_up"));
    tap(ui, button(L.buttons, "size_up"));
    tap(ui, button(L.buttons, "size_up"));
    expect(ui.settings.textSize).toBe(150);
    tap(ui, button(L.buttons, "ok"));
    expect(ui.panel).toBe("settings");
    expect(make().settings.textSize).toBe(150);
  });
});

describe("reflow at large and small sizes", () => {
  const long = "The garden is quiet and the pond ripples as if something is watching you closely. ".repeat(6).trim();
  const speaker = { id: "g", name: "Gardener", color: "#88cc88", anchor: { x: 300, y: 250, w: 32, h: 48 } };

  it("a box grows with the text size, but stays on screen and no line is wider than the box", () => {
    for (const size of [6, 10, 16, 24, 32, 48, 72, 144]) {
      for (const box of [narrateBox(long), sayBox(long, speaker), narrateBox("Hi."), sayBox("Hi.", { ...speaker, anchor: null })]) {
        const l = layoutTextBox(box, mono, { size });
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.y).toBeGreaterThanOrEqual(0);
        expect(l.x + l.w).toBeLessThanOrEqual(SCENE_WIDTH);
        expect(l.y + l.h).toBeLessThanOrEqual(SCENE_HEIGHT);
        for (const line of l.lines) expect(mono(line, l.size)).toBeLessThanOrEqual(l.w - 20 + 0.5); // the box width is rounded to a whole pixel
        expect(l.line).toBe(lineFor(l.size));
      }
    }
  });

  it("bigger text rewraps to more lines in a wider box", () => {
    const text = "word ".repeat(12).trim();
    const small = layoutTextBox(narrateBox(text), mono, { size: 10 });
    const big = layoutTextBox(narrateBox(text), mono, { size: 20 });
    expect(big.lines.length).toBeGreaterThan(small.lines.length);
    expect(big.w).toBeGreaterThan(small.w);
  });

  it("text too tall for the screen is drawn smaller, never below the legacy 10 px", () => {
    const huge = "word ".repeat(150).trim();
    const l = layoutTextBox(narrateBox(huge), mono, { size: 72 });
    expect(l.size).toBeLessThan(72);
    expect(l.size).toBeGreaterThanOrEqual(10);
    expect(l.y + l.h).toBeLessThanOrEqual(SCENE_HEIGHT);
  });

  it("text the author made smaller than 10 px is left alone", () => {
    expect(layoutTextBox(narrateBox("Tiny."), mono, { size: 6 }).size).toBe(6);
  });

  it("box widths grow with larger text and stop at the screen's edge", () => {
    expect(boxWidth(240, 10)).toBe(240);
    expect(boxWidth(240, 16)).toBe(384);
    expect(boxWidth(360, 72)).toBe(SCENE_WIDTH - 28);
    expect(boxWidth(240, 6)).toBe(240);
  });

  it("shrinkToFit stops at the first size that fits, and at the floor", () => {
    expect(shrinkToFit(30, (s) => s, (s) => s <= 20).size).toBe(20);
    expect(shrinkToFit(30, (s) => s, () => false).size).toBe(10);
    expect(shrinkToFit(8, (s) => s, () => false).size).toBe(8);
  });
});

describe("player controls at large text", () => {
  it("the layout does not depend on text size, so every control keeps its 44 CSS px", () => {
    // Text shrinks to fit controls (draw.ts); the layout takes no text size, so a larger Text Size cannot shrink a control.
    const s = new Session(testProject(), testImages);
    const ui = new PlayerUi(s, { slots: new SaveSlots(null, s.game), settings: { music: 7, sfx: 8, textSize: 200 } });
    ui.setScale(1);
    const before = JSON.stringify(ui.layout);
    ui.settings = { ...ui.settings, textSize: 75 };
    ui.setScale(1);
    expect(JSON.stringify(ui.layout)).toBe(before);
  });
});

describe("drawing text", () => {
  /** Records what the canvas was told. */
  function fakeCtx() {
    const c = { font: "", fillStyle: "", textAlign: "", textBaseline: "", drawn: [] as string[], measureText: (t: string) => ({ width: t.length * 7 }), fillText(t: string) { c.drawn.push(`${c.font}|${c.fillStyle}|${t}`); } };
    return c;
  }

  it("draws in the style's font, size and colour, or the options given", () => {
    const ctx = fakeCtx();
    const t = textStyle(typed({ family: "serif", size: 20, color: "#123456" }), "serif", 100);
    drawText(ctx as never, t, "Hi", 0, 0);
    drawText(ctx as never, t, "Name", 0, 0, { bold: true, color: "#abcdef", size: 12 });
    expect(ctx.drawn).toEqual(["20px serif|#123456|Hi", "bold 12px serif|#abcdef|Name"]);
  });

  it("measures with the effective font", () => {
    const ctx = fakeCtx();
    expect(canvasMeasure(ctx as never, "Courier")("abc", 18, true)).toBe(21);
    expect(ctx.font).toBe("bold 18px Courier");
  });
});
