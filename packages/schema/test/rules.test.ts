import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  Action,
  CONDITION_TYPES,
  Condition,
  GameFile,
  GameRule,
  InteractRule,
  RegionRule,
  SceneRule,
  TRIGGER_TYPES,
} from "../src/index.ts";

type Case = { good: Record<string, unknown>; bad: Record<string, unknown> };

const triggers: Record<string, Case & { rule: typeof InteractRule | typeof GameRule | typeof RegionRule | typeof SceneRule }> = {
  look: { rule: InteractRule, good: { type: "look" }, bad: { type: "look", item: "coin" } },
  hand: { rule: InteractRule, good: { type: "hand" }, bad: { type: "hand", x: 1 } },
  talk: { rule: InteractRule, good: { type: "talk" }, bad: { type: "talk", to: "x" } },
  walk: { rule: InteractRule, good: { type: "walk" }, bad: { type: "walk", x: 1 } },
  use_item: { rule: InteractRule, good: { type: "use_item", item: "coin" }, bad: { type: "use_item" } },
  enter_region: { rule: RegionRule, good: { type: "enter_region" }, bad: { type: "enter_region", item: "x" } },
  scene_enter: { rule: SceneRule, good: { type: "scene_enter" }, bad: { type: "scene_enter", scene: "x" } },
  scene_exit: { rule: SceneRule, good: { type: "scene_exit" }, bad: { type: "scene_exit", scene: "x" } },
  combine: { rule: GameRule, good: { type: "combine", item: "lantern", with: "matches" }, bad: { type: "combine", item: "lantern" } },
  dialogue_end: { rule: GameRule, good: { type: "dialogue_end", dialogue: "shop" }, bad: { type: "dialogue_end" } },
};

const conditions: Record<string, Case> = {
  has_item: { good: { type: "has_item", item: "coin" }, bad: { type: "has_item" } },
  not_has_item: { good: { type: "not_has_item", item: "coin" }, bad: { type: "not_has_item", item: "Coin" } },
  flag_is: { good: { type: "flag_is", flag: "lit", value: true }, bad: { type: "flag_is", flag: "lit", value: "yes" } },
  counter: { good: { type: "counter", counter: "coins", op: "gt", value: 2 }, bad: { type: "counter", counter: "coins", op: ">=", value: 2 } },
  visited: { good: { type: "visited", scene: "cave" }, bad: { type: "visited" } },
  object_visible: {
    good: { type: "object_visible", scene: "path", object: "boulder", visible: false },
    bad: { type: "object_visible", object: "boulder", visible: false },
  },
  first_time: { good: { type: "first_time" }, bad: { type: "first_time", times: 1 } },
};

const actions: Record<string, Case> = {
  narrate: { good: { type: "narrate", text: "A sturdy oak door." }, bad: { type: "narrate" } },
  say: { good: { type: "say", character: "shopkeeper", text: "Hello!" }, bad: { type: "say", text: "Hello!" } },
  walk_character_to: { good: { type: "walk_character_to", character: "gardener", x: 100, y: 300 }, bad: { type: "walk_character_to", character: "gardener", x: 100, y: 999 } },
  walk_player_to: { good: { type: "walk_player_to", x: 100, y: 300 }, bad: { type: "walk_player_to", x: 100, y: 999 } },
  face: { good: { type: "face", facing: "up" }, bad: { type: "face", facing: "north" } },
  change_scene: { good: { type: "change_scene", scene: "cave", spawn: "default" }, bad: { type: "change_scene", scene: "cave" } },
  give_item: { good: { type: "give_item", item: "lantern" }, bad: { type: "give_item", items: ["lantern"] } },
  take_item: { good: { type: "take_item", item: "coin" }, bad: { type: "take_item" } },
  set_flag: { good: { type: "set_flag", flag: "lit", value: true }, bad: { type: "set_flag", flag: "lit" } },
  add_to_counter: { good: { type: "add_to_counter", counter: "coins", amount: -1 }, bad: { type: "add_to_counter", counter: "coins", amount: 0.5 } },
  award_points: { good: { type: "award_points", points: 5, award: "found_coin" }, bad: { type: "award_points", points: 0, award: "found_coin" } },
  show_object: { good: { type: "show_object", scene: "path", object: "boulder" }, bad: { type: "show_object", object: "boulder" } },
  hide_object: { good: { type: "hide_object", scene: "path", object: "boulder" }, bad: { type: "hide_object", scene: "path" } },
  play_animation: {
    good: { type: "play_animation", target: { kind: "object", scene: "cave", object: "torch" }, animation: "flicker" },
    bad: { type: "play_animation", target: { kind: "hotspot", hotspot: "door" }, animation: "open" },
  },
  set_character_position: {
    good: { type: "set_character_position", character: "villager", scene: "path", x: 500, y: 350, facing: "left" },
    bad: { type: "set_character_position", character: "villager", x: 500, y: 350, facing: "left" },
  },
  play_sound: { good: { type: "play_sound", sound: "coin_clink" }, bad: { type: "play_sound" } },
  play_music: { good: { type: "play_music", music: "cave_theme" }, bad: { type: "play_music", sound: "cave_theme" } },
  stop_music: { good: { type: "stop_music" }, bad: { type: "stop_music", fade: 2 } },
  start_dialogue: { good: { type: "start_dialogue", dialogue: "shop" }, bad: { type: "start_dialogue" } },
  wait: { good: { type: "wait", seconds: 1.5 }, bad: { type: "wait", seconds: 0 } },
  die: { good: { type: "die", message: "It's too dark. You fall." }, bad: { type: "die" } },
  win_game: { good: { type: "win_game" }, bad: { type: "win_game", message: "yay" } },
};

const rule = (when: unknown, extra: Record<string, unknown> = {}) => ({ id: "rule_1", when, if: [], do: [], once: false, ...extra });

describe("rule vocabulary covers every trigger, condition and action", () => {
  it("has a test case for every type, and nothing more", () => {
    expect([...TRIGGER_TYPES].sort()).toEqual(Object.keys(triggers).sort());
    expect([...CONDITION_TYPES].sort()).toEqual(Object.keys(conditions).sort());
    expect([...ACTION_TYPES].sort()).toEqual(Object.keys(actions).sort());
  });
});

describe.each(Object.entries(triggers))("trigger %s", (_name, c) => {
  it("parses in its own context", () => expect(c.rule.safeParse(rule(c.good)).success).toBe(true));
  it("rejects bad parameters", () => expect(c.rule.safeParse(rule(c.bad)).success).toBe(false));
});

describe.each(Object.entries(conditions))("condition %s", (_name, c) => {
  it("parses", () => expect(Condition.safeParse(c.good).success).toBe(true));
  it("rejects bad parameters", () => expect(Condition.safeParse(c.bad).success).toBe(false));
});

describe("rule text", () => {
  it("may be empty while authoring; validation reports it instead", () => {
    expect(Action.safeParse({ type: "narrate", text: "" }).success).toBe(true);
    expect(Action.safeParse({ type: "say", character: "hero", text: "" }).success).toBe(true);
    expect(Action.safeParse({ type: "die", message: "" }).success).toBe(true);
  });
});

describe.each(Object.entries(actions))("action %s", (_name, c) => {
  it("parses", () => expect(Action.safeParse(c.good).success).toBe(true));
  it("rejects bad parameters", () => expect(Action.safeParse(c.bad).success).toBe(false));
});

describe("rules", () => {
  it("rejects triggers outside their context", () => {
    expect(InteractRule.safeParse(rule({ type: "scene_enter" })).success).toBe(false);
    expect(SceneRule.safeParse(rule({ type: "look" })).success).toBe(false);
    expect(RegionRule.safeParse(rule({ type: "combine", item: "a", with: "b" })).success).toBe(false);
    expect(GameRule.safeParse(rule({ type: "enter_region" })).success).toBe(false);
  });

  it("parses a full rule with conditions and ordered actions", () => {
    const r = InteractRule.parse(
      rule(
        { type: "use_item", item: "coin" },
        {
          if: [{ type: "first_time" }, { type: "flag_is", flag: "shop_open", value: true }],
          do: [
            { type: "take_item", item: "coin" },
            { type: "give_item", item: "lantern" },
            { type: "award_points", points: 2, award: "bought_lantern" },
          ],
          once: true,
        },
      ),
    );
    expect(r.do.map((a) => a.type)).toEqual(["take_item", "give_item", "award_points"]);
  });

  it("requires id/when/if/do/once to be present (one canonical form)", () => {
    expect(InteractRule.safeParse({ id: "rule_1", when: { type: "look" }, do: [], once: false }).success).toBe(false);
    expect(InteractRule.safeParse({ id: "rule_1", when: { type: "look" }, if: [], do: [] }).success).toBe(false);
    expect(InteractRule.safeParse({ when: { type: "look" }, if: [], do: [], once: false }).success).toBe(false);
    expect(InteractRule.safeParse({ id: "Rule 1", when: { type: "look" }, if: [], do: [], once: false }).success).toBe(false);
  });

  it("serializes keys in schema order", () => {
    const parsed = InteractRule.parse({ once: false, do: [{ text: "Hi", type: "narrate" }], if: [], when: { type: "look" }, id: "rule_1" });
    expect(Object.keys(parsed)).toEqual(["id", "when", "if", "do", "once"]);
    expect(Object.keys(parsed.do[0]!)).toEqual(["type", "text"]);
  });
});

describe("game.yaml", () => {
  const game = {
    schemaVersion: 3,
    id: "the_lantern",
    title: "The Lantern",
    version: 1,
    startScene: "beach",
    startSpawn: "default",
    player: "hero",
    maxScore: 10,
    defaultResponses: {
      look: "You see nothing special.",
      hand: "You can't do that.",
      talk: "Nobody answers.",
      use_item: "That doesn't work.",
      combine: "Those don't go together.",
    },
    rules: [rule({ type: "combine", item: "lantern", with: "matches" }, { do: [{ type: "take_item", item: "lantern" }] })],
  };
  it("parses", () => expect(GameFile.parse(game)).toEqual(game));
  it("requires every default response", () => {
    const { combine: _c, ...rest } = game.defaultResponses;
    expect(GameFile.safeParse({ ...game, defaultResponses: rest }).success).toBe(false);
  });
  it("only allows game-level triggers", () => {
    expect(GameFile.safeParse({ ...game, rules: [rule({ type: "look" })] }).success).toBe(false);
  });
});
