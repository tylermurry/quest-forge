// The rule vocabulary as the inspector shows it: a plain-English
// label per trigger, condition and action, and a sentence of words and fields that
// the card renders from dropdowns, pickers and text boxes. DOM-free.
import { ACTION_TYPES, CONDITION_TYPES, type Action, type Condition, type Facing } from "@questforge/schema";
import type { TriggerType } from "./owner.ts";

export type ConditionType = Condition["type"];
export type ActionType = Action["type"];

/**
 * What a picker lists. Most are reference kinds; `award` lists award IDs already used
 * by `award_points`, and `spawn` / `object` are scoped to a scene, `animation` to an
 * object and `slot` to a character.
 */
export type PickKind = "item" | "flag" | "counter" | "scene" | "spawn" | "object" | "character" | "dialogue" | "audio" | "award" | "animation" | "slot";

export type Field =
  /** Picks an ID. `scopeKey` names the sibling field holding the scene that spawns and objects come from. */
  | { kind: "pick"; key: string; pick: PickKind; scopeKey?: string; label: string }
  | { kind: "text"; key: string; label: string }
  | { kind: "int"; key: string; label: string; min?: number }
  | { kind: "number"; key: string; label: string; min: number; max: number; step: number }
  | { kind: "bool"; key: string; label: string; on: string; off: string }
  | { kind: "enum"; key: string; label: string; options: { value: string; label: string }[] }
  /** `x` / `y` fields with "Pick on canvas"; `sceneKey` names the field holding the scene, if any. */
  | { kind: "point"; label: string; sceneKey?: string }
  /** `play_animation`'s target: a character or a scene object. */
  | { kind: "animTarget"; label: string };

/** A sentence is words and fields, read left to right. */
export type Part = string | Field;

const pick = (key: string, p: PickKind, label: string, scopeKey?: string): Field => ({ kind: "pick", key, pick: p, label, ...(scopeKey && { scopeKey }) });
const FACINGS: Facing[] = ["down", "up", "left", "right"];
const facing: Field = { kind: "enum", key: "facing", label: "Facing", options: FACINGS.map((f) => ({ value: f, label: f })) };

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  look: "Look",
  hand: "Hand",
  talk: "Talk",
  walk: "Walk",
  use_item: "Use",
  enter_region: "Player walks in",
  scene_enter: "Player enters the scene",
  scene_exit: "Player leaves the scene",
  combine: "Combine",
  dialogue_end: "Dialogue ends",
};

/** Fields after the trigger dropdown: `When [Use ▾] with [Key ▾]`. */
export const TRIGGER_PARTS: Record<TriggerType, Part[]> = {
  look: [],
  hand: [],
  talk: [],
  walk: [],
  use_item: ["with", pick("item", "item", "Item")],
  enter_region: [],
  scene_enter: [],
  scene_exit: [],
  combine: [pick("item", "item", "Item"), "with", pick("with", "item", "Other item")],
  dialogue_end: [pick("dialogue", "dialogue", "Dialogue")],
};

export const CONDITION_LABEL: Record<ConditionType, string> = {
  has_item: "Player has",
  not_has_item: "Player doesn't have",
  flag_is: "Flag",
  counter: "Counter",
  visited: "Visited",
  object_visible: "Object",
  first_time: "First time",
};

export const CONDITION_PARTS: Record<ConditionType, Part[]> = {
  has_item: [pick("item", "item", "Item")],
  not_has_item: [pick("item", "item", "Item")],
  flag_is: [pick("flag", "flag", "Flag"), "is", { kind: "bool", key: "value", label: "Value", on: "true", off: "false" }],
  counter: [
    pick("counter", "counter", "Counter"),
    {
      kind: "enum",
      key: "op",
      label: "Comparison",
      options: [
        { value: "eq", label: "=" },
        { value: "ne", label: "≠" },
        { value: "lt", label: "<" },
        { value: "gt", label: ">" },
      ],
    },
    { kind: "int", key: "value", label: "Number" },
  ],
  visited: [pick("scene", "scene", "Scene")],
  object_visible: [
    pick("object", "object", "Object", "scene"),
    "in",
    pick("scene", "scene", "Scene"),
    "is",
    { kind: "bool", key: "visible", label: "Shown", on: "visible", off: "hidden" },
  ],
  first_time: [],
};

export const ACTION_LABEL: Record<ActionType, string> = {
  narrate: "Narrate",
  say: "Say",
  walk_player_to: "Walk player to",
  walk_character_to: "Walk character to",
  face: "Face",
  change_scene: "Change scene",
  give_item: "Give item",
  take_item: "Take item",
  set_flag: "Set flag",
  add_to_counter: "Add to counter",
  award_points: "Award points",
  show_object: "Show object",
  hide_object: "Hide object",
  play_animation: "Play animation",
  set_character_position: "Move character to",
  play_sound: "Play sound",
  play_music: "Play music",
  stop_music: "Stop music",
  start_dialogue: "Start dialogue",
  wait: "Wait",
  die: "Die",
  win_game: "Win the game",
};

/** Spec 02's action categories, for a grouped dropdown. */
export const ACTION_GROUPS: { title: string; types: ActionType[] }[] = [
  { title: "Text", types: ["narrate", "say"] },
  { title: "Movement", types: ["walk_player_to", "walk_character_to", "face", "change_scene"] },
  { title: "Items", types: ["give_item", "take_item"] },
  { title: "State", types: ["set_flag", "add_to_counter", "award_points"] },
  { title: "World", types: ["show_object", "hide_object", "play_animation", "set_character_position"] },
  { title: "Audio", types: ["play_sound", "play_music", "stop_music"] },
  { title: "Flow", types: ["start_dialogue", "wait", "die", "win_game"] },
];

export const ACTION_PARTS: Record<ActionType, Part[]> = {
  narrate: [{ kind: "text", key: "text", label: "Narration" }],
  say: [pick("character", "character", "Character"), { kind: "text", key: "text", label: "Line" }],
  walk_player_to: [{ kind: "point", label: "Point" }],
  walk_character_to: [pick("character", "character", "Character"), "to", { kind: "point", label: "Point" }],
  face: [facing],
  change_scene: [pick("scene", "scene", "Scene"), "at", pick("spawn", "spawn", "Spawn point", "scene")],
  give_item: [pick("item", "item", "Item")],
  take_item: [pick("item", "item", "Item")],
  set_flag: [pick("flag", "flag", "Flag"), "to", { kind: "bool", key: "value", label: "Value", on: "true", off: "false" }],
  add_to_counter: [pick("counter", "counter", "Counter"), "+", { kind: "int", key: "amount", label: "Amount" }],
  award_points: [{ kind: "int", key: "points", label: "Points", min: 1 }, "for", pick("award", "award", "Award")],
  show_object: [pick("object", "object", "Object", "scene"), "in", pick("scene", "scene", "Scene")],
  hide_object: [pick("object", "object", "Object", "scene"), "in", pick("scene", "scene", "Scene")],
  play_animation: [{ kind: "animTarget", label: "On" }, pick("animation", "animation", "Animation")],
  set_character_position: [
    pick("character", "character", "Character"),
    "to",
    pick("scene", "scene", "Scene"),
    "at",
    { kind: "point", label: "Point", sceneKey: "scene" },
    "facing",
    facing,
  ],
  play_sound: [pick("sound", "audio", "Sound")],
  play_music: [pick("music", "audio", "Music")],
  stop_music: [],
  start_dialogue: [pick("dialogue", "dialogue", "Dialogue")],
  wait: [{ kind: "number", key: "seconds", label: "Seconds", min: 0.1, max: 60, step: 0.1 }, "seconds"],
  die: [{ kind: "text", key: "message", label: "Message" }],
  win_game: [],
};

// Every schema type has a label and a sentence; a new one fails to typecheck above,
// and these keep the lists in the schema's order.
export const CONDITION_ORDER = CONDITION_TYPES as ConditionType[];
export const ACTION_ORDER = ACTION_TYPES as ActionType[];
