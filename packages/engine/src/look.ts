import type { GameFile, InteractRule } from "@questforge/schema";

/**
 * M1 look text (D67): the `narrate` lines of the first `look` rule that has no
 * conditions, else the game's default look response. M2 replaces this with the
 * rule engine (spec 02).
 */
export function lookText(rules: readonly InteractRule[], defaults: GameFile["defaultResponses"]): string[] {
  const rule = rules.find((r) => r.when.type === "look" && r.if.length === 0);
  const lines = rule?.do.flatMap((a) => (a.type === "narrate" ? [a.text] : [])) ?? [];
  return lines.length > 0 ? lines : [defaults.look];
}
