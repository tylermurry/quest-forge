import { describe, expect, it } from "vitest";
import { layoutTextBox, narrateBox, sayBox, textDuration, wrap } from "../src/ui/textbox.ts";

// Text boxes (spec 06, D78), laid out with a fixed-width measurer (6 px per char).

const measure = (s: string) => s.length * 6;

describe("text boxes", () => {
  it("time scales with length, clamped to 2–10 s", () => {
    expect(textDuration("Hi.")).toBe(2);
    expect(textDuration("x".repeat(50))).toBeCloseTo(4, 6);
    expect(textDuration("x".repeat(500))).toBe(10);
  });

  it("wraps on words to the width, keeping explicit newlines", () => {
    expect(wrap(measure, "aaa bbb ccc", 42)).toEqual(["aaa bbb", "ccc"]);
    expect(wrap(measure, "one\ntwo", 600)).toEqual(["one", "two"]);
    expect(wrap(measure, "superlongword x", 30)).toEqual(["superlongword", "x"]);
  });

  it("centers narration a little above the middle", () => {
    const l = layoutTextBox(narrateBox("Hello there."), measure);
    expect(l.x + l.w / 2).toBeCloseTo(320, 0);
    expect(l.y + l.h / 2).toBeLessThan(200);
    expect(l.name).toBe(null);
    expect(l.lines).toEqual(["Hello there."]);
  });

  it("puts speech above the speaker, with their name", () => {
    const anchor = { x: 300, y: 250, w: 32, h: 48 };
    const l = layoutTextBox(sayBox("Good day.", { id: "g", name: "Gardener", color: "#88cc88", anchor }), measure);
    expect(l.name).toBe("Gardener");
    expect(l.y + l.h).toBeLessThanOrEqual(250);
    expect(l.x + l.w / 2).toBeCloseTo(316, 0);
    expect(l.textY).toBeGreaterThan(l.y + 12);
  });

  it("drops speech below the speaker near the top, and keeps it on screen", () => {
    const anchor = { x: 620, y: 10, w: 20, h: 30 };
    const l = layoutTextBox(sayBox("Up here!", { id: "g", name: "G", color: "#fff", anchor }), measure);
    expect(l.y).toBeGreaterThanOrEqual(40);
    expect(l.x + l.w).toBeLessThanOrEqual(636);
  });

  it("wraps long speech narrower than narration", () => {
    const text = "word ".repeat(40).trim();
    const say = layoutTextBox(sayBox(text, { id: "g", name: "G", color: "#fff", anchor: null }), measure);
    const nar = layoutTextBox(narrateBox(text), measure);
    expect(say.w).toBeLessThan(nar.w);
    expect(say.lines.length).toBeGreaterThan(nar.lines.length);
  });
});
