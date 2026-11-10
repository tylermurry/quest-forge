// Rule commands: pure Project → Project functions, each run as one undo
// step through Editor.apply. Rules are addressed by their stable ID;
// conditions and actions by index inside the rule.
import { Id, type AnyRule, type Project, type Trigger } from "@questforge/schema";
import { CommandError } from "../commands.ts";
import { RuleDefaults } from "./defaults.ts";
import { newRuleId, ownerRules, ownerTriggers, updateOwnerRules, type RuleOwnerRef, type TriggerType } from "./owner.ts";
import { actions, conditions, type AnimTarget } from "./parts.ts";
import { ownedQuickRules } from "./quick.ts";
import type { ActionType, ConditionType } from "./vocab.ts";

const gone = () => new CommandError("That rule is no longer there.");

function rulesOf(p: Project, owner: RuleOwnerRef): AnyRule[] {
  const r = ownerRules(p, owner);
  if (!r) throw new CommandError("That's no longer there.");
  return r.rules;
}

/** Applies `f` to one rule, by ID. */
function updateRule(p: Project, owner: RuleOwnerRef, id: string, f: (r: AnyRule) => AnyRule): Project {
  if (!rulesOf(p, owner).some((r) => r.id === id)) throw gone();
  return updateOwnerRules(p, owner, (rules) => rules.map((r) => (r.id === id ? f(r) : r)));
}

const allowed = (owner: RuleOwnerRef, type: TriggerType) => {
  if (!ownerTriggers(owner).includes(type)) throw new CommandError(`A ${type} rule can't go here.`);
};

/**
 * Adds a rule with no conditions and no actions. It goes above the quick fields'
 * plain fallback rules so they stay last (first match wins); elsewhere at the end.
 */
export function addRule(p: Project, owner: RuleOwnerRef, type: TriggerType = ownerTriggers(owner)[0]!): { project: Project; id: string } {
  allowed(owner, type);
  const rules = rulesOf(p, owner);
  const id = newRuleId(rules);
  const rule = { id, when: new RuleDefaults(p, owner).trigger(type), if: [], do: [], once: false } as AnyRule;
  const owned = ownedQuickRules(owner, rules);
  const at = owned.length ? Math.min(...owned.map((o) => rules.findIndex((r) => r.id === o))) : rules.length;
  return { project: updateOwnerRules(p, owner, (rs) => [...rs.slice(0, at), rule, ...rs.slice(at)]), id };
}

export function deleteRule(p: Project, owner: RuleOwnerRef, id: string): Project {
  if (!rulesOf(p, owner).some((r) => r.id === id)) throw gone();
  return updateOwnerRules(p, owner, (rules) => rules.filter((r) => r.id !== id));
}

/** A copy right below the original, with a new ID (so it never shares fired state). */
export function duplicateRule(p: Project, owner: RuleOwnerRef, id: string): { project: Project; id: string } {
  const rules = rulesOf(p, owner);
  const i = rules.findIndex((r) => r.id === id);
  if (i < 0) throw gone();
  const copy = { ...structuredClone(rules[i]!), id: newRuleId(rules) };
  return { project: updateOwnerRules(p, owner, (rs) => [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)]), id: copy.id };
}

/** Moves a rule to `to` (its index after the move). Order matters: first match wins. */
export function moveRule(p: Project, owner: RuleOwnerRef, id: string, to: number): Project {
  const rules = rulesOf(p, owner);
  const from = rules.findIndex((r) => r.id === id);
  if (from < 0) throw gone();
  const target = Math.max(0, Math.min(rules.length - 1, to));
  if (target === from) return p;
  return updateOwnerRules(p, owner, (rs) => {
    const next = [...rs];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved!);
    return next;
  });
}

export function setOnce(p: Project, owner: RuleOwnerRef, id: string, once: boolean): Project {
  return updateRule(p, owner, id, (r) => (r.once === once ? r : { ...r, once }));
}

// ── Trigger ─────────────────────────────────────────────────────────────────

/** Changes what the rule answers. Its trigger fields start fresh (an item for Use, …). */
export function setTriggerType(p: Project, owner: RuleOwnerRef, id: string, type: TriggerType): Project {
  allowed(owner, type);
  const d = new RuleDefaults(p, owner);
  return updateRule(p, owner, id, (r) => (r.when.type === type ? r : ({ ...r, when: d.trigger(type) } as AnyRule)));
}

export function setTriggerField(p: Project, owner: RuleOwnerRef, id: string, key: string, value: unknown): Project {
  return updateRule(p, owner, id, (r) => {
    if (!(key in r.when) || key === "type") throw new CommandError("That isn't part of this trigger.");
    if (!Id.safeParse(value).success) throw new CommandError("That value doesn't fit there.");
    return { ...r, when: { ...r.when, [key]: value } as Trigger } as AnyRule;
  });
}

// ── Conditions and actions ──────────────────────────────────────────────────
// The list edits live in parts.ts, shared with the dialogue graph.

const defaults = (p: Project, owner: RuleOwnerRef) => new RuleDefaults(p, owner);

export function addCondition(p: Project, owner: RuleOwnerRef, id: string, type: ConditionType): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, if: conditions.add(d, r.if, type) }));
}

/** Swaps a condition for a fresh one of another type. */
export function setConditionType(p: Project, owner: RuleOwnerRef, id: string, index: number, type: ConditionType): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, if: conditions.setType(d, r.if, index, type) }));
}

/** Changes some fields of a condition; the result must still be a valid condition. */
export function setConditionFields(p: Project, owner: RuleOwnerRef, id: string, index: number, patch: Record<string, unknown>): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, if: conditions.setFields(d, r.if, index, patch) }));
}

export function removeCondition(p: Project, owner: RuleOwnerRef, id: string, index: number): Project {
  return updateRule(p, owner, id, (r) => ({ ...r, if: conditions.remove(r.if, index) }));
}

export function addAction(p: Project, owner: RuleOwnerRef, id: string, type: ActionType): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, do: actions.add(d, r.do, type) }));
}

/** Swaps an action for a fresh one of another type, keeping its text when both have text. */
export function setActionType(p: Project, owner: RuleOwnerRef, id: string, index: number, type: ActionType): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, do: actions.setType(d, r.do, index, type) }));
}

/** Changes some fields of an action; the result must still be a valid action. */
export function setActionFields(p: Project, owner: RuleOwnerRef, id: string, index: number, patch: Record<string, unknown>): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, do: actions.setFields(d, r.do, index, patch) }));
}

/** Points `play_animation` at a character or an object; its animation starts on that target's first one. */
export function setAnimationTarget(p: Project, owner: RuleOwnerRef, id: string, index: number, target: AnimTarget): Project {
  return updateRule(p, owner, id, (r) => ({ ...r, do: actions.setAnimTarget(p, r.do, index, target) }));
}

export function removeAction(p: Project, owner: RuleOwnerRef, id: string, index: number): Project {
  return updateRule(p, owner, id, (r) => ({ ...r, do: actions.remove(r.do, index) }));
}

/** Actions run in order, so they can be moved up and down. */
export function moveAction(p: Project, owner: RuleOwnerRef, id: string, from: number, to: number): Project {
  if (from === to) return p;
  return updateRule(p, owner, id, (r) => ({ ...r, do: actions.move(r.do, from, to) }));
}

/** Applies a list edit (parts.ts) to a rule's conditions or actions; for shared UI rows. */
export function editRuleList<K extends "if" | "do">(p: Project, owner: RuleOwnerRef, id: string, key: K, f: (list: AnyRule[K], d: RuleDefaults) => AnyRule[K]): Project {
  const d = defaults(p, owner);
  return updateRule(p, owner, id, (r) => ({ ...r, [key]: f(r[key], d) }) as AnyRule);
}
