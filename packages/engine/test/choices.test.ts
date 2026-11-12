import { describe, expect, it } from "vitest";
import { LEGACY_STYLE, type GameStyle } from "@questforge/schema";
import { choicesLook, contrast, legibleInk } from "../src/ui/choices.ts";
import { drawChoiceBox, drawChoiceRows, type ChoicesView } from "../src/ui/draw.ts";
import { choiceLayout, separatorRect } from "../src/ui/layout.ts";
import { textStyle } from "../src/ui/typography.ts";

// Dialogue Choices: the highlight on the hovered row, the text colour derived from it, the separator at the
// top of the choices region, and the legacy look unchanged. Drawn into a fake context that records its calls.

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
const styled = (c: NonNullable<GameStyle["dialogueChoices"]>) => choicesLook({ dialogueChoices: c });

/** The fill colour of each row background, and the colour each option's text is drawn in. */
function rowsDrawn(look: ReturnType<typeof choicesLook>, hover: ChoicesView["hover"]) {
  const { ctx, calls } = fake();
  drawChoiceRows(ctx, view(hover), t, look);
  const fills: string[] = [];
  const inks: string[] = [];
  let fill = "";
  for (const [k, ...a] of calls) {
    if (k === "set" && a[0] === "fillStyle") fill = a[1] as string;
    if (k === "fillRect") fills.push(fill);
    if (k === "fillText") inks.push(fill);
  }
  return { calls, fills, inks };
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

  it("gives the legacy highlight today's black text, and whichever has more contrast always wins", () => {
    expect(legibleInk(LEGACY_STYLE.dialogueChoices.highlight)).toBe("#000");
    for (const c of ["#336699", "#996633", "#669933", "#cc3366", "#3366cc", "#aaaaaa", "#555555"]) {
      const picked = legibleInk(c) === "#000" ? "#000000" : "#ffffff";
      const other = picked === "#000000" ? "#ffffff" : "#000000";
      expect(contrast(c, picked)).toBeGreaterThanOrEqual(contrast(c, other));
    }
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});

describe("choice colours", () => {
  it("normal rows use the button colour; the hovered row uses the highlight and the derived ink", () => {
    const look = styled({ highlight: "#2040a0", separator: "#ff0000" });
    const normal = rowsDrawn(look, null);
    expect(normal.fills).not.toContain("#2040a0");
    const hover = rowsDrawn(look, centre(1));
    expect(hover.fills.filter((c) => c === "#2040a0")).toHaveLength(1);
    expect(hover.inks.filter((c) => c === "#fff")).toHaveLength(1);
    expect(hover.inks).toHaveLength(3);
  });

  it("fills the whole row, and a light highlight gets black text", () => {
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(centre(0)), t, styled({ highlight: "#ffffcc", separator: "#ff0000" }));
    const row = box.rows[0]!;
    expect(calls).toContainEqual(["fillRect", row.x, row.y, row.w, row.h]);
    expect(calls).toContainEqual(["set", "fillStyle", "#000"]);
  });

  it("the author's typography colour stays on normal rows", () => {
    const custom = textStyle({ typography: { color: "#00ff00" } }, "monospace", 100);
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(centre(0)), custom, styled({ highlight: "#2040a0" }));
    expect(calls).toContainEqual(["set", "fillStyle", "#00ff00"]);
  });
});

describe("separator", () => {
  it("is a thin line in the separator colour at the top of the choices region, inside the box", () => {
    const sep = separatorRect(box);
    expect(sep.h).toBeLessThanOrEqual(2);
    expect(sep.y).toBeGreaterThanOrEqual(box.panel.y);
    expect(sep.y + sep.h).toBeLessThanOrEqual(box.rows[0]!.y);
    expect(sep.x).toBeGreaterThanOrEqual(box.panel.x);
    expect(sep.x + sep.w).toBeLessThanOrEqual(box.panel.x + box.panel.w);
    const { ctx, calls } = fake();
    drawChoiceRows(ctx, view(null), t, styled({ separator: "#ff0000" }));
    const at = calls.findIndex(([k, ...a]) => k === "fillRect" && a[1] === sep.y);
    expect(calls[at - 1]).toEqual(["set", "fillStyle", "#ff0000"]);
    expect(calls[at]).toEqual(["fillRect", sep.x, sep.y, sep.w, sep.h]);
  });

  it("follows the top of the box when it is taller", () => {
    const tall = choiceLayout(32, 6, 0);
    expect(separatorRect(tall).y).toBe(tall.panel.y + 3);
    expect(separatorRect(tall).y).toBeLessThan(separatorRect(box).y);
  });
});

describe("legacy look", () => {
  // The expected calls below were checked equal to the output of the drawing code before this change.
  it("has no section, so no separator line, and draws exactly what the game drew before", () => {
    const look = choicesLook(undefined);
    expect(look).toEqual({ ...LEGACY_STYLE.dialogueChoices, styled: false });
    const { ctx, calls } = fake();
    drawChoiceBox(ctx, view(centre(0)), t, look);
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

  it("a styled section with only a separator keeps the legacy highlight", () => {
    expect(styled({ separator: "#123456" })).toEqual({ highlight: "#c89a3c", separator: "#123456", styled: true });
  });
});

describe("paging and hit boxes are unchanged", () => {
  it("draws More… and only this page's rows on the layout the controller hit-tests", () => {
    const paged = choiceLayout(32, 12, 0);
    expect(paged.more).not.toBeNull();
    expect(paged.rows.length).toBeLessThan(12);
    const { ctx, calls } = fake();
    const options = paged.rows.map((_, i) => `option ${i}`);
    drawChoiceRows(ctx, view(null, paged, options), t, styled({ highlight: "#2040a0" }));
    expect(calls.filter(([k]) => k === "fillText").map(([, s]) => s)).toEqual([...options, "More…"]);
    expect(box.rows.every((r) => r.h === 32)).toBe(true);
    expect(box.panel.y + box.panel.h).toBe(400 - 8);
  });
});
