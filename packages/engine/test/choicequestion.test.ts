import { describe, expect, it } from "vitest";
import { SCENE_HEIGHT, SCENE_WIDTH, type GameStyle } from "@questforge/schema";
import { DEFAULT_SETTINGS, SaveSlots } from "../src/saves.ts";
import { Session } from "../src/session.ts";
import { choicesLook } from "../src/ui/choices.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { drawChoiceBox } from "../src/ui/draw.ts";
import { separatorRect, type ChoiceBox } from "../src/ui/layout.ts";
import { textStyle } from "../src/ui/typography.ts";
import { testImages, testProject } from "./support/project.ts";

// The choice box shows the Choices node's own question (the asker's name, then the text) above the separator,
// inside the same panel as the rows. A line said before the node plays as a line and is not part of the box.

type Raw = Record<string, unknown>;
const QUESTION = "What can I do for you?";
const opt = (id: string, text: string, next: string | null = "done") => ({ id, text, if: [], once: false, next });
const start = (next: string) => ({ id: "start", type: "start", pos: [0, 0], next });
const say = (id: string, text: string, next: string, character: string | null = "gardener") => ({ id, type: "line", pos: [0, 0], ...(character ? { character } : {}), text, next });
/** A Choices node that `character` (the narrator when null) asks `text` with. */
const choices = (options: Raw[], text = QUESTION, character: string | null = "gardener") => ({ id: "menu", type: "choices", pos: [0, 0], ...(character ? { character } : {}), text, options });
const end = { id: "done", type: "end", pos: [0, 0] };
const THREE = [opt("a", "Ask about the pond", "news"), opt("b", "Ask about the rod"), opt("c", "Say goodbye")];
const TWELVE = Array.from({ length: 12 }, (_, i) => opt(`o${i}`, `Option ${i}`));

const SHOP = { id: "shop", nodes: [start("menu"), choices(THREE), say("news", "Nothing ever happens here.", "menu"), end] };
const WITH_LINE = { id: "shop", nodes: [start("hello"), say("hello", "Welcome! Have a look at my wares.", "menu"), choices(THREE), end] };
const NARRATED = { id: "shop", nodes: [start("menu"), choices(THREE, "A bell rings. What now?", null), end] };
const long = (text: string, options = THREE) => ({ id: "shop", nodes: [start("menu"), choices(options, text), end] });

const STYLED: GameStyle = { dialogueChoices: { separator: "#ff0000" }, speech: { name: "#ff00ff" }, typography: { color: "#00ff00" } };
const PLACED: GameStyle = { ...STYLED, narration: { top: 30, width: 60 } };
const BORDERS = { left: 12, right: 12, top: 12, bottom: 12 };

// Every character is 6 px wide at any size; bold counts the same.
const measure = (text: string) => text.length * 6;

function setup(dialogue: Raw, style: GameStyle | null = STYLED, borders: typeof BORDERS | null = null) {
  const s = new Session(testProject({ game: style ? { style } : {}, dialogues: [dialogue] }), testImages);
  const ui = new PlayerUi(s, { slots: new SaveSlots(null, s.game), settings: DEFAULT_SETTINGS, borders, measure });
  ui.setScale(1);
  s.startDialogue("shop");
  return { s, ui };
}
/** Closes the line boxes until the list is up. */
function untilChoices(s: Session) {
  for (let i = 0; i < 600 && !(s.choices && !s.text); i++) {
    if (s.text) s.skipText();
    s.tick(1 / 60);
  }
  if (!s.choices) throw new Error("no choices");
}
const tap = (ui: PlayerUi, x: number, y: number) => {
  ui.pointerDown([x, y], "touch");
  ui.pointerUp([x, y], "touch");
};
const centre = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

/** Draws the box and returns each text with the colour and font set when it was drawn, and each filled rectangle, in order. */
function drawn(ui: PlayerUi, style: GameStyle | undefined) {
  const state: Record<string, unknown> = {};
  const events: { kind: "text" | "rect"; text?: string; color: string; font: string; y: number }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k === "measureText") return (s: string) => ({ width: measure(s) });
      if (k in state) return state[k];
      return (...a: unknown[]) => {
        if (k === "fillText") events.push({ kind: "text", text: a[0] as string, color: String(state.fillStyle), font: String(state.font), y: a[2] as number });
        if (k === "fillRect") events.push({ kind: "rect", color: String(state.fillStyle), font: "", y: a[1] as number });
      };
    },
    set: (_t, k: string, v) => ((state[k] = v), true),
  }) as unknown as CanvasRenderingContext2D;
  const box = ui.choiceBox!;
  const list = ui.session.choices!;
  drawChoiceBox(ctx, { box, options: box.rows.map((_, i) => list.options[box.first + i]?.text), hover: null }, textStyle(style, "monospace", 100), choicesLook(style));
  return events;
}

describe("the choice box's question", () => {
  it("shows the asker's name, the question, the separator, then the rows, in one panel", () => {
    const { s, ui } = setup(SHOP);
    untilChoices(s);
    expect(s.choices!.question).toEqual({ character: "gardener", text: QUESTION });
    const box = ui.choiceBox!;
    expect(box.question).toMatchObject({ name: "Gardener", lines: [QUESTION] });
    const sep = separatorRect(box);
    // The question is inside the panel and ends one separator-space above the line.
    expect(box.question!.y).toBeGreaterThanOrEqual(box.panel.y);
    expect(box.question!.y + box.question!.height - box.question!.pad).toBe(sep.y - 8);
    expect(box.rows[0]!.y).toBe(sep.y + sep.h + 8);

    const events = drawn(ui, STYLED);
    const order = events.filter((e) => e.kind === "text" || e.color === "#ff0000");
    expect(order.map((e) => e.text ?? "separator")).toEqual(["Gardener", QUESTION, "separator", "Ask about the pond", "Ask about the rod", "Say goodbye"]);
    expect(order[0]).toMatchObject({ color: "#ff00ff" });
    expect(order[0]!.font).toContain("bold");
    expect(order[1]).toMatchObject({ color: "#00ff00" });
    expect(order[1]!.font).not.toContain("bold");
    expect(order[0]!.y).toBeLessThan(order[1]!.y);
    expect(order[1]!.y).toBeLessThan(order[2]!.y);
  });

  it("shows it with no Styling at all, with the default look", () => {
    const { s, ui } = setup(SHOP, null);
    untilChoices(s);
    expect(ui.choiceBox!.question).toMatchObject({ name: "Gardener", lines: [QUESTION] });
    expect(drawn(ui, undefined).filter((e) => e.kind === "text").map((e) => e.text)).toEqual(["Gardener", QUESTION, "Ask about the pond", "Ask about the rod", "Say goodbye"]);
  });

  it("shows a question the narrator asks without a name", () => {
    const { s, ui } = setup(NARRATED);
    untilChoices(s);
    expect(s.choices!.question).toEqual({ character: null, text: "A bell rings. What now?" });
    expect(ui.choiceBox!.question).toMatchObject({ name: null, lines: ["A bell rings. What now?"] });
    expect(drawn(ui, STYLED).filter((e) => e.kind === "text")[0]!.text).toBe("A bell rings. What now?");
  });

  it("is the node's own: a line said just before it is a line, not the question", () => {
    const { s, ui } = setup(WITH_LINE);
    untilChoices(s);
    expect(ui.choiceBox!.question).toMatchObject({ name: "Gardener", lines: [QUESTION] });
    expect(drawn(ui, STYLED).some((e) => e.text === "Welcome! Have a look at my wares.")).toBe(false);
  });

  it("is there when play starts from the Choices node", () => {
    const s = new Session(testProject({ game: { style: STYLED }, dialogues: [WITH_LINE] }), testImages);
    s.startDialogue("shop", "menu");
    untilChoices(s);
    expect(s.choices?.question).toEqual({ character: "gardener", text: QUESTION });
  });

  it("stays through hover and pages, and is gone once an option is picked", () => {
    const { s, ui } = setup(long(QUESTION, TWELVE));
    untilChoices(s);
    const first = ui.choiceBox!;
    expect(first.pages).toBeGreaterThan(1);
    expect(first.question!.lines).toEqual([QUESTION]);
    ui.pointerMove(centre(first.rows[0]!), "mouse");
    expect(ui.choiceBox!.question).toEqual(first.question);
    tap(ui, ...centre(first.more!));
    expect(ui.choicePage).toBe(1);
    expect(ui.choiceBox!.question).toMatchObject({ name: "Gardener", lines: [QUESTION] });
    expect(drawn(ui, STYLED).some((e) => e.text === QUESTION)).toBe(true);
    const row = ui.choiceBox!.rows[0]!;
    tap(ui, ...centre(row));
    expect(s.choices).toBe(null);
    expect(ui.choiceBox).toBe(null);
  });

  it("is asked again when the dialogue loops back to the node", () => {
    const { s, ui } = setup(SHOP);
    untilChoices(s);
    s.choose("a");
    expect(s.choices).toBe(null);
    untilChoices(s);
    expect(ui.choiceBox!.question).toMatchObject({ name: "Gardener", lines: [QUESTION] });
  });

  it("is not part of the saved state, so a restored game has no list and no question", () => {
    const { s } = setup(SHOP);
    untilChoices(s);
    const saved = JSON.parse(JSON.stringify(s.state));
    expect(JSON.stringify(saved)).not.toContain("do for you");
    s.load(saved);
    expect(s.choices).toBe(null);
  });

  it("wraps a long question to the rows' width and grows the box without leaving the screen", () => {
    const text = "The garden is quiet and the gardener glares at you from behind a wheelbarrow while the pond ripples. ".repeat(3).trim();
    for (const [style, borders] of [[STYLED, null], [PLACED, null], [PLACED, BORDERS], [STYLED, BORDERS]] as const) {
      const { s, ui } = setup(long(text), style, borders);
      untilChoices(s);
      const box = ui.choiceBox!;
      const short = setup(SHOP, style, borders);
      untilChoices(short.s);
      expect(box.question!.lines.length).toBeGreaterThan(1);
      expect(box.panel.h).toBeGreaterThan(short.ui.choiceBox!.panel.h);
      expectOnScreen(box);
      const room = (box.inner ?? box.panel).w - 16;
      for (const l of box.question!.lines) expect(measure(l)).toBeLessThanOrEqual(room);
      expect(box.question!.lines.join(" ")).toBe(text);
    }
  });

  it("shrinks a very long question, then cuts it, so the box and at least two rows stay on screen", () => {
    const huge = "word ".repeat(1500).trim();
    const style: GameStyle = { ...PLACED, typography: { size: 40 } };
    for (const cssScale of [1, 0.5]) {
      const { s, ui } = setup(long(huge), style, BORDERS);
      untilChoices(s);
      ui.setScale(cssScale);
      const box = ui.choiceBox!;
      expectOnScreen(box);
      expect(box.question!.size).toBeLessThan(40);
      expect(box.question!.lines.at(-1)!.endsWith("…")).toBe(true);
      expect(box.rows.length + (box.more ? 1 : 0)).toBeGreaterThanOrEqual(2);
      for (const r of box.rows) expect(r.h).toBeGreaterThanOrEqual(ui.layout.unit);
    }
  });

  it("pages with fewer rows when the question takes the room, and every row stays tappable", () => {
    const { s, ui } = setup(long("word ".repeat(120).trim(), TWELVE), PLACED);
    untilChoices(s);
    const short = setup(long(QUESTION, TWELVE), PLACED);
    untilChoices(short.s);
    const box = ui.choiceBox!;
    expectOnScreen(box);
    expect(box.rows.length).toBeLessThan(short.ui.choiceBox!.rows.length);
    expect(box.pages).toBeGreaterThan(short.ui.choiceBox!.pages);
    box.rows.forEach((r) => expect(r.h).toBeGreaterThanOrEqual(ui.layout.unit));
    expect(box.rows[0]!.y).toBeGreaterThanOrEqual(box.question!.y + box.question!.height);
  });

  it("taps the rows where they are drawn and ignores the question", () => {
    for (const [style, borders] of [[STYLED, null], [PLACED, BORDERS]] as const) {
      const { s, ui } = setup(SHOP, style, borders);
      untilChoices(s);
      const box = ui.choiceBox!;
      const q = box.question!;
      tap(ui, q.x, q.y + 2);
      tap(ui, q.x, q.y + q.height - q.pad - 2);
      const sep = separatorRect(box);
      tap(ui, q.x, sep.y);
      expect(s.choices).not.toBe(null);
      expect(s.state.dialogueChoices).toEqual([]);
      expect(box.rows.every((r) => r.y >= sep.y + sep.h)).toBe(true);
      tap(ui, ...centre(box.rows[2]!));
      expect(s.choices).toBe(null);
      expect(s.dialogue).toBe(null);
    }
  });

  it("never shows a speech box beside the list", () => {
    const { s } = setup(WITH_LINE);
    untilChoices(s);
    expect(s.text).toBe(null);
  });
});

function expectOnScreen(box: ChoiceBox) {
  expect(box.panel.y).toBeGreaterThanOrEqual(0);
  expect(box.panel.y + box.panel.h).toBeLessThanOrEqual(SCENE_HEIGHT);
  expect(box.panel.x).toBeGreaterThanOrEqual(0);
  expect(box.panel.x + box.panel.w).toBeLessThanOrEqual(SCENE_WIDTH);
  for (const r of [...box.rows, ...(box.more ? [box.more] : [])]) {
    expect(r.y).toBeGreaterThanOrEqual(box.panel.y);
    expect(r.y + r.h).toBeLessThanOrEqual(box.panel.y + box.panel.h);
  }
}
