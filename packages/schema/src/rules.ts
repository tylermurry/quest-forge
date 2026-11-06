import { z } from "zod";
import { Facing, Id, SceneX, SceneY, Text } from "./common.ts";

// Rule vocabulary (spec 02, D37). Every trigger, condition and action is a map
// tagged by `type` (D63). This closed set is everything a designer can express.

const tag = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });

/** An object reference always names its scene (D61). */
const objectRef = { scene: Id, object: Id };

// ── Triggers ────────────────────────────────────────────────────────────────
// Split by where a rule can live, so a trigger in the wrong place fails to parse.

/** Verbs on a hotspot, scene object or placed character. */
export const InteractTrigger = z.discriminatedUnion("type", [
  tag("look", {}),
  tag("hand", {}),
  tag("talk", {}),
  tag("walk", {}),
  tag("use_item", { item: Id }),
]);
export const RegionTrigger = z.discriminatedUnion("type", [tag("enter_region", {})]);
export const SceneTrigger = z.discriminatedUnion("type", [tag("scene_enter", {}), tag("scene_exit", {})]);
/** Game-level rules live in game.yaml. */
export const GameTrigger = z.discriminatedUnion("type", [
  tag("combine", { item: Id, with: Id }),
  tag("dialogue_end", { dialogue: Id }),
]);

// ── Conditions ──────────────────────────────────────────────────────────────

export const CounterOp = z.enum(["eq", "ne", "lt", "gt"]);

export const Condition = z.discriminatedUnion("type", [
  tag("has_item", { item: Id }),
  tag("not_has_item", { item: Id }),
  tag("flag_is", { flag: Id, value: z.boolean() }),
  tag("counter", { counter: Id, op: CounterOp, value: z.int() }),
  tag("visited", { scene: Id }),
  tag("object_visible", { ...objectRef, visible: z.boolean() }),
  /** True until this rule has fired once. */
  tag("first_time", {}),
]);
export type Condition = z.infer<typeof Condition>;

// ── Actions ─────────────────────────────────────────────────────────────────

export const AnimationTarget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("character"), character: Id }),
  z.strictObject({ kind: z.literal("object"), ...objectRef }),
]);

export const Action = z.discriminatedUnion("type", [
  // Text
  tag("narrate", { text: Text }),
  tag("say", { character: Id, text: Text }),
  // Movement
  tag("walk_player_to", { x: SceneX, y: SceneY }),
  tag("face", { facing: Facing }),
  tag("change_scene", { scene: Id, spawn: Id }),
  // Items
  tag("give_item", { item: Id }),
  tag("take_item", { item: Id }),
  // State
  tag("set_flag", { flag: Id, value: z.boolean() }),
  tag("add_to_counter", { counter: Id, amount: z.int() }),
  /** Each award ID counts once (spec 07). */
  tag("award_points", { points: z.int().positive(), award: Id }),
  // World
  tag("show_object", objectRef),
  tag("hide_object", objectRef),
  tag("play_animation", { target: AnimationTarget, animation: Id }),
  tag("set_character_position", { character: Id, scene: Id, x: SceneX, y: SceneY, facing: Facing }),
  // Audio
  tag("play_sound", { sound: Id }),
  tag("play_music", { music: Id }),
  tag("stop_music", {}),
  // Flow
  tag("start_dialogue", { dialogue: Id }),
  tag("wait", { seconds: z.number().positive().max(60) }),
  tag("die", { message: Text }),
  tag("win_game", {}),
]);
export type Action = z.infer<typeof Action>;

// ── Rules ───────────────────────────────────────────────────────────────────

/** `WHEN <trigger> [IF <all conditions>] DO <actions>` plus `once` (spec 02). */
export const makeRule = <T extends z.ZodType>(trigger: T) =>
  z.strictObject({
    when: trigger,
    if: z.array(Condition),
    do: z.array(Action),
    once: z.boolean(),
  });

export const InteractRule = makeRule(InteractTrigger);
export const RegionRule = makeRule(RegionTrigger);
export const SceneRule = makeRule(SceneTrigger);
export const GameRule = makeRule(GameTrigger);
export type InteractRule = z.infer<typeof InteractRule>;
export type RegionRule = z.infer<typeof RegionRule>;
export type SceneRule = z.infer<typeof SceneRule>;
export type GameRule = z.infer<typeof GameRule>;
export type AnyRule = InteractRule | RegionRule | SceneRule | GameRule;
export type Trigger = AnyRule["when"];

const typesOf = (u: { options: readonly { shape: { type: { value: string } } }[] }) =>
  u.options.map((o) => o.shape.type.value);

/** Dropdown vocabularies for the rule inspector (spec 10). */
export const CONDITION_TYPES = typesOf(Condition);
export const ACTION_TYPES = typesOf(Action);
export const TRIGGER_TYPES = [InteractTrigger, RegionTrigger, SceneTrigger, GameTrigger].flatMap(typesOf);
