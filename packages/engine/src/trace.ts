import type { Action, AnyRule, Condition, DialogueNode, Trigger } from "@questforge/schema";
import type { DialogueEndReason, OptionVerdict } from "./dialogue.ts";
import type { RuleOwner } from "./rules.ts";

// Playtest event log hooks (spec 12, D129). The editor passes a `Trace` callback to
// `Session`; the exported game passes none, so no events are built. Events are plain
// data: the editor turns them into plain English with the rule-card wording.

/** Why a rule did or didn't answer a trigger. */
export type RuleVerdict =
  /** Its `when` is a different trigger (or the same verb with another item). */
  | { kind: "wrong_trigger" }
  /** A `once` rule that already ran. */
  | { kind: "once_fired" }
  /** The first condition that failed; later ones weren't checked. */
  | { kind: "condition_failed"; index: number; condition: Condition }
  | { kind: "matched" };

export type TraceEvent =
  /** A verb, region, scene or combine fired on a rule list. */
  | { type: "trigger"; owner: RuleOwner; trigger: Trigger }
  /** One rule's verdict, top to bottom, up to and including the match. */
  | { type: "rule"; owner: RuleOwner; trigger: Trigger; rule: AnyRule; index: number; key: string; verdict: RuleVerdict }
  /** No rule matched: the default response (null when the trigger has none, e.g. walk or scene_enter). */
  | { type: "no_match"; owner: RuleOwner; trigger: Trigger; response: string | null }
  /** An action starting to run. */
  | { type: "action"; action: Action }
  /** The player entered a scene (`from` null at the start of play). */
  | { type: "scene"; from: string | null; to: string; spawn: string | null }
  /** An engine note: a stubbed action (with the milestone that owns it, D71) or an ignored step. */
  | { type: "note"; message: string; milestone?: "M8" }
  /** A dialogue began, at its Start or (playtest) at `node`. */
  | { type: "dialogue_start"; dialogue: string; node: string | null }
  /** The dialogue moved to a node. */
  | { type: "dialogue_node"; dialogue: string; node: DialogueNode }
  /** A Choices node: which options show and why the others don't. */
  | { type: "dialogue_options"; dialogue: string; node: string; options: { id: string; verdict: OptionVerdict }[] }
  /** The player picked an option. */
  | { type: "dialogue_choice"; dialogue: string; node: string; option: string }
  /** A Branch: true or false, and the first failed condition. */
  | { type: "dialogue_branch"; dialogue: string; node: string; result: boolean; failed?: { index: number; condition: Condition } }
  /** The dialogue stopped (D141). */
  | { type: "dialogue_end"; dialogue: string; reason: DialogueEndReason };

export type Trace = (event: TraceEvent) => void;

/** Reports each rule's verdict from `firstMatch`. */
export type RuleReport = (rule: AnyRule, index: number, key: string, verdict: RuleVerdict) => void;
