import { describe, expect, it } from "vitest";
import { GameFile, SceneFile, validateProject, type AnyRule, type Project } from "@questforge/schema";
import { CommandError } from "../src/model/commands.ts";
import {
  addAction,
  addCondition,
  addRule,
  deleteRule,
  duplicateRule,
  moveAction,
  moveRule,
  removeAction,
  removeCondition,
  setActionFields,
  setActionType,
  setAnimationTarget,
  setConditionFields,
  setConditionType,
  setOnce,
  setTriggerField,
  setTriggerType,
} from "../src/model/rules/commands.ts";
import { awardIds, RuleDefaults } from "../src/model/rules/defaults.ts";
import { newRuleId, ownerRules, ownerTriggers, type RuleOwnerRef } from "../src/model/rules/owner.ts";
import { partKey, ruleProblems } from "../src/model/rules/problems.ts";
import { ownedQuickRules, quickField, setQuickText } from "../src/model/rules/quick.ts";
import { ACTION_GROUPS, ACTION_LABEL, ACTION_ORDER, ACTION_PARTS, CONDITION_LABEL, CONDITION_ORDER, CONDITION_PARTS } from "../src/model/rules/vocab.ts";
import { m1Project } from "./support/fixtures.ts";

const POND: RuleOwnerRef = { kind: "thing", scene: "garden", list: "hotspots", key: "pond" };
const SKY: RuleOwnerRef = { kind: "thing", scene: "garden", list: "hotspots", key: "sky" };
const EXIT: RuleOwnerRef = { kind: "thing", scene: "garden", list: "regions", key: "exit_shed" };
const GARDEN: RuleOwnerRef = { kind: "scene", scene: "garden" };
const GAME: RuleOwnerRef = { kind: "game" };
const GARDENER: RuleOwnerRef = { kind: "thing", scene: "garden", list: "characters", key: "gardener" };

const rules = (p: Project, o: RuleOwnerRef) => ownerRules(p, o)!.rules;
const ids = (p: Project, o: RuleOwnerRef) => rules(p, o).map((r) => r.id);
const rule = (p: Project, o: RuleOwnerRef, id: string) => rules(p, o).find((r) => r.id === id)!;
/** Every command result must still parse: the schema is strict. */
const valid = (p: Project) => {
  for (const s of p.scenes) expect(SceneFile.safeParse(s.data).success).toBe(true);
  expect(GameFile.safeParse(p.game!.data).success).toBe(true);
  return p;
};

describe("rule owners", () => {
  it("finds each owner's list and only offers its own triggers", async () => {
    const p = await m1Project();
    expect(ownerRules(p, POND)!.path).toEqual(["hotspots", 0, "rules"]);
    expect(ownerRules(p, GARDENER)!.path).toEqual(["characters", 0, "rules"]);
    expect(ownerRules(p, GARDEN)!.path).toEqual(["rules"]);
    expect(ownerRules(p, GAME)!.file).toBe("game.yaml");
    expect(ownerRules(p, { ...POND, key: "nope" })).toBeNull();
    expect(ownerTriggers(POND)).toEqual(["look", "hand", "talk", "walk", "use_item"]);
    expect(ownerTriggers(EXIT)).toEqual(["enter_region"]);
    expect(ownerTriggers(GARDEN)).toEqual(["scene_enter", "scene_exit"]);
    expect(ownerTriggers(GAME)).toEqual(["combine", "dialogue_end"]);
    expect(() => addRule(p, EXIT, "look")).toThrow(CommandError);
  });

  it("new rule IDs go one past the highest", () => {
    const r = (id: string) => ({ id }) as AnyRule;
    expect(newRuleId([])).toBe("rule_1");
    expect(newRuleId([r("rule_2"), r("rule_7"), r("kept")])).toBe("rule_8");
  });
});

describe("vocabulary", () => {
  it("labels every condition and action and groups every action once", () => {
    for (const t of CONDITION_ORDER) expect(CONDITION_LABEL[t] && CONDITION_PARTS[t]).toBeTruthy();
    for (const t of ACTION_ORDER) expect(ACTION_LABEL[t] && ACTION_PARTS[t]).toBeTruthy();
    expect(ACTION_GROUPS.flatMap((g) => g.types).sort()).toEqual([...ACTION_ORDER].sort());
  });

  it("every default condition and action is valid in the fixture", async () => {
    const p = await m1Project();
    const d = new RuleDefaults(p, POND);
    let q = p;
    const { project, id } = addRule(q, POND, "use_item");
    q = project;
    for (const t of CONDITION_ORDER) q = addCondition(q, POND, id, t);
    for (const t of ACTION_ORDER) q = addAction(q, POND, id, t);
    valid(q);
    const r = rule(q, POND, id);
    expect(r.when).toEqual({ type: "use_item", item: d.item() });
    // Text starts empty, and kinds the fixture has none of start on a red placeholder.
    const at = ["hotspots", 0, "rules", rules(q, POND).indexOf(r)].join(".");
    const inRule = validateProject(q).filter((x) => x.location.path.join(".").startsWith(at));
    expect(inRule.map((x) => `${x.code} ${x.location.path.slice(4).join(".")}`)).toEqual([
      "missing_reference if.3.counter",
      "missing_reference do.9.counter",
      "missing_reference do.13.animation",
      "empty_text do.0.text",
      "empty_text do.1.text",
      "empty_text do.20.message",
    ]);
  });

  it("defaults follow the owner: its scene, its walk-to point, its character, a fresh award", async () => {
    const p = await m1Project();
    expect(new RuleDefaults(p, POND).action("walk_player_to")).toEqual({ type: "walk_player_to", x: 300, y: 372 });
    expect(new RuleDefaults(p, GARDENER).action("say")).toMatchObject({ character: "gardener", text: "" });
    expect(new RuleDefaults(p, POND).action("say")).toMatchObject({ character: "hero" });
    expect(new RuleDefaults(p, POND).action("change_scene")).toEqual({ type: "change_scene", scene: "shed", spawn: "door" });
    expect(awardIds(p)).toContain("caught_fish");
    expect(new RuleDefaults(p, POND).action("award_points")).toEqual({ type: "award_points", points: 1, award: "pond" });
    expect(new RuleDefaults(p, GAME).condition("visited")).toEqual({ type: "visited", scene: "garden" });
  });
});

describe("rule commands", () => {
  it("adds above the quick fields' plain rules, deletes, duplicates and reorders by ID", async () => {
    let p = await m1Project();
    expect(ids(p, POND)).toEqual(["rule_1", "rule_2", "rule_3", "rule_4"]);
    // rule_1 (look) and rule_4 (hand) are plain: the new rule goes above the first of them.
    const added = addRule(p, POND);
    p = added.project;
    expect(added.id).toBe("rule_5");
    expect(ids(p, POND)).toEqual(["rule_5", "rule_1", "rule_2", "rule_3", "rule_4"]);
    expect(rule(p, POND, "rule_5")).toEqual({ id: "rule_5", when: { type: "look" }, if: [], do: [], once: false });
    // No quick fields on regions: it goes at the end.
    expect(ids(addRule(p, EXIT).project, EXIT)).toEqual(["rule_1", "rule_2"]);
    const dup = duplicateRule(p, POND, "rule_2");
    expect(ids(dup.project, POND)).toEqual(["rule_5", "rule_1", "rule_2", "rule_6", "rule_3", "rule_4"]);
    expect(rule(dup.project, POND, "rule_6")).toEqual({ ...rule(p, POND, "rule_2"), id: "rule_6" });
    p = moveRule(p, POND, "rule_5", 4);
    expect(ids(p, POND)).toEqual(["rule_1", "rule_2", "rule_3", "rule_4", "rule_5"]);
    expect(moveRule(p, POND, "rule_5", 99)).toBe(p);
    p = deleteRule(p, POND, "rule_5");
    expect(ids(p, POND)).toEqual(["rule_1", "rule_2", "rule_3", "rule_4"]);
    expect(() => deleteRule(p, POND, "rule_5")).toThrow(CommandError);
    valid(p);
  });

  it("edits the trigger and the once toggle", async () => {
    let p = await m1Project();
    p = setTriggerType(p, POND, "rule_4", "use_item");
    expect(rule(p, POND, "rule_4").when).toEqual({ type: "use_item", item: "coin" });
    p = setTriggerField(p, POND, "rule_4", "item", "rod");
    expect(rule(p, POND, "rule_4").when).toEqual({ type: "use_item", item: "rod" });
    expect(() => setTriggerField(p, POND, "rule_4", "item", "Not An ID")).toThrow(CommandError);
    expect(() => setTriggerType(p, POND, "rule_4", "combine")).toThrow(CommandError);
    p = setOnce(p, POND, "rule_4", true);
    expect(rule(p, POND, "rule_4").once).toBe(true);
    valid(p);
  });

  it("adds, edits, retypes, moves and removes conditions and actions", async () => {
    let p = await m1Project();
    p = addCondition(p, POND, "rule_4", "flag_is");
    expect(rule(p, POND, "rule_4").if).toEqual([{ type: "flag_is", flag: "path_open", value: true }]);
    p = setConditionFields(p, POND, "rule_4", 0, { value: false });
    expect(rule(p, POND, "rule_4").if[0]).toEqual({ type: "flag_is", flag: "path_open", value: false });
    expect(() => setConditionFields(p, POND, "rule_4", 0, { value: "nope" })).toThrow(CommandError);
    p = setConditionType(p, POND, "rule_4", 0, "visited");
    expect(rule(p, POND, "rule_4").if[0]).toEqual({ type: "visited", scene: "garden" });
    p = removeCondition(p, POND, "rule_4", 0);
    expect(rule(p, POND, "rule_4").if).toEqual([]);

    p = addAction(p, POND, "rule_4", "change_scene");
    // A new scene brings its own first spawn.
    p = setActionFields(p, POND, "rule_4", 1, { scene: "garden" });
    expect(rule(p, POND, "rule_4").do[1]).toEqual({ type: "change_scene", scene: "garden", spawn: "default" });
    // Retyping keeps text between text actions.
    p = setActionType(p, POND, "rule_4", 0, "say");
    expect(rule(p, POND, "rule_4").do[0]).toEqual({ type: "say", character: "hero", text: "The fish are far too quick for your hands." });
    p = moveAction(p, POND, "rule_4", 1, 0);
    expect(rule(p, POND, "rule_4").do.map((a) => a.type)).toEqual(["change_scene", "say"]);
    p = removeAction(p, POND, "rule_4", 0);
    expect(rule(p, POND, "rule_4").do.map((a) => a.type)).toEqual(["say"]);
    expect(() => removeAction(p, POND, "rule_4", 5)).toThrow(CommandError);
    valid(p);
  });

  it("points play_animation at a character or object and starts on its first animation", async () => {
    let p = await m1Project();
    p = addAction(p, GARDENER, "rule_6", "play_animation");
    const i = rule(p, GARDENER, "rule_6").do.length - 1;
    p = setAnimationTarget(p, GARDENER, "rule_6", i, { kind: "character", character: "gardener" });
    const a = rule(p, GARDENER, "rule_6").do[i]!;
    expect(a).toMatchObject({ type: "play_animation", target: { kind: "character", character: "gardener" } });
    expect(a.type === "play_animation" && a.animation).toMatch(/^idle_/);
    valid(p);
  });
});

describe("quick fields", () => {
  it("reads the last plain rule for each verb", async () => {
    const p = await m1Project();
    expect(quickField(rules(p, POND), "look")).toEqual({ state: "plain", ruleId: "rule_1", text: "A still pond. Tiny fish dart about." });
    expect(quickField(rules(p, POND), "hand")).toEqual({ state: "plain", ruleId: "rule_4", text: "The fish are far too quick for your hands." });
    expect(quickField(rules(p, POND), "talk")).toEqual({ state: "empty" });
    // The gardener's last talk rule says something: it was made by hand.
    expect(quickField(rules(p, GARDENER), "talk")).toEqual({ state: "custom", ruleId: "rule_6", number: 6 });
    expect(ownedQuickRules(POND, rules(p, POND))).toEqual(["rule_1", "rule_4"]);
    expect(ownedQuickRules(EXIT, rules(p, EXIT))).toEqual([]);
  });

  it("typing creates the rule at the bottom, edits it, and clearing deletes it", async () => {
    let p = await m1Project();
    p = setQuickText(p, POND, "talk", "T");
    expect(ids(p, POND)).toEqual(["rule_1", "rule_2", "rule_3", "rule_4", "rule_5"]);
    p = setQuickText(p, POND, "talk", "The pond doesn't answer.");
    expect(rule(p, POND, "rule_5")).toEqual({ id: "rule_5", when: { type: "talk" }, if: [], do: [{ type: "narrate", text: "The pond doesn't answer." }], once: false });
    p = setQuickText(p, POND, "look", "A murky pond.");
    expect(rule(p, POND, "rule_1").do).toEqual([{ type: "narrate", text: "A murky pond." }]);
    p = setQuickText(p, POND, "talk", "");
    expect(ids(p, POND)).toEqual(["rule_1", "rule_2", "rule_3", "rule_4"]);
    const same = setQuickText(p, POND, "talk", "");
    expect(same).toBe(p);
    valid(p);
  });

  it("a rule edited by hand stops being the quick field's, which then can't type", async () => {
    let p = await m1Project();
    p = addCondition(p, SKY, "rule_1", "first_time");
    expect(quickField(rules(p, SKY), "look")).toEqual({ state: "custom", ruleId: "rule_1", number: 1 });
    expect(() => setQuickText(p, SKY, "look", "Blue.")).toThrow(/set by rule 1/);
    expect(() => setQuickText(p, EXIT, "look", "x")).toThrow(CommandError);
  });
});

describe("rule problems (inline red)", () => {
  it("splits problems by rule and by part", async () => {
    let p = await m1Project();
    p = { ...p, items: p.items.filter((i) => i.data.id !== "rod") };
    p = addAction(p, POND, "rule_4", "narrate");
    const own = ownerRules(p, POND)!;
    const { byRule, byPart } = ruleProblems(validateProject(p), own);
    expect([...byRule.keys()].sort()).toEqual(["rule_2", "rule_3", "rule_4"]);
    expect(byPart.get(partKey("rule_2", { kind: "when" }))![0]!.message).toMatch(/item rod/);
    expect(byPart.get(partKey("rule_4", { kind: "do", index: 1 }))![0]!.code).toBe("empty_text");
  });
});
