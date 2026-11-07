// Edits to a list of conditions or actions (spec 10), shared by rule cards and the
// dialogue graph's Choices, Branch and Actions nodes (spec 11). Pure: each takes a
// list and returns a new one; the caller puts it back where it lives.
import { Action, Condition, type Project } from "@questforge/schema";
import { CommandError } from "../commands.ts";
import type { RuleDefaults } from "./defaults.ts";
import type { ActionType, ConditionType } from "./vocab.ts";

type Part = Record<string, unknown> & { type: string };
export type AnimTarget = { kind: "character"; character: string } | { kind: "object"; scene: string; object: string };

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
  if (index < 0 || index >= list.length) throw new CommandError("That's no longer there.");
  const next = [...list];
  const v = f(list[index]!);
  if (v === null) next.splice(index, 1);
  else next[index] = v;
  return next;
}

export function moveIn<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) throw new CommandError("That's no longer there.");
  const next = [...list];
  const [m] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, m!);
  return next;
}

export const conditions = {
  add: (d: RuleDefaults, list: readonly Condition[], type: ConditionType): Condition[] => [...list, d.condition(type)],
  /** Swaps a condition for a fresh one of another type. */
  setType: (d: RuleDefaults, list: readonly Condition[], i: number, type: ConditionType): Condition[] => listEdit(list, i, (old) => (old.type === type ? old : d.condition(type))),
  /** Changes some fields; the result must still be a valid condition. */
  setFields: (d: RuleDefaults, list: readonly Condition[], i: number, patch: Record<string, unknown>): Condition[] =>
    listEdit(list, i, (old) => parsed<Condition>(Condition, fixUp(d, old as Part, { ...(old as Part), ...patch, type: old.type }))),
  remove: (list: readonly Condition[], i: number): Condition[] => listEdit(list, i, () => null),
  move: (list: readonly Condition[], from: number, to: number): Condition[] => (from === to ? [...list] : moveIn(list, from, to)),
};

export const actions = {
  add: (d: RuleDefaults, list: readonly Action[], type: ActionType): Action[] => [...list, d.action(type)],
  /** Swaps an action for a fresh one of another type, keeping its text when both have text. */
  setType: (d: RuleDefaults, list: readonly Action[], i: number, type: ActionType): Action[] =>
    listEdit(list, i, (old) => {
      if (old.type === type) return old;
      const fresh = d.action(type);
      if ("text" in old && "text" in fresh) return { ...fresh, text: old.text } as Action;
      return fresh;
    }),
  /** Changes some fields; the result must still be a valid action. */
  setFields: (d: RuleDefaults, list: readonly Action[], i: number, patch: Record<string, unknown>): Action[] =>
    listEdit(list, i, (old) => parsed<Action>(Action, fixUp(d, old as Part, { ...(old as Part), ...patch, type: old.type }))),
  /** Points `play_animation` at a character or an object; its animation starts on that target's first one. */
  setAnimTarget: (p: Project, list: readonly Action[], i: number, target: AnimTarget): Action[] => {
    const animation = firstAnimation(p, target);
    return listEdit(list, i, (old) => {
      if (old.type !== "play_animation") throw new CommandError("That isn't an animation action.");
      return { ...old, target, animation: animation ?? old.animation };
    });
  },
  remove: (list: readonly Action[], i: number): Action[] => listEdit(list, i, () => null),
  /** Actions run in order, so they can be moved up and down. */
  move: (list: readonly Action[], from: number, to: number): Action[] => (from === to ? [...list] : moveIn(list, from, to)),
};

function firstAnimation(p: Project, target: AnimTarget): string | undefined {
  if (target.kind === "object") {
    return p.scenes.find((s) => s.data.id === target.scene)?.data.objects.find((o) => o.id === target.object)?.animations?.[0]?.id;
  }
  const c = p.characters.find((x) => x.data.id === target.character)?.data;
  return c ? Object.keys(c.animations).find((k) => c.animations[k as keyof typeof c.animations]) : undefined;
}
