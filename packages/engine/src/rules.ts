import type { AnyRule, Condition, GameFile, SceneFile, Trigger } from "@questforge/schema";
import { hasItem, objectVisible, type GameState } from "./state.ts";

// Rule evaluation (spec 02, D40): a trigger checks its owner's rules top to bottom
// and the first rule whose conditions all pass is the one that runs. Pure: no
// side effects here; the sequence runner marks the rule fired and runs its actions.

/** Where a rule list lives. Its location is the rule's identity (D73). */
export type RuleOwner =
  | { kind: "hotspot" | "object" | "character" | "region"; scene: string; id: string }
  | { kind: "scene"; scene: string }
  | { kind: "game" };

/** Location key of a rule (D73), e.g. `garden/hotspot:pond/2`, `garden/scene/0`, `game/1`. */
export function ruleKey(owner: RuleOwner, index: number): string {
  switch (owner.kind) {
    case "game":
      return `game/${index}`;
    case "scene":
      return `${owner.scene}/scene/${index}`;
    default:
      return `${owner.scene}/${owner.kind}:${owner.id}/${index}`;
  }
}

/** What conditions can see. */
export interface RuleContext {
  state: GameState;
  /** Scene files by ID, for object visibility defaults. */
  scene(id: string): SceneFile | undefined;
}

export const hasFired = (state: GameState, key: string) => state.fired.includes(key);

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
 * A `once` rule that already fired is skipped.
 */
export function firstMatch<R extends AnyRule>(rules: readonly R[], owner: RuleOwner, trigger: Trigger, ctx: RuleContext): Match<R> | null {
  for (const [i, rule] of rules.entries()) {
    if (!triggerMatches(rule.when, trigger)) continue;
    const key = ruleKey(owner, i);
    if (rule.once && hasFired(ctx.state, key)) continue;
    if (rule.if.every((c) => checkCondition(c, ctx, key))) return { rule, key };
  }
  return null;
}

/** The game's reply when no rule matches (D40). Walk has none: it's just a walk. */
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
