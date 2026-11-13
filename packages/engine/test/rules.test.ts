import { describe, expect, it } from "vitest";
import { GameFile, GameRule, InteractRule, SceneFile, type Condition, type Trigger } from "@questforge/schema";
import { checkCondition, defaultResponse, firstMatch, ruleKey, triggerMatches, type RuleContext, type RuleOwner } from "../src/rules.ts";
import { award, giveItem, initialState, markFired, markVisited, setObjectVisible } from "../src/state.ts";

// Spec 02 evaluation: first match, `once`, conditions, default fallbacks.

const game = GameFile.parse({
  schemaVersion: 3,
  id: "t",
  title: "T",
  version: 1,
  startScene: "yard",
  startSpawn: "default",
  player: "hero",
  maxScore: 10,
  defaultResponses: { look: "Nothing special.", hand: "You can't.", talk: "Nobody answers.", use_item: "That won't work.", combine: "They don't fit." },
  rules: [],
});
const yard = SceneFile.parse({
  schemaVersion: 3,
  id: "yard",
  name: "Yard",
  background: "bg",
  depth: { far: { y: 200, scale: 0.5 }, near: { y: 400, scale: 1 } },
  walkable: { outer: [[0, 200], [640, 200], [640, 400], [0, 400]], holes: [] },
  spawns: { default: { x: 100, y: 380, facing: "up" } },
  objects: [{ id: "key", image: "k", x: 0, y: 0, visible: false, rules: [] }],
  characters: [],
  hotspots: [],
  regions: [],
  rules: [],
});

const ctx = (): RuleContext => ({
  state: initialState({ schemaVersion: 3, flags: [{ id: "open", type: "bool", initial: false }, { id: "n", type: "counter", initial: 2 }] }, "yard", { x: 0, y: 0, facing: "up" }),
  scene: (id) => (id === "yard" ? yard : undefined),
});
const say = (text: string) => [{ type: "narrate", text }];
let nextId = 0;
const rule = (when: Trigger, cond: Condition[], text: string, once = false) => InteractRule.parse({ id: `rule_${++nextId}`, when, if: cond, do: say(text), once });
const owner: RuleOwner = { kind: "hotspot", scene: "yard", id: "door" };
const look: Trigger = { type: "look" };
const text = (m: { rule: { do: unknown[] } } | null) => (m ? (m.rule.do[0] as { text: string }).text : null);

describe("rule keys", () => {
  it("name the rule by its owner and stable ID", () => {
    expect(ruleKey(owner, "rule_2")).toBe("yard/hotspot:door/rule_2");
    expect(ruleKey({ kind: "scene", scene: "yard" }, "rule_1")).toBe("yard/scene/rule_1");
    expect(ruleKey({ kind: "game" }, "rule_1")).toBe("game/rule_1");
  });

  it("survive reordering: a fired once-rule stays fired after it moves", () => {
    const a = rule(look, [], "a", true);
    const b = rule(look, [], "b");
    const c = ctx();
    markFired(c.state, firstMatch([a, b], owner, look, c)!.key);
    expect(text(firstMatch([b, a], owner, look, c))).toBe("b");
    expect(text(firstMatch([a, b], owner, look, c))).toBe("b");
  });
});

describe("first match", () => {
  it("runs the first rule whose conditions pass, top to bottom", () => {
    const rules = [
      rule({ type: "hand" }, [], "hand"),
      rule(look, [{ type: "flag_is", flag: "open", value: true }], "open"),
      rule(look, [], "plain"),
      rule(look, [], "never reached"),
    ];
    const c = ctx();
    expect(text(firstMatch(rules, owner, look, c))).toBe("plain");
    c.state.flags.open = true;
    const m = firstMatch(rules, owner, look, c);
    expect(text(m)).toBe("open");
    expect(m?.key).toBe(`yard/hotspot:door/${rules[1]!.id}`);
  });

  it("returns null when nothing matches, and the default response fills in", () => {
    const rules = [rule(look, [{ type: "has_item", item: "lamp" }], "lit")];
    expect(firstMatch(rules, owner, look, ctx())).toBe(null);
    expect(firstMatch(rules, owner, { type: "talk" }, ctx())).toBe(null);
    expect(defaultResponse(game, look)).toBe("Nothing special.");
    expect(defaultResponse(game, { type: "hand" })).toBe("You can't.");
    expect(defaultResponse(game, { type: "talk" })).toBe("Nobody answers.");
    expect(defaultResponse(game, { type: "use_item", item: "x" })).toBe("That won't work.");
    expect(defaultResponse(game, { type: "combine", item: "a", with: "b" })).toBe("They don't fit.");
    expect(defaultResponse(game, { type: "walk" })).toBe(null);
    expect(defaultResponse(game, { type: "enter_region" })).toBe(null);
  });

  it("skips a `once` rule after it fired and falls to the next", () => {
    const rules = [rule(look, [], "first", true), rule(look, [], "later")];
    const c = ctx();
    const m = firstMatch(rules, owner, look, c)!;
    expect(text(m)).toBe("first");
    markFired(c.state, m.key);
    expect(text(firstMatch(rules, owner, look, c))).toBe("later");
    // A non-once rule keeps matching after it fired.
    markFired(c.state, ruleKey(owner, rules[1]!.id));
    expect(text(firstMatch(rules, owner, look, c))).toBe("later");
  });

  it("`once` applies per owner: the same rule ID elsewhere is a different rule", () => {
    const rules = [rule(look, [], "first", true)];
    const c = ctx();
    markFired(c.state, ruleKey(owner, rules[0]!.id));
    expect(firstMatch(rules, owner, look, c)).toBe(null);
    expect(text(firstMatch(rules, { kind: "object", scene: "yard", id: "door" }, look, c))).toBe("first");
  });

  it("`first_time` is true until this rule has fired", () => {
    const rules = [rule(look, [{ type: "first_time" }], "new"), rule(look, [], "again")];
    const c = ctx();
    expect(text(firstMatch(rules, owner, look, c))).toBe("new");
    markFired(c.state, ruleKey(owner, rules[0]!.id));
    expect(text(firstMatch(rules, owner, look, c))).toBe("again");
  });

  it("all conditions must pass", () => {
    const rules = [rule(look, [{ type: "has_item", item: "a" }, { type: "has_item", item: "b" }], "both")];
    const c = ctx();
    giveItem(c.state, "a");
    expect(firstMatch(rules, owner, look, c)).toBe(null);
    giveItem(c.state, "b");
    expect(text(firstMatch(rules, owner, look, c))).toBe("both");
  });
});

describe("triggers", () => {
  it("use_item matches only its item", () => {
    expect(triggerMatches({ type: "use_item", item: "key" }, { type: "use_item", item: "key" })).toBe(true);
    expect(triggerMatches({ type: "use_item", item: "key" }, { type: "use_item", item: "rope" })).toBe(false);
    expect(triggerMatches({ type: "look" }, { type: "hand" })).toBe(false);
  });

  it("combine matches in either order", () => {
    const rules = [GameRule.parse({ id: "rule_1", when: { type: "combine", item: "stick", with: "string" }, if: [], do: say("rod"), once: false })];
    const c = ctx();
    expect(text(firstMatch(rules, { kind: "game" }, { type: "combine", item: "string", with: "stick" }, c))).toBe("rod");
    expect(text(firstMatch(rules, { kind: "game" }, { type: "combine", item: "stick", with: "string" }, c))).toBe("rod");
    expect(firstMatch(rules, { kind: "game" }, { type: "combine", item: "stick", with: "rock" }, c)).toBe(null);
  });

  it("dialogue_end matches its dialogue", () => {
    expect(triggerMatches({ type: "dialogue_end", dialogue: "a" }, { type: "dialogue_end", dialogue: "a" })).toBe(true);
    expect(triggerMatches({ type: "dialogue_end", dialogue: "a" }, { type: "dialogue_end", dialogue: "b" })).toBe(false);
  });
});

describe("conditions", () => {
  const check = (c: Condition, r: RuleContext) => checkCondition(c, r, "k");

  it("has_item / not_has_item", () => {
    const c = ctx();
    expect(check({ type: "has_item", item: "coin" }, c)).toBe(false);
    expect(check({ type: "not_has_item", item: "coin" }, c)).toBe(true);
    giveItem(c.state, "coin");
    expect(check({ type: "has_item", item: "coin" }, c)).toBe(true);
    expect(check({ type: "not_has_item", item: "coin" }, c)).toBe(false);
  });

  it("flag is true/false", () => {
    const c = ctx();
    expect(check({ type: "flag_is", flag: "open", value: false }, c)).toBe(true);
    c.state.flags.open = true;
    expect(check({ type: "flag_is", flag: "open", value: true }, c)).toBe(true);
  });

  it("counter = ≠ < >", () => {
    const c = ctx();
    expect(check({ type: "counter", counter: "n", op: "eq", value: 2 }, c)).toBe(true);
    expect(check({ type: "counter", counter: "n", op: "ne", value: 2 }, c)).toBe(false);
    expect(check({ type: "counter", counter: "n", op: "lt", value: 3 }, c)).toBe(true);
    expect(check({ type: "counter", counter: "n", op: "gt", value: 2 }, c)).toBe(false);
    expect(check({ type: "counter", counter: "n", op: "gt", value: 1 }, c)).toBe(true);
  });

  it("visited", () => {
    const c = ctx();
    expect(check({ type: "visited", scene: "yard" }, c)).toBe(false);
    markVisited(c.state, "yard");
    expect(check({ type: "visited", scene: "yard" }, c)).toBe(true);
  });

  it("object visible/hidden, defaulting to the scene file", () => {
    const c = ctx();
    expect(check({ type: "object_visible", scene: "yard", object: "key", visible: false }, c)).toBe(true);
    setObjectVisible(c.state, "yard", "key", true);
    expect(check({ type: "object_visible", scene: "yard", object: "key", visible: true }, c)).toBe(true);
  });

  it("award state is not a condition but survives evaluation untouched", () => {
    const c = ctx();
    award(c.state, "a", 5);
    firstMatch([rule(look, [], "x")], owner, look, c);
    expect(c.state.awards).toEqual({ a: 5 });
    expect(c.state.fired).toEqual([]);
  });
});
