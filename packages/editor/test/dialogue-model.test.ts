import { describe, expect, it } from "vitest";
import { DialogueFile, MemoryFs, nodePorts, saveProject, validateProject, type DialogueNode, type Project } from "@questforge/schema";
import { CommandError, createNamedEntry } from "../src/model/commands.ts";
import { dialogueContext } from "../src/model/dialogue/context.ts";
import {
  addNode,
  addOption,
  connect,
  deleteNodes,
  dialogueOf,
  editActions,
  editConditions,
  layoutDialogue,
  moveNodes,
  moveOption,
  removeOption,
  setLine,
  setOption,
} from "../src/model/dialogue/commands.ts";
import { autoLayout } from "../src/model/dialogue/layout.ts";
import { invalidKeys, partProblems, problemsByNode } from "../src/model/dialogue/problems.ts";
import { Editor } from "../src/model/editor.ts";
import { createAndUse } from "../src/model/rules/pickers.ts";
import { actions, conditions } from "../src/model/rules/parts.ts";
import { addAction, addRule, setActionFields } from "../src/model/rules/commands.ts";
import { errorsIn, m1Project } from "./support/fixtures.ts";

// The dialogue graph's commands: pure Project → Project, each one undo step.

const D = "chat";
const nodes = (p: Project) => dialogueOf(p, D).nodes;
const node = <T extends DialogueNode["type"]>(p: Project, id: string, _type?: T) => nodes(p).find((n) => n.id === id) as Extract<DialogueNode, { type: T }>;
/** Every result must still parse: the schema is strict. */
const parses = (p: Project) => DialogueFile.parse(dialogueOf(p, D));

async function withShop(): Promise<Project> {
  const p = await m1Project();
  const r = createNamedEntry(p, "dialogue", "Chat");
  expect(r.id).toBe(D);
  return r.project;
}

describe("dialogue commands", () => {
  it("a new dialogue starts with Start → End", async () => {
    const p = await withShop();
    expect(nodes(p).map((n) => [n.id, n.type])).toEqual([["start", "start"], ["end", "end"]]);
    expect(errorsIn(p)).toEqual([]);
  });

  it("adds a node from a dragged port, connected and with a fresh ID", async () => {
    let p = await withShop();
    const a = addNode(p, D, "line", [240.6, 10.2], { node: "start", port: "next" });
    p = a.project;
    expect(a.id).toBe("line_1");
    expect(node(p, "start", "start").next).toBe("line_1");
    expect(node(p, "line_1", "line")).toEqual({ id: "line_1", type: "line", pos: [241, 10], text: "", next: null });
    const b = addNode(p, D, "line", [0, 0]);
    expect(b.id).toBe("line_2");
    expect(() => addNode(p, D, "start", [0, 0])).toThrow(CommandError);
    parses(b.project);
  });

  it("a new Choices node has one empty option; a Branch starts on a condition", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [0, 0]).project;
    p = addNode(p, D, "branch", [0, 0]).project;
    expect(node(p, "choices_1", "choices").options).toEqual([{ id: "option_1", text: "", if: [], once: false, next: null }]);
    expect(node(p, "branch_1", "branch").if).toEqual([{ type: "has_item", item: "coin" }]);
    parses(p);
  });

  it("connects and disconnects ports; nothing leads into Start", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [0, 0]).project;
    p = connect(p, D, "start", "next", "choices_1");
    p = connect(p, D, "choices_1", "option:option_1", "end");
    expect(node(p, "choices_1", "choices").options[0]!.next).toBe("end");
    p = connect(p, D, "choices_1", "option:option_1", null);
    expect(node(p, "choices_1", "choices").options[0]!.next).toBe(null);
    expect(() => connect(p, D, "choices_1", "option:option_1", "start")).toThrow(/Start/);
    expect(() => connect(p, D, "choices_1", "option:nope", "end")).toThrow(CommandError);
  });

  it("deleting nodes leaves the ports that led there unconnected; Start can't go", async () => {
    let p = await withShop();
    p = addNode(p, D, "line", [0, 0], { node: "start", port: "next" }).project;
    p = connect(p, D, "line_1", "next", "end");
    p = deleteNodes(p, D, ["line_1", "start"]);
    expect(nodes(p).map((n) => n.id)).toEqual(["start", "end"]);
    expect(node(p, "start", "start").next).toBe(null);
    expect(() => deleteNodes(p, D, ["start"])).toThrow(/Start node can't be deleted/);
  });

  it("moves nodes to whole-pixel positions; unchanged nodes keep their object", async () => {
    const p = await withShop();
    const before = nodes(p)[1];
    const q = moveNodes(p, D, [{ id: "start", pos: [10.4, -20.6] }]);
    expect(nodes(q)[0]!.pos).toEqual([10, -21]);
    expect(nodes(q)[1]).toBe(before);
  });

  it("edits a Line: speaker, narrator, text and the speaker's animation", async () => {
    let p = await withShop();
    p = addNode(p, D, "line", [0, 0]).project;
    p = setLine(p, D, "line_1", { character: "gardener", text: "Hi!", animation: "idle_down" });
    expect(node(p, "line_1", "line")).toMatchObject({ character: "gardener", text: "Hi!", animation: "idle_down" });
    // A new speaker drops the old one's animation; the narrator has none.
    p = setLine(p, D, "line_1", { character: "visitor" });
    expect(node(p, "line_1", "line").animation).toBeUndefined();
    p = setLine(p, D, "line_1", { animation: "idle_down" });
    p = setLine(p, D, "line_1", { character: null });
    expect(node(p, "line_1", "line")).toEqual({ id: "line_1", type: "line", pos: [0, 0], text: "Hi!", next: null });
    parses(p);
  });

  it("edits options: add, text, once, reorder, remove", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [0, 0]).project;
    const r = addOption(p, D, "choices_1");
    p = setOption(r.project, D, "choices_1", r.id, { text: "Bye.", once: true });
    p = moveOption(p, D, "choices_1", r.id, 0);
    expect(node(p, "choices_1", "choices").options.map((o) => [o.id, o.text, o.once])).toEqual([["option_2", "Bye.", true], ["option_1", "", false]]);
    p = removeOption(p, D, "choices_1", "option_1");
    expect(node(p, "choices_1", "choices").options.map((o) => o.id)).toEqual(["option_2"]);
    // Option IDs stay unique in the dialogue, even across nodes.
    p = addNode(p, D, "choices", [0, 0]).project;
    expect(node(p, "choices_2", "choices").options[0]!.id).toBe("option_1");
    expect(addOption(p, D, "choices_2").id).toBe("option_3");
  });

  it("edits conditions and actions with the rule inspector's list edits", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [0, 0]).project;
    p = addNode(p, D, "actions", [0, 0]).project;
    p = editConditions(p, D, { node: "choices_1", option: "option_1" }, (l, d) => conditions.add(d, l, "has_item"));
    p = editConditions(p, D, { node: "choices_1", option: "option_1" }, (l, d) => conditions.setFields(d, l, 0, { item: "rod" }));
    expect(node(p, "choices_1", "choices").options[0]!.if).toEqual([{ type: "has_item", item: "rod" }]);
    p = editActions(p, D, "actions_1", (l, d) => actions.add(d, l, "give_item"));
    p = editActions(p, D, "actions_1", (l, d) => actions.add(d, l, "set_flag"));
    p = editActions(p, D, "actions_1", (l) => actions.move(l, 1, 0));
    expect(node(p, "actions_1", "actions").do.map((a) => a.type)).toEqual(["set_flag", "give_item"]);
    expect(() => editConditions(p, D, { node: "actions_1" }, (l) => l)).toThrow(CommandError);
    expect(() => editActions(p, D, "actions_1", (l, d) => actions.setFields(d, l, 0, { flag: 3 }))).toThrow(CommandError);
    parses(p);
  });

  it("“+ Create new…” in a node makes the item and uses it as one step", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [0, 0]).project;
    p = editConditions(p, D, { node: "choices_1", option: "option_1" }, (l, d) => conditions.add(d, l, "has_item"));
    p = createAndUse(p, "item", "Gold bar", (q, id) => editConditions(q, D, { node: "choices_1", option: "option_1" }, (l, d) => conditions.setFields(d, l, 0, { item: id })));
    expect(p.items.some((i) => i.data.id === "gold_bar")).toBe(true);
    expect(node(p, "choices_1", "choices").options[0]!.if).toEqual([{ type: "has_item", item: "gold_bar" }]);
  });

  it("auto-layout lays out columns from Start, left to right, in port order", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [500, 500], { node: "start", port: "next" }).project;
    const o2 = addOption(p, D, "choices_1");
    p = addNode(o2.project, D, "line", [9, 9], { node: "choices_1", port: "option:option_1" }).project;
    p = connect(p, D, "choices_1", `option:${o2.id}`, "end");
    p = addNode(p, D, "line", [9, 9]).project; // unreachable: goes after
    const pos = autoLayout(dialogueOf(p, D));
    const x = (id: string) => pos.get(id)![0];
    const y = (id: string) => pos.get(id)![1];
    expect([x("start"), x("choices_1"), x("line_1"), x("end"), x("line_2")]).toEqual([0, 320, 640, 640, 960]);
    expect(y("line_1")).toBeLessThan(y("end"));
    const q = layoutDialogue(p, D);
    expect(nodes(q).every((n) => Number.isInteger(n.pos[0]) && Number.isInteger(n.pos[1]))).toBe(true);
  });

  it("finds the scene a dialogue is played in", async () => {
    let p = await withShop();
    expect(dialogueContext(p, D)).toEqual({ scene: "garden", spawn: "default", started: false });
    const owner = { kind: "thing", scene: "stress", list: "characters", key: "visitor" } as const;
    const r = addRule(p, owner, "talk");
    p = addAction(r.project, owner, r.id, "start_dialogue");
    p = setActionFields(p, owner, r.id, 0, { dialogue: D });
    expect(dialogueContext(p, D)).toMatchObject({ scene: "stress", character: "visitor", started: true });
    // A new Line then speaks as that character.
    p = addNode(p, D, "line", [0, 0]).project;
    expect(node(p, "line_1", "line").character).toBe("visitor");
  });
});

describe("problems on the graph", () => {
  it("groups problems by node and by part", async () => {
    let p = await withShop();
    p = addNode(p, D, "choices", [0, 0], { node: "start", port: "next" }).project;
    p = editConditions(p, D, { node: "choices_1", option: "option_1" }, (l, d) => conditions.add(d, l, "has_item"));
    p = editConditions(p, D, { node: "choices_1", option: "option_1" }, (l, d) => conditions.setFields(d, l, 0, { item: "gold" }));
    p = addNode(p, D, "line", [0, 0]).project;
    const all = validateProject(p);
    const doc = p.dialogues.find((d) => d.data.id === D)!;
    const by = problemsByNode(all, doc.path, doc.data);
    expect([...by.keys()]).toEqual(["choices_1", "end", "line_1"]);
    const opt = partProblems(by.get("choices_1"), 2, ["options", 0]);
    expect(opt.map((x) => x.code).sort()).toEqual(["dialogue_dead_end", "empty_text", "missing_reference"]);
    expect([...invalidKeys(opt, 2, ["options", 0, "if", 0])]).toEqual(["item"]);
    expect(by.get("end")!.map((x) => x.code)).toEqual(["dialogue_node_unreachable"]);
    expect(by.get("line_1")!.map((x) => x.code).sort()).toEqual(["dialogue_dead_end", "dialogue_node_unreachable", "empty_text"]);
  });
});

describe("the shopkeeper conversation, a gem standing in for the coin", () => {
  it("builds a once-only question, a choice gated on a coin and a loop back to the menu, as undo steps", async () => {
    const fs = new MemoryFs();
    await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
    const ed = await Editor.open({ fs });
    ed.apply("New dialogue", (p) => createNamedEntry(p, "dialogue", "Chat").project);
    const run = (label: string, f: (p: Project) => Project) => ed.apply(label, f);
    const make = (label: string, f: (p: Project) => { project: Project; id: string }) => ed.applyWith(label, f)?.id;

    // Start → greeting → menu.
    run("Disconnect", (p) => connect(p, D, "start", "next", null));
    const hello = make("Add Line", (p) => addNode(p, D, "line", [240, 0], { node: "start", port: "next" }))!;
    run("Edit line", (p) => setLine(p, D, hello, { character: "gardener", text: "Welcome to my shop!" }));
    const menu = make("Add Choices", (p) => addNode(p, D, "choices", [480, 0], { node: hello, port: "next" }))!;
    // 1. A once-only question that loops back.
    run("Edit option", (p) => setOption(p, D, menu, "option_1", { text: "What's new?", once: true }));
    const news = make("Add Line", (p) => addNode(p, D, "line", [720, -100], { node: menu, port: "option:option_1" }))!;
    run("Edit line", (p) => setLine(p, D, news, { text: "Nothing ever happens here." }));
    run("Connect", (p) => connect(p, D, news, "next", menu));
    // 2. A choice gated on a coin (created from the picker), buying the rod.
    const buy = make("Add option", (p) => addOption(p, D, menu))!;
    run("Edit option", (p) => setOption(p, D, menu, buy, { text: "I'll buy the rod." }));
    run("Add condition", (p) => editConditions(p, D, { node: menu, option: buy }, (l, d) => conditions.add(d, l, "has_item")));
    run("Create item and use it", (p) => createAndUse(p, "item", "Gem", (q, id) => editConditions(q, D, { node: menu, option: buy }, (l, d) => conditions.setFields(d, l, 0, { item: id }))));
    const sell = make("Add Actions", (p) => addNode(p, D, "actions", [720, 100], { node: menu, port: `option:${buy}` }))!;
    run("Add action", (p) => editActions(p, D, sell, (l, d) => actions.add(d, l, "take_item")));
    run("Edit action", (p) => editActions(p, D, sell, (l, d) => actions.setFields(d, l, 0, { item: "gem" })));
    run("Add action", (p) => editActions(p, D, sell, (l, d) => actions.add(d, l, "give_item")));
    run("Edit action", (p) => editActions(p, D, sell, (l, d) => actions.setFields(d, l, 1, { item: "rod" })));
    run("Connect", (p) => connect(p, D, sell, "next", menu));
    // 3. Goodbye ends it.
    const bye = make("Add option", (p) => addOption(p, D, menu))!;
    run("Edit option", (p) => setOption(p, D, menu, bye, { text: "Goodbye." }));
    run("Connect", (p) => connect(p, D, menu, `option:${bye}`, "end"));
    run("Auto-layout", (p) => layoutDialogue(p, D));

    const p = ed.project;
    const d = dialogueOf(p, D);
    expect(validateProject(p).filter((x) => x.location.file.startsWith("dialogues/"))).toEqual([]);
    expect(d.nodes.flatMap((n) => nodePorts(n).map((x) => x.next))).not.toContain(null);
    expect(node(p, menu, "choices").options.map((o) => [o.text, o.once, o.if])).toEqual([
      ["What's new?", true, []],
      ["I'll buy the rod.", false, [{ type: "has_item", item: "gem" }]],
      ["Goodbye.", false, []],
    ]);
    // Each command was its own undo step.
    ed.undo();
    expect(dialogueOf(ed.project, D).nodes.find((n) => n.id === "start")!.pos).not.toEqual(d.nodes.find((n) => n.id === "start")!.pos);
  });

  it("a node with no path from Start shows a warning", async () => {
    let p = await withShop();
    p = addNode(p, D, "line", [0, 200]).project;
    p = setLine(p, D, "line_1", { text: "Lost line." });
    p = connect(p, D, "line_1", "next", "end");
    const warnings = validateProject(p).filter((x) => x.code === "dialogue_node_unreachable");
    expect(warnings.map((w) => w.location.path)).toEqual([["nodes", 2]]);
  });
});
