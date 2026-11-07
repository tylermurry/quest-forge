import { describe, expect, it } from "vitest";
import { choiceKey } from "@questforge/engine";
import { DialogueFile, type Project } from "@questforge/schema";
import { locate } from "../src/model/locate.ts";
import { formatLog } from "../src/model/playtest/log.ts";
import { sanitizeState } from "../src/model/playtest/presets.ts";
import { applyStateEdit, stateView } from "../src/model/playtest/state.ts";
import { m1Project } from "./support/fixtures.ts";
import { playtestEditor } from "./support/playtest.ts";

// Dialogues in the playtest (spec 11 "Play from this node", spec 12): the D142 scene
// context, the event log's dialogue lines with jump-to, and the state panel.

const GARDENER: [number, number] = [560, 300];

/** The m1 project plus a shop dialogue the gardener starts (before his own talk rules). */
async function withShop(started = true): Promise<Project> {
  const p = await m1Project();
  const shop = DialogueFile.parse({
    schemaVersion: 2,
    id: "shop",
    name: "Shop",
    nodes: [
      { id: "start", type: "start", pos: [0, 0], next: "hello" },
      { id: "hello", type: "line", pos: [300, 0], character: "gardener", text: "Welcome!", next: "menu" },
      {
        id: "menu",
        type: "choices",
        pos: [600, 0],
        options: [
          { id: "ask", text: "What's new?", if: [], once: true, next: "news" },
          { id: "buy", text: "Buy the rod.", if: [{ type: "has_item", item: "fish" }], once: false, next: "sell" },
          { id: "bye", text: "Goodbye.", if: [], once: false, next: "done" },
        ],
      },
      { id: "news", type: "line", pos: [900, -100], character: "gardener", text: "Nothing at all.", next: "menu" },
      { id: "sell", type: "actions", pos: [900, 100], do: [{ type: "take_item", item: "fish" }, { type: "give_item", item: "rod" }], next: "menu" },
      { id: "done", type: "end", pos: [900, 300] },
    ],
  });
  return {
    ...p,
    dialogues: [{ path: "dialogues/shop.dialogue.yaml", data: shop }],
    scenes: p.scenes.map((d) => {
      if (!started || d.data.id !== "garden") return d;
      const characters = d.data.characters.map((c) =>
        c.character === "gardener" ? { ...c, rules: [{ id: "rule_9", when: { type: "talk" as const }, if: [], do: [{ type: "start_dialogue" as const, dialogue: "shop" }], once: false }, ...c.rules] } : c,
      );
      return { ...d, data: { ...d.data, characters } };
    }),
  };
}

describe("Play from this node (spec 11, D142)", () => {
  it("starts in the scene that starts the dialogue, at the selected node", async () => {
    const { playtest, ws, session, tick, dispose } = await playtestEditor(await withShop());
    expect(playtest.nodeTarget()).toBe(null);
    ws.select({ kind: "dialogueNode", dialogue: "shop", node: "menu" });
    expect(playtest.nodeTarget()).toEqual({ dialogue: "shop", node: "menu", scene: "garden", spawn: "default" });
    expect(playtest.playNode()).toBe(true);
    tick();
    expect(session().dialogue).toEqual({ id: "shop", node: "menu" });
    expect(session().choices?.options.map((o) => o.id)).toEqual(["ask", "bye"]);
    // Restart replays from the node (D142).
    session().choose("ask");
    playtest.restart();
    tick();
    expect(session().dialogue?.node).toBe("menu");
    dispose();
  });

  it("uses the game's start when no scene starts it, and is blocked by errors like Play (D38)", async () => {
    const p = await withShop(false);
    const { playtest, ws, editor, session, tick, dispose } = await playtestEditor(p);
    ws.select({ kind: "dialogueNode", dialogue: "shop", node: "start" });
    expect(playtest.nodeTarget()).toMatchObject({ scene: "garden", spawn: "default" });
    playtest.playNode();
    tick();
    expect(session().text?.text).toBe("Welcome!");
    playtest.stop();
    editor.apply("Break", (q) => ({ ...q, dialogues: q.dialogues.map((d) => ({ ...d, data: { ...d.data, nodes: d.data.nodes.map((n) => (n.id === "hello" ? { ...n, text: "" } : n)) } })) }));
    expect(playtest.playNode()).toBe(false);
    expect(playtest.playing).toBe(false);
    dispose();
  });
});

describe("dialogues in the event log and state panel (spec 12)", () => {
  it("logs lines, options and why some are hidden, choices and the end, each jumping to its node", async () => {
    const { playtest, editor, ws, session, tap, settle, dispose } = await playtestEditor(await withShop());
    playtest.play();
    tap("talk", GARDENER);
    // The greeting closed by itself (D78); the list box waits.
    session().choose("ask");
    settle();
    session().choose("bye");
    settle();
    const lines = formatLog(playtest.events, playtest.run!.project, editor.project);
    const text = lines.map((l) => `${"  ".repeat(l.depth)}${l.text}`);
    const start = text.findIndex((t) => t.startsWith("Dialogue “Shop” starts"));
    expect(text.slice(start)).toEqual([
      "Dialogue “Shop” starts",
      "  Gardener: “Welcome!”",
      "  Choices: 2 of 3 options shown",
      "  Option “Buy the rod.” hidden: condition 1 failed: Player has fish",
      "Player chose “What's new?”",
      "  Gardener: “Nothing at all.”",
      "  Choices: 1 of 3 options shown",
      "  Option “What's new?” hidden: it's once-only and was already chosen",
      "  Option “Buy the rod.” hidden: condition 1 failed: Player has fish",
      "Player chose “Goodbye.”",
      "  End node",
      "Dialogue “Shop” ends",
      "Dialogue ends Shop (Game)",
      "  1 rule for other verbs",
      "  No rule matched",
    ]);
    // The hidden option's line jumps to its failed condition; jumping selects the node (D121).
    const hidden = lines[start + 3]!;
    expect(hidden.jump?.location).toEqual({ file: "dialogues/shop.dialogue.yaml", path: ["nodes", 2, "options", 1, "if", 0] });
    ws.jumpTo(hidden.jump!);
    expect(ws.selection).toEqual({ kind: "dialogueNode", dialogue: "shop", node: "menu" });
    expect(ws.active).toBe("dialogue:shop");
    dispose();
  });

  it("shows the dialogue and once-only options, and edits them live (D130)", async () => {
    const { playtest, editor, session, tap, dispose } = await playtestEditor(await withShop());
    playtest.play();
    tap("talk", GARDENER);
    let v = stateView(editor.project, session());
    expect(v.dialogue).toEqual({ id: "shop", name: "Shop", node: "menu", nodeType: "choices" });
    expect(v.onceOptions).toEqual([{ key: choiceKey("shop", "menu", "ask"), dialogue: "Shop", text: "What's new?", chosen: false }]);
    applyStateEdit(session(), { kind: "setChoice", key: choiceKey("shop", "menu", "ask"), chosen: true });
    v = stateView(editor.project, session());
    expect(v.onceOptions[0]!.chosen).toBe(true);
    applyStateEdit(session(), { kind: "giveItem", item: "fish" });
    session().choose("bye");
    tap("talk", GARDENER);
    // The menu is offered again: the once-only option stays hidden, the fish shows Buy.
    expect(session().choices?.options.map((o) => o.id)).toEqual(["buy", "bye"]);
    dispose();
  });

  it("presets drop once-only choices and dialogue keys the project no longer has (D126)", async () => {
    const p = await withShop();
    const { playtest, session, tap, dispose } = await playtestEditor(p);
    playtest.play();
    tap("talk", GARDENER);
    session().choose("ask");
    const state = structuredClone(session().state);
    state.dialogueChoices.push("gone/menu/x");
    state.fired.push("dialogue:gone/menu/x");
    const kept = sanitizeState(p, state);
    expect(kept.state.dialogueChoices).toEqual(["shop/menu/ask"]);
    expect(kept.state.fired.filter((k) => k.startsWith("dialogue:"))).toEqual(["dialogue:shop/menu/ask"]);
    expect(kept.dropped).toEqual(["dialogue choice gone/menu/x"]);
    dispose();
  });
});

describe("jump-to a dialogue node (D121)", () => {
  it("opens the graph and selects the node a problem points into", async () => {
    const p = await withShop();
    const jump = locate(p, { file: "dialogues/shop.dialogue.yaml", path: ["nodes", 4, "do", 1, "item"] })!;
    expect(jump.target).toEqual({ kind: "dialogueNode", dialogue: "shop", node: "sell" });
  });
});
