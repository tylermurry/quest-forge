import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_STYLE, resolveStyle, type GameStyle } from "@questforge/schema";
import { drawIconBar, type BarState } from "../src/ui/draw.ts";
import { EFFECT_AMOUNT, shadeColor } from "../src/ui/icons.ts";
import { computeLayout, fitInside } from "../src/ui/layout.ts";
import { textStyle } from "../src/ui/typography.ts";
import type { Rect } from "../src/sprite.ts";

// The icon bar's look: the frame, each button's own picture, aspect-fit, the fallbacks, and the one
// Brighten / Darken effect on icon pixels only. Drawn into a fake context that records what it is asked to do.

type Call = [string, ...unknown[]];
interface Fake {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  /** `fillStyle` at the moment of each fillRect. */
  fills: { color: string; rect: Rect }[];
}

function fake(calls: Call[] = []): Fake {
  const fills: Fake["fills"] = [];
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

/** Canvases the effect makes: one per (image, effect), each with the calls made on its own context. */
const made: { canvas: { width: number; height: number }; calls: Call[] }[] = [];
vi.stubGlobal("document", {
  createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => fake(entry.calls).ctx };
    const entry = { canvas, calls: [] as Call[] };
    made.push(entry);
    return canvas;
  },
});
afterEach(() => {
  made.length = 0;
});

const L = computeLayout(1);
const t = textStyle(undefined, "monospace", 100);
const pic = (width: number, height: number) => ({ width, height }) as unknown as CanvasImageSource;
const bar = (over: Partial<BarState> = {}): BarState => ({ layout: L, selected: "walk", itemHeld: false, itemImage: undefined, hover: null, scoreText: "Score: 1 of 10", ...over });
const styled = (iconBar: NonNullable<GameStyle["iconBar"]>) => resolveStyle({ iconBar }).iconBar;
const rectOf = (id: string) => L.barButtons.find((b) => b.id === id)!.rect;
const centre = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const draws = (calls: Call[]) => calls.filter((c) => c[0] === "drawImage");
/** The built-in icons draw these ellipses: walk has two, talk one. */
const ellipses = (calls: Call[]) => calls.filter((c) => c[0] === "ellipse").length;
const BOX = (r: Rect): Rect => ({ x: r.x + r.w * 0.12, y: r.y + r.h * 0.12, w: r.w * 0.76, h: r.h * 0.76 });

describe("fitInside", () => {
  it("keeps the proportions, centres, and fills the limiting side", () => {
    expect(fitInside({ width: 40, height: 10 }, { x: 10, y: 10, w: 40, h: 40 })).toEqual({ x: 10, y: 25, w: 40, h: 10 });
    expect(fitInside({ width: 10, height: 40 }, { x: 0, y: 0, w: 20, h: 20 })).toEqual({ x: 8, y: 0, w: 5, h: 20 });
    // Small pictures are enlarged to fit, not left tiny.
    expect(fitInside({ width: 8, height: 8 }, { x: 0, y: 0, w: 32, h: 32 })).toEqual({ x: 0, y: 0, w: 32, h: 32 });
  });
});

describe("the legacy bar (no icon bar style)", () => {
  it("fills the current verb gold with a black icon, and the rest dark with a light icon", () => {
    const f = fake();
    drawIconBar(f.ctx, bar({ selected: "look" }), t, LEGACY_STYLE.iconBar, () => undefined);
    const gold = f.fills.filter((x) => x.color === "#c89a3c").map((x) => x.rect);
    expect(gold).toEqual([rectOf("look")]);
    expect(f.fills.filter((x) => x.color === "#4a3a2a")).toHaveLength(6);
    expect(f.fills[0]).toEqual({ color: "#2a2018", rect: L.bar });
  });

  it("shows no hover effect and makes no effect canvas", () => {
    const f = fake();
    drawIconBar(f.ctx, bar({ hover: centre(rectOf("talk")) }), t, LEGACY_STYLE.iconBar, () => undefined);
    expect(f.fills.filter((x) => x.color === "#c89a3c").map((x) => x.rect)).toEqual([rectOf("walk")]);
    expect(made).toHaveLength(0);
  });

  it("draws exactly the same whether or not a button is hovered", () => {
    const plain = fake();
    drawIconBar(plain.ctx, bar(), t, LEGACY_STYLE.iconBar, () => undefined);
    const over = fake();
    drawIconBar(over.ctx, bar({ hover: centre(rectOf("talk")) }), t, LEGACY_STYLE.iconBar, () => undefined);
    expect(over.calls).toEqual(plain.calls);
  });

  it("draws the held item's picture on the item button and nothing there otherwise", () => {
    const item = pic(20, 20);
    const held = fake();
    drawIconBar(held.ctx, bar({ itemHeld: true, itemImage: item }), t, LEGACY_STYLE.iconBar, () => undefined);
    expect(draws(held.calls).map((c) => c[1])).toEqual([item]);
    const none = fake();
    drawIconBar(none.ctx, bar(), t, LEGACY_STYLE.iconBar, () => undefined);
    expect(draws(none.calls)).toHaveLength(0);
  });
});

describe("the bar's own frame", () => {
  const frame = { width: 48, height: 48 } as unknown as CanvasImageSource;
  const look = styled({ frame: { image: "bar", insets: { left: 8, right: 8, top: 8, bottom: 8 } } });

  it("is drawn with the nine-slice drawer over the bar instead of the dark strip and the button fills", () => {
    const f = fake();
    drawIconBar(f.ctx, bar(), t, look, (id) => (id === "bar" ? frame : undefined));
    expect(draws(f.calls).length).toBeGreaterThanOrEqual(9);
    expect(draws(f.calls).every((c) => c[1] === frame)).toBe(true);
    expect(f.fills.map((x) => x.color)).not.toContain("#2a2018");
    expect(f.fills.map((x) => x.color)).not.toContain("#4a3a2a");
    // The nine pieces cover the whole bar.
    const right = Math.max(...draws(f.calls).map((c) => (c[6] as number) + (c[8] as number)));
    expect(right).toBe(L.bar.w);
  });

  it("falls back to today's strip while the image is missing or not loaded", () => {
    const f = fake();
    drawIconBar(f.ctx, bar(), t, look, () => undefined);
    expect(f.fills[0]).toEqual({ color: "#2a2018", rect: L.bar });
    expect(draws(f.calls)).toHaveLength(0);
  });
});

describe("a button's own picture", () => {
  const icons = styled({ icons: { walk: "w", item: "i" } });

  it("is drawn aspect-fit and centred in the button, never stretched", () => {
    const wide = pic(40, 10);
    const f = fake();
    drawIconBar(f.ctx, bar({ selected: "look" }), t, icons, (id) => (id === "w" ? wide : undefined));
    const [, img, x, y, w, h] = draws(f.calls)[0] as [string, unknown, number, number, number, number];
    expect(img).toBe(wide);
    const box = BOX(rectOf("walk"));
    expect(w / h).toBeCloseTo(4, 5);
    expect(w).toBeCloseTo(box.w, 5);
    expect(x + w / 2).toBeCloseTo(box.x + box.w / 2, 0);
    expect(y + h / 2).toBeCloseTo(box.y + box.h / 2, 0);
  });

  it("replaces only that button's built-in icon; the others keep theirs", () => {
    const all = fake();
    drawIconBar(all.ctx, bar(), t, styled({}), () => undefined);
    expect(ellipses(all.calls)).toBe(3);
    const f = fake();
    drawIconBar(f.ctx, bar(), t, icons, (id) => (id === "w" ? pic(16, 16) : undefined));
    expect(ellipses(f.calls)).toBe(1);
    expect(draws(f.calls)).toHaveLength(1);
  });

  it("falls back to the built-in icon when its image is not loaded", () => {
    const f = fake();
    drawIconBar(f.ctx, bar(), t, icons, () => undefined);
    expect(ellipses(f.calls)).toBe(3);
    expect(draws(f.calls)).toHaveLength(0);
  });

  it("shows the item icon only while no item is held; a held item shows its own picture", () => {
    const itemIcon = pic(16, 16);
    const held = pic(30, 30);
    const lookup = (id: string) => (id === "i" ? itemIcon : undefined);
    const idle = fake();
    drawIconBar(idle.ctx, bar(), t, icons, lookup);
    expect(draws(idle.calls).map((c) => c[1])).toEqual([itemIcon]);
    const using = fake();
    drawIconBar(using.ctx, bar({ itemHeld: true, itemImage: held, selected: "item" }), t, icons, lookup);
    // The item button is selected, so its picture is the prepared copy of the held one: one picture, not the item icon.
    expect(draws(using.calls)).toHaveLength(1);
    expect(draws(using.calls)[0]![1]).not.toBe(itemIcon);
  });

  it("draws nothing on the item button when no item is held and no item icon is set (as before)", () => {
    const f = fake();
    drawIconBar(f.ctx, bar(), t, styled({}), () => undefined);
    expect(draws(f.calls)).toHaveLength(0);
  });
});

describe("the Brighten / Darken effect", () => {
  const all = { walk: "p", look: "p", hand: "p", talk: "p", item: "p", inventory: "p", settings: "p" };
  // A new picture for each test: the prepared copies are cached per picture.
  let picture = pic(16, 16);
  beforeEach(() => {
    picture = pic(16, 16);
  });
  const lookup = (id: string) => (id === "p" ? picture : undefined);

  it("marks the hovered and the selected icon with the same effect, and no other", () => {
    const f = fake();
    drawIconBar(f.ctx, bar({ selected: "walk", hover: centre(rectOf("hand")) }), t, styled({ icons: all, effect: "brighten" }), lookup);
    const sources = draws(f.calls).map((c) => c[1]);
    const byButton = L.barButtons.map((b, i) => [b.id, sources[i] === picture ? "plain" : "shaded"]);
    expect(Object.fromEntries(byButton)).toEqual({ walk: "shaded", look: "plain", hand: "shaded", talk: "plain", item: "plain", inventory: "plain", settings: "plain" });
    // Hover and selected draw the very same prepared copy.
    expect(sources[0]).toBe(sources[2]);
    expect(made).toHaveLength(1);
  });

  it("only changes the icon's pixels: the copy is painted with source-atop, white to brighten and black to darken", () => {
    const bright = fake();
    drawIconBar(bright.ctx, bar(), t, styled({ icons: all, effect: "brighten" }), lookup);
    const dark = fake();
    drawIconBar(dark.ctx, bar(), t, styled({ icons: all, effect: "darken" }), lookup);
    const colours = made.map((m) => m.calls.find((c) => c[0] === "set" && c[1] === "fillStyle")![2]);
    expect(colours).toEqual(["#fff", "#000"]);
    for (const m of made) {
      expect(m.calls).toContainEqual(["set", "globalCompositeOperation", "source-atop"]);
      expect(m.calls).toContainEqual(["set", "globalAlpha", EFFECT_AMOUNT]);
      expect(m.canvas).toMatchObject({ width: 16, height: 16 });
    }
  });

  it("is made once per image and effect, not on every frame", () => {
    const look = styled({ icons: all, effect: "brighten" });
    for (let i = 0; i < 5; i++) drawIconBar(fake().ctx, bar(), t, look, lookup);
    expect(made).toHaveLength(1);
  });

  it("does not react to hover on the disabled item button, but still draws its picture", () => {
    const f = fake();
    const itemPic = pic(16, 16);
    drawIconBar(f.ctx, bar({ hover: centre(rectOf("item")) }), t, styled({ icons: { item: "i" }, effect: "brighten" }), (id) => (id === "i" ? itemPic : undefined));
    expect(draws(f.calls).map((c) => c[1])).toEqual([itemPic]);
    expect(made).toHaveLength(0);
  });

  it("never changes a button's background: no gold fill, hovered, selected or not", () => {
    const f = fake();
    drawIconBar(f.ctx, bar({ selected: "look", hover: centre(rectOf("talk")) }), t, styled({ effect: "darken" }), () => undefined);
    expect(f.fills.map((x) => x.color)).not.toContain("#c89a3c");
    expect(f.fills.filter((x) => x.color === "#4a3a2a")).toHaveLength(7);
  });

  it("tints the built-in icons the same way when there is no picture", () => {
    const f = fake();
    drawIconBar(f.ctx, bar({ selected: "walk" }), t, styled({ effect: "brighten" }), () => undefined);
    const colours = f.calls.filter((c) => c[0] === "set" && c[1] === "fillStyle").map((c) => c[2]);
    expect(colours).toContain(shadeColor("#e8d8a8", "brighten"));
    expect(shadeColor("#e8d8a8", "brighten")).not.toBe("#e8d8a8");
  });

  it("applies the same effect to the held item's picture", () => {
    const held = pic(12, 12);
    const f = fake();
    drawIconBar(f.ctx, bar({ itemHeld: true, itemImage: held, selected: "item" }), t, styled({ effect: "darken" }), () => undefined);
    expect(draws(f.calls)[0]![1]).not.toBe(held);
    expect(made).toHaveLength(1);
  });
});

describe("shadeColor", () => {
  it("moves each channel toward white or black by the effect amount", () => {
    expect(shadeColor("#000000", "brighten")).toBe("#595959");
    expect(shadeColor("#ffffff", "darken")).toBe("#a6a6a6");
    expect(shadeColor("#808080", "brighten")).toBe(shadeColor("#808080", "brighten"));
  });
});

describe("hit targets", () => {
  it("are not part of the style: the layout is the same whatever the icon bar looks like", () => {
    const before = JSON.stringify(computeLayout(1));
    drawIconBar(fake().ctx, bar(), t, styled({ icons: { walk: "w" }, effect: "darken", frame: { image: "f" } }), () => pic(10, 10));
    expect(JSON.stringify(computeLayout(1))).toBe(before);
    for (const b of computeLayout(1).barButtons) expect(b.rect.w).toBeGreaterThanOrEqual(44);
  });
});
