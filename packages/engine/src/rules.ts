import type { AnyRule, Condition, GameFile, SceneFile, Trigger } from "@questforge/schema";
import { hasItem, objectVisible, type GameState } from "./state.ts";
import type { RuleReport } from "./trace.ts";

// Rule evaluation: a trigger checks its owner's rules top to bottom
// and the first rule whose conditions all pass is the one that runs. Pure: no
// side effects here; the sequence runner marks the rule fired and runs its actions.

/** Where a rule list lives. With the rule's ID it makes the fired key. */
export type RuleOwner =
  | { kind: "hotspot" | "object" | "character" | "region"; scene: string; id: string }
  | { kind: "scene"; scene: string }
  | { kind: "game" };

/** Fired key of a rule: its owner plus its stable ID, e.g. `garden/hotspot:pond/rule_2`, `game/rule_1`. */
export function ruleKey(owner: RuleOwner, ruleId: string): string {
  switch (owner.kind) {
    case "game":
      return `game/${ruleId}`;
    case "scene":
      return `${owner.scene}/scene/${ruleId}`;
    default:
      return `${owner.scene}/${owner.kind}:${owner.id}/${ruleId}`;
  }
}

/** What conditions can see. */
export interface RuleContext {
  state: GameState;
  /** Scene files by ID, for object visibility defaults. */
  scene(id: string): SceneFile | undefined;
}

const hasFired = (state: GameState, key: string) => state.fired.includes(key);

export function checkCondition(c: Condition, ctx: RuleContext, key: string): boolean {
  const { state } = ctx;
  switch (c.type) {
    case "has_item":
      return hasItem(state, c.item);
    case "not_has_item":
      return !hasItem(state, c.item);
    case "flag_is":
      return (state.flags[c.flag] ?? false) === c.value;
    case "counter":
      return compare(state.counters[c.counter] ?? 0, c.op, c.value);
    case "visited":
      return state.visited.includes(c.scene);
    case "object_visible": {
      const scene = ctx.scene(c.scene);
      return !!scene && objectVisible(state, scene, c.object) === c.visible;
    }
    case "first_time":
      return !hasFired(state, key);
  }
}

type CounterOp = Extract<Condition, { type: "counter" }>["op"];

function compare(v: number, op: CounterOp, n: number): boolean {
  switch (op) {
    case "eq":
      return v === n;
    case "ne":
      return v !== n;
    case "lt":
      return v < n;
    case "gt":
      return v > n;
  }
}

/** Whether a rule's `when` answers a fired trigger. Combine matches either order. */
export function triggerMatches(when: Trigger, fired: Trigger): boolean {
  if (when.type !== fired.type) return false;
  if (when.type === "use_item" && fired.type === "use_item") return when.item === fired.item;
  if (when.type === "combine" && fired.type === "combine") {
    return (when.item === fired.item && when.with === fired.with) || (when.item === fired.with && when.with === fired.item);
  }
  if (when.type === "dialogue_end" && fired.type === "dialogue_end") return when.dialogue === fired.dialogue;
  return true;
}

export interface Match<R extends AnyRule = AnyRule> {
  rule: R;
  key: string;
}

/**
 * The first rule (top to bottom) answering `trigger` whose conditions all pass.
 * A `once` rule that already fired is skipped. `report` (playtest only) hears
 * every rule's verdict up to and including the match; conditions stop at the first
 * that fails, as before.
 */
export function firstMatch<R extends AnyRule>(rules: readonly R[], owner: RuleOwner, trigger: Trigger, ctx: RuleContext, report?: RuleReport): Match<R> | null {
  for (const [index, rule] of rules.entries()) {
    const key = ruleKey(owner, rule.id);
    if (!triggerMatches(rule.when, trigger)) {
      report?.(rule, index, key, { kind: "wrong_trigger" });
      continue;
    }
    if (rule.once && hasFired(ctx.state, key)) {
      report?.(rule, index, key, { kind: "once_fired" });
      continue;
    }
    const failed = rule.if.findIndex((c) => !checkCondition(c, ctx, key));
    if (failed < 0) {
      report?.(rule, index, key, { kind: "matched" });
      return { rule, key };
    }
    report?.(rule, index, key, { kind: "condition_failed", index: failed, condition: rule.if[failed]! });
  }
  return null;
}

/** The game's reply when no rule matches. Walk has none: it's just a walk. */
export function defaultResponse(game: GameFile, trigger: Trigger): string | null {
  switch (trigger.type) {
    case "look":
    case "hand":
    case "talk":
    case "use_item":
    case "combine":
      return game.defaultResponses[trigger.type];
    default:
      return null;
  }
}
