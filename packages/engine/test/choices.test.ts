import { describe, expect, it } from "vitest";
import { LEGACY_STYLE, type GameStyle } from "@questforge/schema";
import { choicesLook, contrast, legibleInk } from "../src/ui/choices.ts";
import { choiceRowAt, drawChoiceBox, drawChoiceRows, type ChoicesView } from "../src/ui/draw.ts";
import { CHOICE_TEXT_INSET, choiceLayout, separatorRect } from "../src/ui/layout.ts";
import { textStyle } from "../src/ui/typography.ts";

// Dialogue Choices: the hover effect on the hovered row, the separator at the top of the choices region, and
// the legacy look unchanged. Drawn into a fake context that records its calls.

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
const styledBox = choiceLayout(32, 3, 0, true);
const texts = ["Ask about the pond", "Ask about the rod", "Say goodbye"];
const view = (hover: ChoicesView["hover"], b = styledBox, options: ChoicesView["options"] = texts): ChoicesView => ({ box: b, options, hover });
const centre = (i: number, b = styledBox): [number, number] => [b.rows[i]!.x + 5, b.rows[i]!.y + 5];
const styled = (c: NonNullable<GameStyle["dialogueChoices"]>) => choicesLook({ dialogueChoices: c });

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

describe("legibleInk", () => {
  it("picks black or white by WCAG contrast", () => {
    expect(legibleInk("#ffffff")).toBe("#000");
    expect(legibleInk("#ffff00")).toBe("#000");
    expect(legibleInk("#000000")).toBe("#fff");
    expect(legibleInk("#1a2b6d")).toBe("#fff");
    expect(legibleInk("#c0392b")).toBe("#fff");
    expect(legibleInk("#7f7f7f")).toBe("#000");
  });

  it("gives the legacy gold highlight today's black text, and whichever has more contrast always wins", () => {
    expect(legibleInk("#c89a3c")).toBe("#000");
    for (const c of ["#336699", "#996633", "#669933", "#cc3366", "#3366cc", "#aaaaaa", "#555555"]) {
      const picked = legibleInk(c) === "#000" ? "#000000" : "#ffffff";
      const other = picked === "#000000" ? "#ffffff" : "#000000";
      expect(contrast(c, picked)).toBeGreaterThanOrEqual(contrast(c, other));
    }
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});

describe("styled choices", () => {
  it("draw no frame around the rows; only the hovered row gets the effect, with rounded corners", () => {
    const look = styled({ separator: "#ff0000" });
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
    expect(rowsDrawn(styled({ effect: "darken" }), centre(0)).effects).toEqual(["rgba(0,0,0,0.35)"]);
  });

  it("keep the author's text color on every row, hovered or not, inset from the row's edge", () => {
    const custom = textStyle({ typography: { color: "#00ff00" } }, "monospace", 100);
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(centre(0)), custom, styled({}));
    const texts = calls.filter(([k]) => k === "fillText");
    expect(texts).toHaveLength(3);
    expect(texts[0]![2]).toBe(styledBox.rows[0]!.x + CHOICE_TEXT_INSET);
    expect(calls.filter(([k, key, v]) => k === "set" && key === "fillStyle" && v === "#00ff00")).toHaveLength(3);
  });

  it("find the row under the pointer, More… included, for the hand cursor", () => {
    const paged = choiceLayout(32, 12, 0, true);
    expect(choiceRowAt(paged, centre(0, paged))).toEqual(paged.rows[0]);
    expect(choiceRowAt(paged, [paged.more!.x + 1, paged.more!.y + 1])).toEqual(paged.more);
    expect(choiceRowAt(paged, [0, 0])).toBeNull();
    expect(choiceRowAt(paged, null)).toBeNull();
  });
});

describe("separator", () => {
  it("is a thin line with room above and below it, a little wider than the rows", () => {
    const sep = separatorRect(styledBox);
    const row = styledBox.rows[0]!;
    expect(sep.h).toBe(2);
    expect(sep.y - styledBox.panel.y).toBe(8);
    expect(row.y - (sep.y + sep.h)).toBe(8);
    expect(sep.x).toBe(row.x - 4);
    expect(sep.w).toBe(row.w + 8);
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(null), t, styled({ separator: "#ff0000" }));
    const at = calls.findIndex(([k, ...a]) => k === "fillRect" && a[1] === sep.y);
    expect(calls[at - 1]).toEqual(["set", "fillStyle", "#ff0000"]);
    expect(calls[at]).toEqual(["fillRect", sep.x, sep.y, sep.w, sep.h]);
  });

  it("styled rows touch, so the pointer is always on an answer; legacy buttons keep their gap", () => {
    for (let i = 1; i < styledBox.rows.length; i++) expect(styledBox.rows[i]!.y).toBe(styledBox.rows[i - 1]!.y + styledBox.rows[i - 1]!.h);
    expect(box.rows[1]!.y - (box.rows[0]!.y + box.rows[0]!.h)).toBe(4);
    const paged = choiceLayout(32, 12, 0, true);
    expect(paged.more!.y).toBe(paged.rows.at(-1)!.y + 32);
  });

  it("only styled boxes make room for it; the legacy box keeps its padding", () => {
    expect(box.rows[0]!.y - box.panel.y).toBe(8);
    expect(styledBox.rows[0]!.y - styledBox.panel.y).toBe(18);
    expect(styledBox.panel.y + styledBox.panel.h).toBe(box.panel.y + box.panel.h);
  });
});

describe("legacy look", () => {
  // The expected calls below were checked equal to the output of the drawing code before this change.
  it("has no section, so no separator line, and draws exactly what the game drew before", () => {
    const look = choicesLook(undefined);
    expect(look).toEqual({ ...LEGACY_STYLE.dialogueChoices, styled: false });
    const { ctx, calls } = fake();
    drawChoiceBox(ctx, view(centre(0, box), box), t, look);
    const r = box.panel;
    const button = (row: (typeof box.rows)[number], fill: string): Call[] => [
      ["set", "fillStyle", fill],
      ["fillRect", row.x, row.y, row.w, row.h],
      ["set", "strokeStyle", "#e8d8a8"],
      ["set", "lineWidth", 1],
      ["strokeRect", row.x + 0.5, row.y + 0.5, row.w - 1, row.h - 1],
    ];
    const text = (row: (typeof box.rows)[number], s: string, color: string): Call[] => [
      ["set", "font", "10px monospace"],
      ["set", "font", "10px monospace"],
      ["set", "font", "10px monospace"],
      ["set", "fillStyle", color],
      ["set", "textAlign", "left"],
      ["set", "textBaseline", "middle"],
      ["fillText", s, row.x + 8, row.y + row.h / 2],
    ];
    expect(calls).toEqual([
      ["set", "fillStyle", "rgba(20,14,10,0.92)"],
      ["fillRect", r.x, r.y, r.w, r.h],
      ["set", "strokeStyle", "#e8d8a8"],
      ["set", "lineWidth", 2],
      ["strokeRect", r.x + 1, r.y + 1, r.w - 2, r.h - 2],
      ...button(box.rows[0]!, "#c89a3c"),
      ...text(box.rows[0]!, texts[0]!, "#000"),
      ...button(box.rows[1]!, "#4a3a2a"),
      ...text(box.rows[1]!, texts[1]!, "#e8d8a8"),
      ...button(box.rows[2]!, "#4a3a2a"),
      ...text(box.rows[2]!, texts[2]!, "#e8d8a8"),
    ]);
  });

  it("a styled section with only a separator gets the Brighten effect", () => {
    expect(styled({ separator: "#123456" })).toEqual({ effect: "brighten", separator: "#123456", styled: true });
  });
});

describe("paging and hit boxes are unchanged", () => {
  it("draws More… and only this page's rows on the layout the controller hit-tests", () => {
    const paged = choiceLayout(32, 12, 0);
    expect(paged.more).not.toBeNull();
    expect(paged.rows.length).toBeLessThan(12);
    const { ctx, calls } = fake();
    const options = paged.rows.map((_, i) => `option ${i}`);
    drawChoiceRows(ctx, view(null, paged, options), t, styled({}));
    expect(calls.filter(([k]) => k === "fillText").map(([, s]) => s)).toEqual([...options, "More…"]);
    expect(box.rows.every((r) => r.h === 32)).toBe(true);
    expect(box.panel.y + box.panel.h).toBe(400 - 8);
  });
});
