import { describe, expect, it } from "vitest";
import { AUTHOR_DEFAULTS, type GameStyle } from "@questforge/schema";
import { choicesLook } from "../src/ui/choices.ts";
import { choiceRowAt, drawChoiceBox, drawChoiceRows, type ChoicesView } from "../src/ui/draw.ts";
import { CHOICE_TEXT_INSET, choiceLayout, separatorRect } from "../src/ui/layout.ts";
import { textStyle } from "../src/ui/typography.ts";

// Dialogue Choices: the hover effect on the hovered row and the separator at the top of the choices region, with
// the author defaults when the game styles neither. Drawn into a fake context that records its calls.

type Call = [string, ...unknown[]];
function fake() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in state) return state[k];
      return (...a: unknown[]) => void calls.push([k, ...a]);
    },
    set: (_t, k: string, v) => {
      state[k] = v;
      calls.push(["set", k, v]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const t = textStyle(undefined, "monospace", 100);
const box = choiceLayout(32, 3, 0);
const texts = ["Ask about the pond", "Ask about the rod", "Say goodbye"];
const view = (hover: ChoicesView["hover"], b = box, options: ChoicesView["options"] = texts): ChoicesView => ({ box: b, options, hover });
const centre = (i: number, b = box): [number, number] => [b.rows[i]!.x + 5, b.rows[i]!.y + 5];
const lookOf = (c: NonNullable<GameStyle["dialogueChoices"]>) => choicesLook({ dialogueChoices: c });

/** The color of each rounded hover fill, the plain rectangles drawn, and the color each option's text is drawn in. */
function rowsDrawn(look: ReturnType<typeof choicesLook>, hover: ChoicesView["hover"]) {
  const { ctx, calls } = fake();
  drawChoiceRows(ctx, view(hover), t, look);
  const effects: string[] = [];
  const inks: string[] = [];
  let fill = "";
  for (const [k, ...a] of calls) {
    if (k === "set" && a[0] === "fillStyle") fill = a[1] as string;
    if (k === "fill") effects.push(fill);
    if (k === "fillText") inks.push(fill);
  }
  return { calls, effects, inks, rects: calls.filter(([k]) => k === "fillRect" || k === "strokeRect") };
}

describe("choices", () => {
  it("draw no frame around the rows; only the hovered row gets the effect, with rounded corners", () => {
    const look = lookOf({ separator: "#ff0000" });
    expect(look.effect).toBe("brighten");
    const normal = rowsDrawn(look, null);
    expect(normal.effects).toEqual([]);
    expect(normal.calls.some(([k]) => k === "strokeRect")).toBe(false);
    const hover = rowsDrawn(look, centre(1));
    expect(hover.effects).toEqual(["rgba(255,255,255,0.18)"]);
    expect(hover.calls.filter(([k]) => k === "arcTo")).toHaveLength(4);
    // Only the separator is a plain rectangle.
    expect(hover.rects).toHaveLength(1);
  });

  it("darken lays black over the hovered row instead", () => {
    expect(rowsDrawn(lookOf({ effect: "darken" }), centre(0)).effects).toEqual(["rgba(0,0,0,0.35)"]);
  });

  it("keep the author's text color on every row, hovered or not, inset from the row's edge", () => {
    const custom = textStyle({ typography: { color: "#00ff00" } }, "monospace", 100);
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(centre(0)), custom, lookOf({}));
    const texts = calls.filter(([k]) => k === "fillText");
    expect(texts).toHaveLength(3);
    expect(texts[0]![2]).toBe(box.rows[0]!.x + CHOICE_TEXT_INSET);
    expect(calls.filter(([k, key, v]) => k === "set" && key === "fillStyle" && v === "#00ff00")).toHaveLength(3);
  });

  it("find the row under the pointer, More… included, for the hand cursor", () => {
    const paged = choiceLayout(32, 12, 0);
    expect(choiceRowAt(paged, centre(0, paged))).toEqual(paged.rows[0]);
    expect(choiceRowAt(paged, [paged.more!.x + 1, paged.more!.y + 1])).toEqual(paged.more);
    expect(choiceRowAt(paged, [0, 0])).toBeNull();
    expect(choiceRowAt(paged, null)).toBeNull();
  });
});

describe("separator", () => {
  it("is a thin line with room above and below it, a little wider than the rows", () => {
    const sep = separatorRect(box);
    const row = box.rows[0]!;
    expect(sep.h).toBe(2);
    expect(sep.y - box.panel.y).toBe(8);
    expect(row.y - (sep.y + sep.h)).toBe(8);
    expect(sep.x).toBe(row.x - 4);
    expect(sep.w).toBe(row.w + 8);
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(null), t, lookOf({ separator: "#ff0000" }));
    const at = calls.findIndex(([k, ...a]) => k === "fillRect" && a[1] === sep.y);
    expect(calls[at - 1]).toEqual(["set", "fillStyle", "#ff0000"]);
    expect(calls[at]).toEqual(["fillRect", sep.x, sep.y, sep.w, sep.h]);
  });

  it("rows touch, so the pointer is always on an answer", () => {
    for (let i = 1; i < box.rows.length; i++) expect(box.rows[i]!.y).toBe(box.rows[i - 1]!.y + box.rows[i - 1]!.h);
    const paged = choiceLayout(32, 12, 0);
    expect(paged.more!.y).toBe(paged.rows.at(-1)!.y + 32);
  });

  it("leaves room for it above the first row, and the box still ends 8 px above the screen's bottom", () => {
    expect(box.rows[0]!.y - box.panel.y).toBe(18);
    expect(box.panel.y + box.panel.h).toBe(400 - 8);
  });
});

describe("the look", () => {
  it("is Brighten with the pale-gold separator when the game has no Dialogue Choices section", () => {
    expect(choicesLook(undefined)).toEqual({ effect: AUTHOR_DEFAULTS.dialogueChoices.effect, separator: AUTHOR_DEFAULTS.dialogueChoices.separator });
    expect(choicesLook(undefined)).toEqual({ effect: "brighten", separator: "#e8d8a8" });
    expect(choicesLook({})).toEqual(choicesLook(undefined));
  });

  it("draws no button around any row with no section: the dark panel, the separator, then the options as plain text", () => {
    const { ctx, calls } = fake();
    drawChoiceBox(ctx, view(centre(0)), t, choicesLook(undefined));
    const sep = separatorRect(box);
    expect(calls.filter(([k]) => k === "strokeRect")).toEqual([["strokeRect", box.panel.x + 1, box.panel.y + 1, box.panel.w - 2, box.panel.h - 2]]);
    expect(calls).toContainEqual(["fillRect", sep.x, sep.y, sep.w, sep.h]);
    expect(calls.filter(([k]) => k === "fillText").map(([, s]) => s)).toEqual(texts);
  });

  it("is what a section with only a separator gets for the rest: the Brighten effect", () => {
    expect(lookOf({ separator: "#123456" })).toEqual({ effect: "brighten", separator: "#123456" });
  });
});

describe("paging and hit boxes are unchanged", () => {
  it("draws More… and only this page's rows on the layout the controller hit-tests", () => {
    const paged = choiceLayout(32, 12, 0);
    expect(paged.more).not.toBeNull();
    expect(paged.rows.length).toBeLessThan(12);
    const { ctx, calls } = fake();
    const options = paged.rows.map((_, i) => `option ${i}`);
    drawChoiceRows(ctx, view(null, paged, options), t, lookOf({}));
    expect(calls.filter(([k]) => k === "fillText").map(([, s]) => s)).toEqual([...options, "More…"]);
    expect(box.rows.every((r) => r.h === 32)).toBe(true);
    expect(box.panel.y + box.panel.h).toBe(400 - 8);
  });
});
