// The Problems panel's list: counts per severity and the filter.
// DOM-free; the panel only renders this.
import type { Problem, Severity } from "@questforge/schema";

export type SeverityFilter = Record<Severity, boolean>;
export const ALL_SEVERITIES: SeverityFilter = { error: true, warning: true };

export function problemCounts(problems: readonly Problem[]): Record<Severity, number> {
  let error = 0;
  for (const p of problems) if (p.severity === "error") error++;
  return { error, warning: problems.length - error };
}

/** Problems the filter shows, errors first (they block playtest and export), each kind in file order. */
export function visibleProblems(problems: readonly Problem[], filter: SeverityFilter): Problem[] {
  const shown = problems.filter((p) => filter[p.severity]);
  return [...shown.filter((p) => p.severity === "error"), ...shown.filter((p) => p.severity === "warning")];
}
