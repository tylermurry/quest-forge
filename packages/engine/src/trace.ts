import type { Action, AnyRule, Condition, Trigger } from "@questforge/schema";
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
  | { type: "note"; message: string; milestone?: "M7" | "M8" };

export type Trace = (event: TraceEvent) => void;

/** Reports each rule's verdict from `firstMatch`. */
export type RuleReport = (rule: AnyRule, index: number, key: string, verdict: RuleVerdict) => void;
