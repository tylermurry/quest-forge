import { describe, expect, it } from "vitest";
import { SCENE_HEIGHT, SCENE_WIDTH, resolveStyle, type GameStyle } from "@questforge/schema";
import { DEBUG_OFF } from "../src/debug.ts";
import { drawSession } from "../src/render.ts";
import { DEFAULT_SETTINGS, SaveSlots } from "../src/saves.ts";
import { Session } from "../src/session.ts";
import type { Rect } from "../src/sprite.ts";
import { choicesLook } from "../src/ui/choices.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { drawFrame } from "../src/ui/draw.ts";
import { frameBorders, frameScale, outsetFrame, panelSkin, type SizedImage } from "../src/ui/frame.ts";
import { PANEL_PAD, choiceLayout, computeLayout, separatorRect } from "../src/ui/layout.ts";
import { layoutTextBox, narrateBox, sayBox } from "../src/ui/textbox.ts";
import { textStyle } from "../src/ui/typography.ts";
import { testImages, testProject } from "./support/project.ts";

// The shared frame on every gameplay panel: narration, speech, the dialogue list box, the inventory, settings,
// save / load, volume, text size and the ending box. Drawn into a fake context that records what it is asked to do.
// No frame (or one that did not load) keeps today's look; hit areas move only where the drawn rows move.

type Call = [string, ...unknown[]];

function fake() {
  const calls: Call[] = [];
  const fills: { color: string; rect: Rect }[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in state) return state[k];
      return (...a: unknown[]) => {
        calls.push([k, ...a]);
        if (k === "fillRect") fills.push({ color: String(state.fillStyle), rect: { x: a[0] as number, y: a[1] as number, w: a[2] as number, h: a[3] as number } });
      };
    },
    set: (_t, k: string, v) => {
      state[k] = v;
      calls.push(["set", k, v]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, fills };
}
type Fake = ReturnType<typeof fake>;

// A 24 px frame picture with 8 px borders, drawn 16 px thick: scaled 2×.
const FRAME_IMAGE = { width: 24, height: 24 } as unknown as SizedImage;
const FRAME = { image: "frame_img", insets: { left: 8, right: 8, top: 8, bottom: 8 }, scale: 16 };
const BORDER = 16;
const STYLED: GameStyle = { sharedFrame: FRAME };
const NO_INSETS: GameStyle = { sharedFrame: { image: "frame_img" } };

const BUILT_IN = { panel: "#2a2018", choices: "rgba(20,14,10,0.92)", narration: "#fff", speech: "rgba(0,0,0,0.82)" };
const DIM = "rgba(0,0,0,0.45)";
const OPTIONS = ["Ask about the pond", "Ask about the rod", "Say goodbye"];
const MENU = {
  id: "menu",
  nodes: [
    { id: "start", type: "start", pos: [0, 0], next: "pick" },
    { id: "pick", type: "choices", pos: [0, 0], options: OPTIONS.map((text, i) => ({ id: `o${i}`, text, if: [], once: false, next: "done" })) },
    { id: "done", type: "end", pos: [0, 0] },
  ],
};
const LONG = "The garden is quiet and the gardener glares at you from behind a wheelbarrow while the pond ripples. ".repeat(4).trim();

interface Shown {
  f: Fake;
  s: Session;
  ui: PlayerUi;
  t: ReturnType<typeof textStyle>;
  borders: ReturnType<typeof frameBorders> | null;
}

/** Draws one frame of play. `loaded`: whether the frame picture has loaded; `open` shows the surface. */
function show(style: GameStyle | undefined, loaded: boolean, open: (s: Session, ui: PlayerUi) => void, withBorders = true): Shown {
  const s = new Session(testProject({ game: style ? { style } : {}, dialogues: [MENU] }), testImages);
  const eff = resolveStyle(style);
  const image = (id: string) => (id === "frame_img" && loaded ? FRAME_IMAGE : undefined);
  const skin = panelSkin(eff.sharedFrame, image);
  const borders = skin && withBorders ? frameBorders(skin) : null;
  const ui = new PlayerUi(s, { slots: new SaveSlots(null, s.game), settings: DEFAULT_SETTINGS, borders });
  ui.setScale(1);
  open(s, ui);
  const t = textStyle(style, "monospace", 100);
  const f = fake();
  drawSession(f.ctx, ui, image, undefined, DEBUG_OFF, t, eff.iconBar, choicesLook(style), skin);
  return { f, s, ui, t, borders };
}

const frameDraws = (f: Fake) => f.calls.filter((c) => c[0] === "drawImage" && c[1] === FRAME_IMAGE);
const translates = (f: Fake) => f.calls.filter((c) => c[0] === "translate").map((c) => [c[1], c[2]]);
const builtIn = (f: Fake, color: string, not?: Rect) => f.fills.filter((x) => x.color === color && !(not && x.rect.w === not.w && x.rect.h === not.h));
const SCREEN: Rect = { x: 0, y: 0, w: SCENE_WIDTH, h: SCENE_HEIGHT };

/** Every surface: how to open it, where its panel is, and the fill of its built-in look. */
interface Surface {
  name: string;
  open: (s: Session, ui: PlayerUi) => void;
  rect: (h: Shown) => Rect;
  color: string;
  dims: boolean;
}
/** A fixed panel's frame goes around it, outside its content (`outsetFrame`). */
const panelRect = (pick: (ui: PlayerUi) => Rect) => (h: Shown) => outsetFrame(pick(h.ui), h.borders!, PANEL_PAD);
const SURFACES: Surface[] = [
  { name: "inventory", open: (_s, ui) => void (ui.panel = "inventory"), rect: panelRect((ui) => ui.layout.inventory.panel), color: BUILT_IN.panel, dims: true },
  { name: "settings", open: (_s, ui) => void (ui.panel = "settings"), rect: panelRect((ui) => ui.layout.settings.panel), color: BUILT_IN.panel, dims: true },
  { name: "save", open: (_s, ui) => void (ui.panel = "save"), rect: panelRect((ui) => ui.layout.slots.panel), color: BUILT_IN.panel, dims: true },
  { name: "load", open: (_s, ui) => void (ui.panel = "load"), rect: panelRect((ui) => ui.layout.slots.panel), color: BUILT_IN.panel, dims: true },
  { name: "volume", open: (_s, ui) => void (ui.panel = "volume"), rect: panelRect((ui) => ui.layout.volume.panel), color: BUILT_IN.panel, dims: true },
  { name: "text size", open: (_s, ui) => void (ui.panel = "textsize"), rect: panelRect((ui) => ui.layout.textSize.panel), color: BUILT_IN.panel, dims: true },
  { name: "death box", open: (s) => s.endGame({ kind: "die", message: "You fell in the pond." }), rect: panelRect((ui) => ui.layout.ending.panel), color: BUILT_IN.panel, dims: true },
  { name: "win box", open: (s) => s.endGame({ kind: "win" }), rect: panelRect((ui) => ui.layout.ending.panel), color: BUILT_IN.panel, dims: true },
  { name: "dialogue choices", open: (s) => void s.startDialogue("menu"), rect: (h) => h.ui.choiceBox!.panel, color: BUILT_IN.choices, dims: false },
  { name: "narration", open: (s) => void s.narrate("You see a small garden with a pond."), rect: (h) => textRect(h, narrateBox("You see a small garden with a pond.")), color: BUILT_IN.narration, dims: false },
  { name: "speech", open: (s) => void s.say("gardener", "Mind the flowers."), rect: (h) => textRect(h, h.s.text!), color: BUILT_IN.speech, dims: false },
];

/** Where the game puts a text box: the same layout the drawing used (6 px per character, like the fake). */
function textRect(h: Shown, box: NonNullable<Session["text"]>): Rect {
  const l = layoutTextBox(box, (text, size) => text.length * 6 * (size / h.t.size), h.t, h.ui.placement, h.borders);
  return { x: l.x, y: l.y, w: l.w, h: l.h };
}

describe.each(SURFACES)("$name", (surface) => {
  it("keeps today's look with no style", () => {
    const h = show(undefined, false, surface.open);
    expect(frameDraws(h.f)).toHaveLength(0);
    expect(builtIn(h.f, surface.color, SCREEN).length).toBeGreaterThan(0);
  });

  it("is drawn on the frame at the panel, in place of its fill and edge, when the frame has loaded", () => {
    const h = show(STYLED, true, surface.open);
    const r = surface.rect(h);
    expect(translates(h.f)).toContainEqual([r.x, r.y]);
    expect(h.f.calls).toContainEqual(["scale", 2, 2]);
    expect(frameDraws(h.f).length).toBeGreaterThan(0);
    // The built-in fill is gone, and nothing is filled behind the frame: its see-through pixels show the scene.
    expect(builtIn(h.f, surface.color, SCREEN)).toHaveLength(0);
    if (surface.name !== "narration") expect(h.f.fills.filter((x) => x.rect.x === r.x && x.rect.y === r.y && x.rect.w === r.w && x.rect.h === r.h)).toHaveLength(0);
    // The dimming behind a panel stays.
    expect(builtIn(h.f, DIM).length > 0).toBe(surface.dims);
  });

  it("keeps today's look when a frame is set but its picture has not loaded", () => {
    const h = show(STYLED, false, surface.open);
    expect(frameDraws(h.f)).toHaveLength(0);
    expect(builtIn(h.f, surface.color, SCREEN).length).toBeGreaterThan(0);
  });

  it("draws a frame set without borders at its own size, as the preview does", () => {
    const h = show(NO_INSETS, true, surface.open);
    const r = surface.rect(h);
    expect(translates(h.f)).toContainEqual([r.x, r.y]);
    expect(h.f.calls).toContainEqual(["scale", 1, 1]);
    expect(frameDraws(h.f).length).toBeGreaterThan(0);
  });
});

describe("the frame's size", () => {
  const look = (n: number, scale = 16) => ({ insets: { left: n, right: n, top: n, bottom: n }, scale });

  it("scales the picture so its thickest border is `scale` pixels, and rounds the drawn borders", () => {
    expect(frameScale(look(12))).toBe(16 / 12);
    expect(frameScale({ insets: { left: 48, right: 48, top: 24, bottom: 24 }, scale: 8 })).toBe(8 / 48);
    expect(frameBorders({ insets: { left: 48, right: 48, top: 24, bottom: 24 }, scale: 8 })).toEqual({ left: 8, right: 8, top: 4, bottom: 4 });
    expect(frameBorders(look(7))).toEqual({ left: 16, right: 16, top: 16, bottom: 16 });
  });

  it("is 1 with no borders, which draw nothing", () => {
    expect(frameScale(look(0, 64))).toBe(1);
    expect(frameBorders(look(0, 64))).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it("is a skin only when a frame is configured and its picture is ready", () => {
    const frame = resolveStyle(STYLED).sharedFrame;
    expect(panelSkin(resolveStyle(undefined).sharedFrame, () => FRAME_IMAGE)).toBeUndefined();
    expect(panelSkin(frame, () => undefined)).toBeUndefined();
    expect(panelSkin(frame, () => FRAME_IMAGE)).toEqual({ image: FRAME_IMAGE, insets: FRAME.insets, scale: 16 });
  });

  it("draws the picture scaled to it, crisp when scaled up and smoothed when scaled down", () => {
    const smoothingAtDraw = (scale: number, border = 8) => {
      const f = fake();
      drawFrame(f.ctx, { image: FRAME_IMAGE, insets: { left: border, right: border, top: border, bottom: border }, scale }, { x: 100, y: 50, w: 200, h: 120 });
      const firstDraw = f.calls.findIndex((c) => c[0] === "drawImage");
      const set = f.calls.slice(0, firstDraw).filter((c) => c[0] === "set" && c[1] === "imageSmoothingEnabled").at(-1);
      return { smoothing: set?.[2], calls: f.calls };
    };
    const up = smoothingAtDraw(16);
    expect(up.smoothing).toBe(false);
    expect(up.calls.filter((c) => c[0] === "translate")).toEqual([["translate", 100, 50]]);
    expect(up.calls).toContainEqual(["scale", 2, 2]);
    // The frame is laid out in picture space: 200 × 120 game pixels is 100 × 60 at 2×.
    const corner = up.calls.find((c) => c[0] === "drawImage");
    expect(corner?.slice(1)).toEqual([FRAME_IMAGE, 0, 0, 8, 8, 0, 0, 8, 8]);
    const down = smoothingAtDraw(8, 10);
    expect(down.smoothing).toBe(true);
    expect(down.calls).toContainEqual(["scale", 0.8, 0.8]);
    expect(up.calls.at(-1)).toEqual(["restore"]);
  });
});

describe("framed text boxes", () => {
  const measure = (s: string) => s.length * 6;
  const borders = frameBorders({ insets: FRAME.insets, scale: 16 });
  const t = { size: 10 };
  const speaker = { id: "g", name: "Gardener", color: "#88cc88", anchor: { x: 300, y: 250, w: 32, h: 48 } };

  it("keeps the text inside the borders, in every kind of placement", () => {
    for (const box of [narrateBox(LONG), sayBox(LONG, speaker)]) {
      for (const placement of [null, { top: 60, width: 50 } as const, { top: "center", width: 80 } as const]) {
        const l = layoutTextBox(box, measure, t, placement, borders);
        for (const line of l.lines) expect(measure(line)).toBeLessThanOrEqual(l.w - borders.left - borders.right);
        expect(l.textY - (box.kind === "say" ? l.line : 0)).toBe(l.y + borders.top);
        expect(l.textY + l.lines.length * l.line + borders.bottom).toBe(l.y + l.h);
        expect(l.textX).toBe(l.x + l.w / 2);
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.y + l.h).toBeLessThanOrEqual(SCENE_HEIGHT);
      }
    }
  });

  it("grows taller than the legacy box for the same text, rather than clipping it", () => {
    const legacy = layoutTextBox(narrateBox("Hello there."), measure, t, null, null);
    const framed = layoutTextBox(narrateBox("Hello there."), measure, t, null, borders);
    expect(framed.lines).toEqual(legacy.lines);
    expect(framed.h).toBe(legacy.h + 2 * (BORDER - 10));
    expect(framed.w).toBe(legacy.w + 2 * (BORDER - 10));
    // Long text wraps to more lines and the box follows them.
    const long = layoutTextBox(narrateBox(LONG), measure, t, { top: 20, width: 40 }, borders);
    expect(long.lines.length).toBeGreaterThan(3);
    expect(long.h).toBe(long.lines.length * long.line + 2 * BORDER);
  });

  it("uses each border's own thickness, so uneven borders centre the text in what is left", () => {
    const uneven = { left: 4, right: 20, top: 6, bottom: 30 };
    const l = layoutTextBox(narrateBox("Hello there."), measure, t, { top: 50, width: 50 }, uneven);
    expect(l.textX).toBe(l.x + 4 + (l.w - 24) / 2);
    expect(l.textY).toBe(l.y + 6);
    expect(l.h).toBe(l.line + 36);
  });

  it("is the legacy layout without borders", () => {
    for (const placement of [null, { top: 80, width: 50 } as const]) {
      const plain = layoutTextBox(narrateBox("Hello there."), measure, t, placement);
      expect(layoutTextBox(narrateBox("Hello there."), measure, t, placement, null)).toEqual(plain);
      expect(plain.textX).toBe(plain.x + plain.w / 2);
    }
  });

  it("draws every line of long text inside the framed box", () => {
    const h = show(STYLED, true, (s) => void s.narrate(LONG));
    const box = textRect(h, narrateBox(LONG));
    const lines = h.f.calls.filter((c) => c[0] === "fillText" && typeof c[1] === "string" && LONG.includes((c[1] as string).split(" ")[0]!));
    expect(lines.length).toBeGreaterThan(3);
    for (const c of lines) {
      const [text, x, y] = [c[1] as string, c[2] as number, c[3] as number];
      expect(y).toBeGreaterThanOrEqual(box.y + BORDER);
      expect(y).toBeLessThan(box.y + box.h - BORDER);
      expect(x - (text.length * 6) / 2).toBeGreaterThanOrEqual(box.x + BORDER);
      expect(x + (text.length * 6) / 2).toBeLessThanOrEqual(box.x + box.w - BORDER);
    }
  });

  it("writes narration in the author's text color on the frame, not black on the white box", () => {
    /** The color the line "Hello." is filled with. */
    const colorOfText = (h: Shown) => {
      const at = h.f.calls.findIndex((c) => c[0] === "fillText" && c[1] === "Hello.");
      return h.f.calls.slice(0, at).filter((c) => c[0] === "set" && c[1] === "fillStyle").at(-1)?.[2];
    };
    const framed = show(STYLED, true, (s) => void s.narrate("Hello."));
    expect(colorOfText(framed)).toBe(framed.t.color);
    const legacy = show(undefined, false, (s) => void s.narrate("Hello."));
    expect(colorOfText(legacy)).toBe("#000");
  });
});

describe("the framed dialogue list box", () => {
  const borders = frameBorders({ insets: FRAME.insets, scale: 16 });

  it("is unchanged without borders, and carries no inner area", () => {
    for (const styled of [false, true]) {
      const plain = choiceLayout(44, 3, 0, styled, null);
      expect(choiceLayout(44, 3, 0, styled, null, null)).toEqual(plain);
      expect(plain).not.toHaveProperty("inner");
    }
  });

  it("puts the rows and the separator inside the borders, and the panel grows by them", () => {
    const plain = choiceLayout(44, 3, 0, true, { top: 80, width: 50 });
    const framed = choiceLayout(44, 3, 0, true, { top: 80, width: 50 }, borders);
    expect(framed.panel).toMatchObject({ x: 160, y: 80, w: 320, h: plain.panel.h + 2 * BORDER });
    expect(framed.inner).toEqual({ x: 160 + BORDER, y: 80 + BORDER, w: 320 - 2 * BORDER, h: plain.panel.h });
    for (const r of framed.rows) {
      expect(r.h).toBe(44);
      expect(r.x).toBeGreaterThanOrEqual(framed.inner!.x);
      expect(r.x + r.w).toBeLessThanOrEqual(framed.inner!.x + framed.inner!.w);
      expect(r.y).toBeGreaterThanOrEqual(framed.inner!.y);
      expect(r.y + r.h).toBeLessThanOrEqual(framed.inner!.y + framed.inner!.h);
    }
    expect(separatorRect(framed).y).toBeGreaterThanOrEqual(framed.inner!.y);
    expect(separatorRect(framed).x).toBeGreaterThan(framed.inner!.x);
  });

  it("pages a long list so the framed panel still fits the screen", () => {
    const paged = choiceLayout(44, 14, 0, true, null, borders);
    expect(paged.more).not.toBe(null);
    expect(paged.panel.y).toBeGreaterThanOrEqual(0);
    expect(paged.panel.y + paged.panel.h).toBeLessThanOrEqual(SCENE_HEIGHT);
    expect(paged.more!.y + paged.more!.h).toBeLessThanOrEqual(paged.inner!.y + paged.inner!.h);
  });

  it("draws each option at the row the player can tap", () => {
    const h = show(STYLED, true, (s) => void s.startDialogue("menu"));
    const box = h.ui.choiceBox!;
    expect(box.inner).toBeDefined();
    OPTIONS.forEach((text, i) => {
      const row = box.rows[i]!;
      const draw = h.f.calls.find((c) => c[0] === "fillText" && c[1] === text)!;
      expect(draw[3]).toBe(row.y + row.h / 2);
      expect(draw[2]).toBeGreaterThanOrEqual(row.x);
    });
  });

  it("picks an option from its framed row and ignores a tap on the border", () => {
    const h = show(STYLED, true, (s) => void s.startDialogue("menu"));
    const box = h.ui.choiceBox!;
    const row = box.rows[1]!;
    h.ui.pointerDown([box.panel.x + 4, row.y + row.h / 2], "touch");
    h.ui.pointerUp([box.panel.x + 4, row.y + row.h / 2], "touch");
    expect(h.s.choices).not.toBe(null);
    h.ui.pointerDown([row.x + row.w / 2, row.y + row.h / 2], "touch");
    h.ui.pointerUp([row.x + row.w / 2, row.y + row.h / 2], "touch");
    expect(h.s.state.fired).toContain("dialogue:menu/pick/o1");
  });

  it("keeps the legacy hit areas when the frame has not loaded", () => {
    const h = show(STYLED, false, (s) => void s.startDialogue("menu"));
    const legacy = show(undefined, false, (s) => void s.startDialogue("menu"));
    expect(h.ui.choiceBox!.rows).toEqual(legacy.ui.choiceBox!.rows);
    expect(h.ui.choiceBox).not.toHaveProperty("inner");
  });
});

describe("fixed panels' frames", () => {
  const FIXED = (cssScale: number) => {
    const L = computeLayout(cssScale);
    return { inventory: L.inventory.panel, settings: L.settings.panel, "save / load": L.slots.panel, volume: L.volume.panel, "text size": L.textSize.panel, ending: L.ending.panel };
  };
  const SIDES = [
    ["left", (f: Rect, b: ReturnType<typeof frameBorders>) => f.x + b.left, (p: Rect) => p.x + PANEL_PAD, (f: Rect) => f.x === 0],
    ["top", (f: Rect, b: ReturnType<typeof frameBorders>) => f.y + b.top, (p: Rect) => p.y + PANEL_PAD, (f: Rect) => f.y === 0],
    ["right", (f: Rect, b: ReturnType<typeof frameBorders>) => f.x + f.w - b.right, (p: Rect) => p.x + p.w - PANEL_PAD, (f: Rect) => f.x + f.w === SCENE_WIDTH],
    ["bottom", (f: Rect, b: ReturnType<typeof frameBorders>) => f.y + f.h - b.bottom, (p: Rect) => p.y + p.h - PANEL_PAD, (f: Rect) => f.y + f.h === SCENE_HEIGHT],
  ] as const;

  for (const [scale, cssScale] of [[16, 1], [16, 2], [64, 1], [64, 2]] as const) {
    it(`leaves the content clear of the borders at scale ${scale} and ${cssScale === 1 ? 44 : 32} px controls, except where the screen edge cuts the frame`, () => {
      const borders = frameBorders({ insets: { left: 12, right: 12, top: 12, bottom: 12 }, scale });
      for (const [name, panel] of Object.entries(FIXED(cssScale))) {
        const frame = outsetFrame(panel, borders, PANEL_PAD);
        expect(frame.x + frame.w).toBeLessThanOrEqual(SCENE_WIDTH);
        expect(frame.y + frame.h).toBeLessThanOrEqual(SCENE_HEIGHT);
        for (const [side, innerEdge, contentEdge, clamped] of SIDES) {
          const inner = innerEdge(frame, borders);
          const content = contentEdge(panel);
          const outward = side === "left" || side === "top" ? inner <= content : inner >= content;
          expect(outward || clamped(frame), `${name} ${side} at scale ${scale}`).toBe(true);
        }
      }
    });
  }

  it("grows nothing when the borders fit the panel's own padding", () => {
    const panel = { x: 100, y: 80, w: 300, h: 200 };
    expect(outsetFrame(panel, { left: 8, right: 4, top: 8, bottom: 0 }, PANEL_PAD)).toEqual(panel);
    expect(outsetFrame(panel, { left: 16, right: 12, top: 10, bottom: 8 }, PANEL_PAD)).toEqual({ x: 92, y: 78, w: 312, h: 202 });
  });

  it("never moves the layout or the hit areas", () => {
    for (const scale of [16, 64]) {
      const style: GameStyle = { sharedFrame: { ...FRAME, insets: { left: 12, right: 12, top: 12, bottom: 12 }, scale } };
      expect(show(style, true, () => {}).ui.layout).toEqual(show(undefined, false, () => {}).ui.layout);
    }
  });
});

describe("fixed panels", () => {
  it("keep every rect and hit target, framed or not", () => {
    const plain = show(undefined, false, () => {});
    const framed = show(STYLED, true, () => {});
    expect(framed.borders).toEqual({ left: BORDER, right: BORDER, top: BORDER, bottom: BORDER });
    expect(framed.ui.layout).toEqual(plain.ui.layout);
    const partial = show(STYLED, false, () => {});
    expect(partial.ui.layout).toEqual(plain.ui.layout);
  });

  it("the icon bar keeps its own frame and is not drawn on the shared one", () => {
    const h = show(STYLED, true, (_s, ui) => void (ui.barOpen = true));
    expect(frameDraws(h.f)).toHaveLength(0);
    expect(builtIn(h.f, BUILT_IN.panel).length).toBeGreaterThan(0);
  });
});
