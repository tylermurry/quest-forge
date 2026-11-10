// Quick fields: Look / Hand / Talk text that creates and keeps one
// simple rule, so most hotspots never need the rule list. A quick field owns the
// last rule for its verb when that rule is plain: no conditions, exactly one
// `narrate`, `once` off.
import type { AnyRule, Project } from "@questforge/schema";
import { CommandError } from "../commands.ts";
import { newRuleId, ownerRules, updateOwnerRules, type RuleOwnerRef } from "./owner.ts";

export type QuickVerb = "look" | "hand" | "talk";
export const QUICK_VERBS: readonly QuickVerb[] = ["look", "hand", "talk"];
export const QUICK_LABEL: Record<QuickVerb, string> = { look: "Look text", hand: "Hand text", talk: "Talk text" };

/** Hotspots, objects and placed characters have quick fields; regions, scenes and the game don't. */
export const hasQuickFields = (owner: RuleOwnerRef) => owner.kind === "thing" && owner.list !== "regions";

export type QuickField =
  /** No rule for this verb yet: typing creates one. */
  | { state: "empty" }
  /** The field owns this rule and edits its narration. */
  | { state: "plain"; ruleId: string; text: string }
  /** The last rule for this verb was edited by hand: "Set by rule N" (1-based), read-only. */
  | { state: "custom"; ruleId: string; number: number };

const isPlain = (r: AnyRule, verb: QuickVerb) => r.when.type === verb && r.if.length === 0 && r.do.length === 1 && r.do[0]!.type === "narrate" && !r.once;

export function quickField(rules: readonly AnyRule[], verb: QuickVerb): QuickField {
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i]!;
    if (r.when.type !== verb) continue;
    if (isPlain(r, verb)) return { state: "plain", ruleId: r.id, text: (r.do[0] as { text: string }).text };
    return { state: "custom", ruleId: r.id, number: i + 1 };
  }
  return { state: "empty" };
}

/** IDs of the rules the owner's quick fields own. */
export function ownedQuickRules(owner: RuleOwnerRef, rules: readonly AnyRule[]): string[] {
  if (!hasQuickFields(owner)) return [];
  return QUICK_VERBS.flatMap((v) => {
    const q = quickField(rules, v);
    return q.state === "plain" ? [q.ruleId] : [];
  });
}

/**
 * Types into a quick field: an empty field gets a new plain rule at the bottom, a
 * plain one changes its narration, and clearing it deletes that rule.
 */
export function setQuickText(p: Project, owner: RuleOwnerRef, verb: QuickVerb, text: string): Project {
  if (!hasQuickFields(owner)) throw new CommandError("This has no quick fields.");
  const own = ownerRules(p, owner);
  if (!own) throw new CommandError("That's no longer there.");
  const q = quickField(own.rules, verb);
  if (q.state === "custom") throw new CommandError(`The ${verb} text is set by rule ${q.number}. Edit it there.`);
  if (q.state === "empty") {
    if (text === "") return p;
    const id = newRuleId(own.rules);
    const rule = { id, when: { type: verb }, if: [], do: [{ type: "narrate", text }], once: false } as AnyRule;
    return updateOwnerRules(p, owner, (rules) => [...rules, rule]);
  }
  if (text === "") return updateOwnerRules(p, owner, (rules) => rules.filter((r) => r.id !== q.ruleId));
  if (text === q.text) return p;
  return updateOwnerRules(p, owner, (rules) => rules.map((r) => (r.id === q.ruleId ? { ...r, do: [{ type: "narrate", text }] } : r)));
}
