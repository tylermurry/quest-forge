// Which rule parts are invalid (spec 10: "invalid rules show inline in red"), and
// whether a jump-to highlight points into one. Reuses the Editor's problems; never
// re-checks anything itself.
import type { DataPath, Location, Problem } from "@questforge/schema";
import { pathWithin } from "../locate.ts";
import type { OwnerRules } from "./owner.ts";

/** A part of a rule: its trigger, a condition or an action. */
export type RulePart = { kind: "when" } | { kind: "if"; index: number } | { kind: "do"; index: number };

export const partKey = (ruleId: string, part: RulePart) => (part.kind === "when" ? `${ruleId}/when` : `${ruleId}/${part.kind}/${part.index}`);

export interface RuleProblems {
  /** All problems inside each rule, by rule ID. */
  byRule: Map<string, Problem[]>;
  /** Problems in one part, by `partKey`. */
  byPart: Map<string, Problem[]>;
}

/** Splits the owner's problems by rule and by rule part. */
export function ruleProblems(problems: readonly Problem[], own: OwnerRules): RuleProblems {
  const byRule = new Map<string, Problem[]>();
  const byPart = new Map<string, Problem[]>();
  const add = (m: Map<string, Problem[]>, k: string, p: Problem) => m.set(k, [...(m.get(k) ?? []), p]);
  for (const p of problems) {
    const where = locateInRules(p.location, own);
    if (!where) continue;
    add(byRule, where.ruleId, p);
    if (where.part) add(byPart, partKey(where.ruleId, where.part), p);
  }
  return { byRule, byPart };
}

/** The rule and part a location points into, if it's inside this owner's rules. */
export function locateInRules(location: Location, own: OwnerRules): { ruleId: string; part: RulePart | null } | null {
  if (location.file !== own.file || !pathWithin(location.path, own.path)) return null;
  const rest: DataPath = location.path.slice(own.path.length);
  const i = rest[0];
  if (typeof i !== "number") return null;
  const rule = own.rules[i];
  if (!rule) return null;
  const [field, index] = [rest[1], rest[2]];
  if (field === "when") return { ruleId: rule.id, part: { kind: "when" } };
  if ((field === "if" || field === "do") && typeof index === "number") return { ruleId: rule.id, part: { kind: field, index } };
  return { ruleId: rule.id, part: null };
}
