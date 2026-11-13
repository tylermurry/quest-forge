import { describe, expect, it } from "vitest";
import { choiceKey } from "../src/dialogue.ts";
import { Session, type SessionStart } from "../src/session.ts";
import type { TraceEvent } from "../src/trace.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { MIN_HIT_CSS } from "../src/ui/layout.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// Dialogues through a headless session. The gardener
// runs a little shop: a once-only question, a choice that needs the key (our coin),
// and a loop back to the main menu.

type Raw = Record<string, unknown>;
const line = (id: string, text: string, next: string | null, extra: Raw = {}) => ({ id, type: "line", pos: [0, 0], character: "gardener", text, next, ...extra });
const option = (id: string, text: string, next: string | null, extra: Raw = {}) => ({ id, text, if: [], once: false, next, ...extra });

const SHOP = {
  id: "shop",
  nodes: [
    { id: "start", type: "start", pos: [0, 0], next: "hello" },
    line("hello", "Welcome!", "menu"),
    {
      id: "menu",
      type: "choices",
      pos: [0, 0],
      character: "gardener",
      text: "What will it be?",
      options: [
        option("ask", "What's new?", "news", { once: true }),
        option("buy", "I'll buy the rod.", "sell", { if: [{ type: "has_item", item: "key" }] }),
        option("bye", "Goodbye.", "done"),
      ],
    },
    line("news", "Nothing ever happens here.", "menu"),
    { id: "sell", type: "actions", pos: [0, 0], do: [{ type: "take_item", item: "key" }, { type: "give_item", item: "rod" }], next: "menu" },
    { id: "done", type: "end", pos: [0, 0] },
  ],
};

const GARDENER: [number, number] = [500, 360];
const talkRule = (after: Raw[] = [{ type: "add_to_counter", counter: "n", amount: 1 }]) =>
  rule({ type: "talk" }, [{ type: "start_dialogue", dialogue: "shop" }, ...after]);

function make(opts: { dialogues?: Raw[]; endRule?: Raw[] | null; talk?: Raw; start?: SessionStart; events?: TraceEvent[] } = {}) {
  const endRule = opts.endRule === undefined ? [narrate("The gardener waves."), { type: "set_flag", flag: "open", value: true }] : opts.endRule;
  const project = testProject({
    game: { rules: endRule ? [rule({ type: "dialogue_end", dialogue: "shop" }, endRule)] : [] },
    yard: { characters: [{ character: "gardener", x: 500, y: 380, facing: "left", visible: true, rules: [opts.talk ?? talkRule()] }] },
    dialogues: opts.dialogues ?? [SHOP],
  });
  const events = opts.events;
  return new Session(project, testImages, opts.start ?? {}, undefined, events ? { trace: (e) => events.push(e) } : {});
}

const tick = (s: Session, n = 1) => {
  for (let i = 0; i < n; i++) s.tick(1 / 60);
};
/** Talk to the gardener and wait for the approach walk. */
function talk(s: Session) {
  s.selectVerb("talk");
  s.primaryClick(GARDENER);
  for (let i = 0; i < 1200 && s.world.walking; i++) s.tick(1 / 60);
  tick(s);
}
/** Click through text boxes until the list box (or nothing) is up. */
function untilChoices(s: Session) {
  for (let i = 0; i < 50 && s.text; i++) {
    s.primaryClick([10, 10]);
    tick(s);
  }
}
const options = (s: Session) => s.choices?.options.map((o) => o.id) ?? null;

describe("dialogue graph at runtime", () => {
  it("shows the speaker's line in their color, then the list box", () => {
    const s = make();
    talk(s);
    expect(s.busy).toBe(true);
    expect(s.text).toMatchObject({ kind: "say", text: "Welcome!", speaker: { id: "gardener", color: "#88cc88" } });
    expect(s.choices).toBe(null);
    untilChoices(s);
    expect(s.dialogue).toEqual({ id: "shop", node: "menu" });
    // No key: the rod option is hidden (its condition fails).
    expect(options(s)).toEqual(["ask", "bye"]);
  });

  it("a once-only option is gone after it is chosen, and the loop returns to the menu", () => {
    const s = make();
    talk(s);
    untilChoices(s);
    s.choose("ask");
    expect(s.text?.text).toBe("Nothing ever happens here.");
    expect(s.state.dialogueChoices).toEqual([choiceKey("shop", "menu", "ask")]);
    untilChoices(s);
    expect(s.dialogue?.node).toBe("menu");
    expect(options(s)).toEqual(["bye"]);
  });

  it("an option gated on having the coin shows only while you have it", () => {
    const s = make();
    s.state.inventory.push("key");
    talk(s);
    untilChoices(s);
    expect(options(s)).toEqual(["ask", "buy", "bye"]);
    s.choose("buy");
    // Actions run at once and loop back to the menu.
    expect(s.state.inventory).toEqual(["rod"]);
    expect(s.dialogue?.node).toBe("menu");
    expect(options(s)).toEqual(["ask", "bye"]);
    // A hidden option can't be picked.
    s.choose("buy");
    expect(s.state.inventory).toEqual(["rod"]);
  });

  it("End fires dialogue_end, then the rule that started the dialogue goes on", () => {
    const s = make();
    talk(s);
    untilChoices(s);
    s.choose("bye");
    // The End node stays current while the dialogue_end rule runs.
    expect(s.dialogue).toEqual({ id: "shop", node: "done" });
    expect(s.text?.text).toBe("The gardener waves.");
    expect(s.state.counters.n).toBe(0);
    s.primaryClick([10, 10]);
    tick(s);
    expect(s.dialogue).toBe(null);
    expect(s.state.flags.open).toBe(true);
    expect(s.state.counters.n).toBe(1);
    expect(s.busy).toBe(false);
    expect(s.state.fired.some((k) => k.startsWith("game/"))).toBe(true);
  });

  it("an unconnected port ends the dialogue and fires dialogue_end", () => {
    const s = make({ dialogues: [{ id: "shop", nodes: [{ id: "start", type: "start", pos: [0, 0], next: "hi" }, line("hi", "Hm?", null)] }] });
    talk(s);
    expect(s.text?.text).toBe("Hm?");
    s.primaryClick([10, 10]);
    expect(s.text?.text).toBe("The gardener waves.");
    untilChoices(s);
    expect(s.busy).toBe(false);
    expect(s.state.flags.open).toBe(true);
  });

  it("a Choices node with every option hidden ends the dialogue", () => {
    const s = make({
      endRule: null,
      dialogues: [{ id: "shop", nodes: [{ id: "start", type: "start", pos: [0, 0], next: "menu" }, { id: "menu", type: "choices", pos: [0, 0], text: "Well?", options: [option("buy", "Buy", null, { if: [{ type: "has_item", item: "key" }] })] }] }],
    });
    talk(s);
    expect(s.choices).toBe(null);
    expect(s.busy).toBe(false);
    expect(s.log.at(-1)).toMatch(/Every option of menu is hidden/);
    expect(s.state.counters.n).toBe(1);
  });

  it("Branch checks conditions through the rule engine", () => {
    const branchy = {
      id: "shop",
      nodes: [
        { id: "start", type: "start", pos: [0, 0], next: "check" },
        { id: "check", type: "branch", pos: [0, 0], if: [{ type: "flag_is", flag: "open", value: true }, { type: "first_time" }], then: "yes", else: "no" },
        line("yes", "Open, first time.", null),
        line("no", "Not that.", null),
      ],
    };
    const s = make({ dialogues: [branchy], endRule: null });
    s.state.flags.open = true;
    talk(s);
    expect(s.text?.text).toBe("Open, first time.");
    untilChoices(s);
    talk(s);
    // `first_time` on a Branch is false once it has been passed.
    expect(s.text?.text).toBe("Not that.");
  });

  it("stops a loop with no Line or Choices instead of hanging", () => {
    const events: TraceEvent[] = [];
    const loop = {
      id: "shop",
      nodes: [
        { id: "start", type: "start", pos: [0, 0], next: "count" },
        { id: "count", type: "actions", pos: [0, 0], do: [{ type: "add_to_counter", counter: "n", amount: 10 }], next: "check" },
        { id: "check", type: "branch", pos: [0, 0], if: [], then: "count", else: null },
      ],
    };
    const s = make({ dialogues: [loop], events, talk: talkRule([]) });
    talk(s);
    expect(s.busy).toBe(false);
    expect(s.state.counters.n).toBe(10);
    expect(s.state.flags.open).toBe(false);
    expect(events.find((e) => e.type === "dialogue_end")).toEqual({ type: "dialogue_end", dialogue: "shop", reason: "loop" });
    expect(s.log.at(-1)).toMatch(/came back to count/);
  });

  it("a scene change inside the dialogue cuts it and the rule short", () => {
    const leave = {
      id: "shop",
      nodes: [
        { id: "start", type: "start", pos: [0, 0], next: "go" },
        { id: "go", type: "actions", pos: [0, 0], do: [{ type: "change_scene", scene: "shed", spawn: "door" }, { type: "give_item", item: "key" }], next: "done" },
        { id: "done", type: "end", pos: [0, 0] },
      ],
    };
    const s = make({ dialogues: [leave] });
    talk(s);
    tick(s, 2);
    expect(s.scene.id).toBe("shed");
    expect(s.dialogue).toBe(null);
    expect(s.busy).toBe(false);
    expect(s.state.inventory).toEqual([]);
    expect(s.state.counters.n).toBe(0);
    expect(s.state.flags.open).toBe(false);
  });

  it("a narrator line uses the narrate box; a speaker's animation plays while the line shows", () => {
    const s = make({
      endRule: null,
      dialogues: [
        {
          id: "shop",
          nodes: [
            { id: "start", type: "start", pos: [0, 0], next: "n" },
            { id: "n", type: "line", pos: [0, 0], text: "A breeze.", next: "w" },
            line("w", "Hello.", null, { animation: "walk_down" }),
          ],
        },
      ],
    });
    talk(s);
    expect(s.text).toMatchObject({ kind: "narrate", text: "A breeze." });
    s.primaryClick([10, 10]);
    tick(s);
    const gardener = s.world.actorById("gardener")!;
    expect(s.text?.text).toBe("Hello.");
    expect(gardener.special).not.toBe(null);
    s.primaryClick([10, 10]);
    tick(s);
    expect(gardener.special).toBe(null);
    expect(s.busy).toBe(false);
  });

  it("only one dialogue plays at a time", () => {
    const nested = {
      id: "shop",
      nodes: [
        { id: "start", type: "start", pos: [0, 0], next: "again" },
        { id: "again", type: "actions", pos: [0, 0], do: [{ type: "start_dialogue", dialogue: "shop" }], next: null },
      ],
    };
    const s = make({ dialogues: [nested], endRule: null });
    talk(s);
    expect(s.busy).toBe(false);
    expect(s.log).toContainEqual(expect.stringMatching(/Ignored starting dialogue shop/));
  });

  it("can start at a given node once the scene is entered (playtest)", () => {
    const s = make({ start: { dialogue: { id: "shop", node: "menu" } } });
    expect(s.busy).toBe(true);
    tick(s);
    expect(s.dialogue).toEqual({ id: "shop", node: "menu" });
    expect(options(s)).toEqual(["ask", "bye"]);
    s.restart();
    tick(s);
    expect(s.dialogue?.node).toBe("menu");
  });

  it("traces nodes, options, choices, branches and the end", () => {
    const events: TraceEvent[] = [];
    const s = make({ events });
    talk(s);
    untilChoices(s);
    s.choose("bye");
    untilChoices(s);
    const dlg = events.filter((e) => e.type.startsWith("dialogue")).map((e) => (e.type === "dialogue_node" ? `node:${e.node.id}` : e.type));
    expect(dlg).toEqual(["dialogue_start", "node:start", "node:hello", "node:menu", "dialogue_options", "dialogue_choice", "node:done", "dialogue_end"]);
    const opts = events.find((e) => e.type === "dialogue_options");
    expect(opts).toEqual({
      type: "dialogue_options",
      dialogue: "shop",
      node: "menu",
      options: [
        { id: "ask", verdict: { kind: "shown" } },
        { id: "buy", verdict: { kind: "condition_failed", index: 0, condition: { type: "has_item", item: "key" } } },
        { id: "bye", verdict: { kind: "shown" } },
      ],
    });
    // The dialogue_end rule is traced like any rule.
    expect(events.some((e) => e.type === "trigger" && e.trigger.type === "dialogue_end")).toBe(true);
  });
});

describe("the list box", () => {
  /** A tap on a touch screen at a scene point. */
  const tap = (ui: PlayerUi, p: [number, number]) => {
    ui.pointerDown(p, "touch");
    ui.pointerUp(p, "touch");
  };
  const centre = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

  it("plays by taps only, with every option at least 44 CSS px tall", () => {
    const s = make();
    s.state.inventory.push("key");
    const ui = new PlayerUi(s);
    ui.setScale(0.6); // a small phone: 0.6 CSS px per scene px
    talk(s);
    tap(ui, [10, 10]);
    tick(s);
    const box = ui.choiceBox!;
    expect(box.rows).toHaveLength(3);
    for (const r of box.rows) expect(r.h * 0.6).toBeGreaterThanOrEqual(MIN_HIT_CSS);
    tap(ui, centre(box.rows[1]!));
    expect(s.state.inventory).toEqual(["rod"]);
    tap(ui, centre(ui.choiceBox!.rows[1]!)); // now "bye"
    expect(s.text?.text).toBe("The gardener waves.");
    tap(ui, [10, 10]);
    expect(s.dialogue).toBe(null);
  });

  it("pages options that don't fit with More…", () => {
    const many = Array.from({ length: 14 }, (_, i) => option(`o${i}`, `Option ${i}`, "done"));
    const s = make({ dialogues: [{ id: "shop", nodes: [{ id: "start", type: "start", pos: [0, 0], next: "menu" }, { id: "menu", type: "choices", pos: [0, 0], text: "Well?", options: many }, { id: "done", type: "end", pos: [0, 0] }] }], endRule: null });
    const ui = new PlayerUi(s);
    ui.setScale(1);
    talk(s);
    const box = ui.choiceBox!;
    expect(box.pages).toBeGreaterThan(1);
    expect(box.more).not.toBe(null);
    const firstPage = box.rows.length;
    ui.pointerDown(centre(box.more!), "mouse");
    expect(ui.choiceBox!.first).toBe(firstPage);
    const pick = ui.choiceBox!.rows[0]!;
    ui.pointerDown(centre(pick), "mouse");
    expect(s.state.fired).toContain(`dialogue:shop/menu/o${firstPage}`);
  });
});
