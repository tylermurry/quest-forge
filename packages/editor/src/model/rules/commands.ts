// Rule commands (spec 10): pure Project → Project functions, each run as one undo
// step through Editor.apply (D84). Rules are addressed by their stable ID (D117);
// conditions and actions by index inside the rule.
import { Action, Condition, Id, type AnyRule, type Project, type Trigger } from "@questforge/schema";
import { CommandError } from "../commands.ts";
import { RuleDefaults } from "./defaults.ts";
import { newRuleId, ownerRules, ownerTriggers, updateOwnerRules, type RuleOwnerRef, type TriggerType } from "./owner.ts";
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
 * plain fallback rules so they stay last (first match wins, D118); elsewhere at the end.
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

/** Moves a rule to `to` (its index after the move). Order matters: first match wins (D40). */
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

type Part = Record<string, unknown> & { type: string };

/** Keeps dependent fields sensible: a new scene brings its own spawn and object. */
function fixUp(d: RuleDefaults, before: Part, after: Part): Part {
  const scene = after.scene;
  if (scene !== before.scene && typeof scene === "string") {
    if ("spawn" in after && after.spawn === before.spawn) after = { ...after, spawn: d.spawnIn(scene) };
    if ("object" in after && after.object === before.object) after = { ...after, object: d.objectIn(scene) };
  }
  return after;
}

function parsed<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new CommandError("That value doesn't fit there.");
  return r.data;
}

function listEdit<T>(list: readonly T[], index: number, f: (t: T) => T | null): T[] {
  if (index < 0 || index >= list.length) throw new CommandError("That's no longer in the rule.");
  const next = [...list];
  const v = f(list[index]!);
  if (v === null) next.splice(index, 1);
  else next[index] = v;
  return next;
}

function moveIn<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) throw new CommandError("That's no longer in the rule.");
  const next = [...list];
  const [m] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, m!);
  return next;
}

export function addCondition(p: Project, owner: RuleOwnerRef, id: string, type: ConditionType): Project {
  const c = new RuleDefaults(p, owner).condition(type);
  return updateRule(p, owner, id, (r) => ({ ...r, if: [...r.if, c] }));
}

/** Swaps a condition for a fresh one of another type. */
export function setConditionType(p: Project, owner: RuleOwnerRef, id: string, index: number, type: ConditionType): Project {
  const c = new RuleDefaults(p, owner).condition(type);
  return updateRule(p, owner, id, (r) => ({ ...r, if: listEdit(r.if, index, (old) => (old.type === type ? old : c)) }));
}

/** Changes some fields of a condition; the result must still be a valid condition. */
export function setConditionFields(p: Project, owner: RuleOwnerRef, id: string, index: number, patch: Record<string, unknown>): Project {
  const d = new RuleDefaults(p, owner);
  return updateRule(p, owner, id, (r) => ({
    ...r,
    if: listEdit(r.if, index, (old) => parsed<Condition>(Condition, fixUp(d, old as Part, { ...(old as Part), ...patch, type: old.type }))),
  }));
}

export function removeCondition(p: Project, owner: RuleOwnerRef, id: string, index: number): Project {
  return updateRule(p, owner, id, (r) => ({ ...r, if: listEdit(r.if, index, () => null) }));
}

export function addAction(p: Project, owner: RuleOwnerRef, id: string, type: ActionType): Project {
  const a = new RuleDefaults(p, owner).action(type);
  return updateRule(p, owner, id, (r) => ({ ...r, do: [...r.do, a] }));
}

/** Swaps an action for a fresh one of another type, keeping its text when both have text. */
export function setActionType(p: Project, owner: RuleOwnerRef, id: string, index: number, type: ActionType): Project {
  const fresh = new RuleDefaults(p, owner).action(type);
  return updateRule(p, owner, id, (r) => ({
    ...r,
    do: listEdit(r.do, index, (old) => {
      if (old.type === type) return old;
      if ("text" in old && "text" in fresh) return { ...fresh, text: old.text } as Action;
      return fresh;
    }),
  }));
}

/** Changes some fields of an action; the result must still be a valid action. */
export function setActionFields(p: Project, owner: RuleOwnerRef, id: string, index: number, patch: Record<string, unknown>): Project {
  const d = new RuleDefaults(p, owner);
  return updateRule(p, owner, id, (r) => ({
    ...r,
    do: listEdit(r.do, index, (old) => parsed<Action>(Action, fixUp(d, old as Part, { ...(old as Part), ...patch, type: old.type }))),
  }));
}

/** Points `play_animation` at a character or an object; its animation starts on that target's first one. */
export function setAnimationTarget(p: Project, owner: RuleOwnerRef, id: string, index: number, target: { kind: "character"; character: string } | { kind: "object"; scene: string; object: string }): Project {
  const animation = firstAnimation(p, target);
  return updateRule(p, owner, id, (r) => ({
    ...r,
    do: listEdit(r.do, index, (old) => {
      if (old.type !== "play_animation") throw new CommandError("That isn't an animation action.");
      return { ...old, target, animation: animation ?? old.animation };
    }),
  }));
}

function firstAnimation(p: Project, target: { kind: "character"; character: string } | { kind: "object"; scene: string; object: string }): string | undefined {
  if (target.kind === "object") {
    return p.scenes.find((s) => s.data.id === target.scene)?.data.objects.find((o) => o.id === target.object)?.animations?.[0]?.id;
  }
  const c = p.characters.find((x) => x.data.id === target.character)?.data;
  return c ? Object.keys(c.animations).find((k) => c.animations[k as keyof typeof c.animations]) : undefined;
}

export function removeAction(p: Project, owner: RuleOwnerRef, id: string, index: number): Project {
  return updateRule(p, owner, id, (r) => ({ ...r, do: listEdit(r.do, index, () => null) }));
}

/** Actions run in order, so they can be moved up and down. */
export function moveAction(p: Project, owner: RuleOwnerRef, id: string, from: number, to: number): Project {
  if (from === to) return p;
  return updateRule(p, owner, id, (r) => ({ ...r, do: moveIn(r.do, from, to) }));
}

export function moveCondition(p: Project, owner: RuleOwnerRef, id: string, from: number, to: number): Project {
  if (from === to) return p;
  return updateRule(p, owner, id, (r) => ({ ...r, if: moveIn(r.if, from, to) }));
}
