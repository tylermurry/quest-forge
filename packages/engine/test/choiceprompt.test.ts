import { describe, expect, it } from "vitest";
import { SCENE_HEIGHT, SCENE_WIDTH, type GameStyle } from "@questforge/schema";
import { DEFAULT_SETTINGS, SaveSlots } from "../src/saves.ts";
import { Session } from "../src/session.ts";
import { choicesLook } from "../src/ui/choices.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { drawChoiceBox } from "../src/ui/draw.ts";
import { choiceLayout, separatorRect, type ChoiceBox } from "../src/ui/layout.ts";
import { textStyle } from "../src/ui/typography.ts";
import { testImages, testProject } from "./support/project.ts";

// The styled choice box shows the line said just before it (name, text) above the separator, inside the same panel.
// Legacy boxes, and choices that come first, keep today's box.

type Raw = Record<string, unknown>;
const WELCOME = "Welcome! Have a look at my wares.";
const opt = (id: string, text: string, next: string | null = "done") => ({ id, text, if: [], once: false, next });
const start = (next: string) => ({ id: "start", type: "start", pos: [0, 0], next });
const say = (id: string, text: string, next: string, character: string | null = "gardener") => ({ id, type: "line", pos: [0, 0], ...(character ? { character } : {}), text, next });
const choices = (options: Raw[]) => ({ id: "menu", type: "choices", pos: [0, 0], options });
const end = { id: "done", type: "end", pos: [0, 0] };
const THREE = [opt("a", "Ask about the pond", "news"), opt("b", "Ask about the rod"), opt("c", "Say goodbye")];
const TWELVE = Array.from({ length: 12 }, (_, i) => opt(`o${i}`, `Option ${i}`));

const SHOP = { id: "shop", nodes: [start("hello"), say("hello", WELCOME, "menu"), choices(THREE), say("news", "Nothing ever happens here.", "menu"), end] };
const FIRST = { id: "shop", nodes: [start("menu"), choices(THREE), end] };
const AFTER_ACTIONS = { id: "shop", nodes: [start("hello"), say("hello", WELCOME, "act"), { id: "act", type: "actions", pos: [0, 0], do: [], next: "menu" }, choices(THREE), end] };
const NARRATED = { id: "shop", nodes: [start("hello"), say("hello", "A bell rings.", "menu", null), choices(THREE), end] };

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

describe("the choice box's prompt", () => {
  it("shows the speaker's name, their line, the separator, then the rows, in one panel", () => {
    const { s, ui } = setup(SHOP);
    untilChoices(s);
    const box = ui.choiceBox!;
    expect(box.prompt).toMatchObject({ name: "Gardener", lines: [WELCOME] });
    const sep = separatorRect(box);
    // The prompt is inside the panel and ends one separator-space above the line.
    expect(box.prompt!.y).toBeGreaterThanOrEqual(box.panel.y);
    expect(box.prompt!.y + box.prompt!.height - box.prompt!.pad).toBe(sep.y - 8);
    expect(box.rows[0]!.y).toBe(sep.y + sep.h + 8);

    const events = drawn(ui, STYLED);
    const order = events.filter((e) => e.kind === "text" || e.color === "#ff0000");
    expect(order.map((e) => e.text ?? "separator")).toEqual(["Gardener", WELCOME, "separator", "Ask about the pond", "Ask about the rod", "Say goodbye"]);
    expect(order[0]).toMatchObject({ color: "#ff00ff" });
    expect(order[0]!.font).toContain("bold");
    expect(order[1]).toMatchObject({ color: "#00ff00" });
    expect(order[1]!.font).not.toContain("bold");
    expect(order[0]!.y).toBeLessThan(order[1]!.y);
    expect(order[1]!.y).toBeLessThan(order[2]!.y);
  });

  it("keeps the old box when Dialogue Choices isn't styled: no prompt, the same rows", () => {
    const { s, ui } = setup(SHOP, { typography: { color: "#00ff00" } });
    untilChoices(s);
    expect(ui.choiceBox!.prompt).toBeUndefined();
    expect(ui.choiceBox).toEqual(choiceLayout(ui.layout.unit, 3, 0, false, null, null));
    const none = setup(SHOP, null);
    untilChoices(none.s);
    expect(none.ui.choiceBox!.prompt).toBeUndefined();
    expect(drawn(ui, { typography: { color: "#00ff00" } }).filter((e) => e.kind === "text")).toHaveLength(3);
  });

  it("shows none when the choices come first or an Actions node came between", () => {
    for (const d of [FIRST, AFTER_ACTIONS]) {
      const { s, ui } = setup(d);
      untilChoices(s);
      expect(s.choices!.prompt).toBe(null);
      expect(ui.choiceBox!.prompt).toBeUndefined();
      expect(ui.choiceBox).toEqual(choiceLayout(ui.layout.unit, 3, 0, true, null, null));
    }
  });

  it("borrows the line that leads into a Choices node when play starts from that node", () => {
    const s = new Session(testProject({ game: { style: STYLED }, dialogues: [SHOP] }), testImages);
    s.startDialogue("shop", "menu");
    untilChoices(s);
    expect(s.choices?.prompt).toEqual({ character: "gardener", text: WELCOME });
  });

  it("borrows nothing when play starts from a Choices node no line leads into", () => {
    const s = new Session(testProject({ game: { style: STYLED }, dialogues: [FIRST] }), testImages);
    s.startDialogue("shop", "menu");
    untilChoices(s);
    expect(s.choices?.prompt).toBeNull();
  });

  it("shows a narrator's line without a name", () => {
    const { s, ui } = setup(NARRATED);
    untilChoices(s);
    expect(ui.choiceBox!.prompt).toMatchObject({ name: null, lines: ["A bell rings."] });
    expect(drawn(ui, STYLED).filter((e) => e.kind === "text")[0]!.text).toBe("A bell rings.");
  });

  it("stays through hover and pages, and is gone once an option is picked", () => {
    const { s, ui } = setup({ id: "shop", nodes: [start("hello"), say("hello", WELCOME, "menu"), choices(TWELVE), end] });
    untilChoices(s);
    const first = ui.choiceBox!;
    expect(first.pages).toBeGreaterThan(1);
    expect(first.prompt!.lines).toEqual([WELCOME]);
    ui.pointerMove(centre(first.rows[0]!), "mouse");
    expect(ui.choiceBox!.prompt).toEqual(first.prompt);
    tap(ui, ...centre(first.more!));
    expect(ui.choicePage).toBe(1);
    expect(ui.choiceBox!.prompt).toMatchObject({ name: "Gardener", lines: [WELCOME] });
    expect(drawn(ui, STYLED).some((e) => e.text === WELCOME)).toBe(true);
    const row = ui.choiceBox!.rows[0]!;
    tap(ui, ...centre(row));
    expect(s.choices).toBe(null);
    expect(ui.choiceBox).toBe(null);
  });

  it("is the newest line after a loop back, and not carried past an Actions node", () => {
    const { s, ui } = setup(SHOP);
    untilChoices(s);
    s.choose("a");
    expect(s.choices).toBe(null);
    untilChoices(s);
    expect(ui.choiceBox!.prompt).toMatchObject({ name: "Gardener", lines: ["Nothing ever happens here."] });
  });

  it("is not part of the saved state, so a restored game has no list and no prompt", () => {
    const { s } = setup(SHOP);
    untilChoices(s);
    const saved = JSON.parse(JSON.stringify(s.state));
    expect(JSON.stringify(saved)).not.toContain("Welcome");
    s.load(saved);
    expect(s.choices).toBe(null);
  });

  it("wraps a long prompt to the rows' width and grows the box without leaving the screen", () => {
    const long = "The garden is quiet and the gardener glares at you from behind a wheelbarrow while the pond ripples. ".repeat(3).trim();
    for (const [style, borders] of [[STYLED, null], [PLACED, null], [PLACED, BORDERS], [STYLED, BORDERS]] as const) {
      const { s, ui } = setup({ id: "shop", nodes: [start("hello"), say("hello", long, "menu"), choices(THREE), end] }, style, borders);
      untilChoices(s);
      const box = ui.choiceBox!;
      const short = setup(SHOP, style, borders);
      untilChoices(short.s);
      expect(box.prompt!.lines.length).toBeGreaterThan(1);
      expect(box.panel.h).toBeGreaterThan(short.ui.choiceBox!.panel.h);
      expectOnScreen(box);
      const room = (box.inner ?? box.panel).w - 16;
      for (const l of box.prompt!.lines) expect(measure(l)).toBeLessThanOrEqual(room);
      expect(box.prompt!.lines.join(" ")).toBe(long);
    }
  });

  it("shrinks very long text, then cuts it, so the box and at least two rows stay on screen", () => {
    const huge = "word ".repeat(1500).trim();
    const style: GameStyle = { ...PLACED, typography: { size: 40 } };
    for (const cssScale of [1, 0.5]) {
      const { s, ui } = setup({ id: "shop", nodes: [start("hello"), say("hello", huge, "menu"), choices(THREE), end] }, style, BORDERS);
      untilChoices(s);
      ui.setScale(cssScale);
      const box = ui.choiceBox!;
      expectOnScreen(box);
      expect(box.prompt!.size).toBeLessThan(40);
      expect(box.prompt!.lines.at(-1)!.endsWith("…")).toBe(true);
      expect(box.rows.length + (box.more ? 1 : 0)).toBeGreaterThanOrEqual(2);
      for (const r of box.rows) expect(r.h).toBeGreaterThanOrEqual(ui.layout.unit);
    }
  });

  it("pages with fewer rows when the prompt takes the room, and every row stays tappable", () => {
    const text = "word ".repeat(120).trim();
    const { s, ui } = setup({ id: "shop", nodes: [start("hello"), say("hello", text, "menu"), choices(TWELVE), end] }, PLACED);
    untilChoices(s);
    const plain = setup({ id: "shop", nodes: [start("menu"), choices(TWELVE), end] }, PLACED);
    untilChoices(plain.s);
    const box = ui.choiceBox!;
    expectOnScreen(box);
    expect(box.rows.length).toBeLessThan(plain.ui.choiceBox!.rows.length);
    expect(box.pages).toBeGreaterThan(plain.ui.choiceBox!.pages);
    box.rows.forEach((r) => expect(r.h).toBeGreaterThanOrEqual(ui.layout.unit));
    expect(box.rows[0]!.y).toBeGreaterThanOrEqual(box.prompt!.y + box.prompt!.height);
  });

  it("taps the rows where they are drawn and ignores the prompt", () => {
    for (const [style, borders] of [[STYLED, null], [PLACED, BORDERS]] as const) {
      const { s, ui } = setup(SHOP, style, borders);
      untilChoices(s);
      const box = ui.choiceBox!;
      const p = box.prompt!;
      tap(ui, p.x, p.y + 2);
      tap(ui, p.x, p.y + p.height - p.pad - 2);
      const sep = separatorRect(box);
      tap(ui, p.x, sep.y);
      expect(s.choices).not.toBe(null);
      expect(s.state.dialogueChoices).toEqual([]);
      expect(box.rows.every((r) => r.y >= sep.y + sep.h)).toBe(true);
      tap(ui, ...centre(box.rows[2]!));
      expect(s.choices).toBe(null);
      expect(s.dialogue).toBe(null);
    }
  });

  it("never shows the line's speech box beside the list", () => {
    const { s } = setup(SHOP);
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
