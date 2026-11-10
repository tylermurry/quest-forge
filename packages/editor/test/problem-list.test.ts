import { describe, expect, it } from "vitest";
import type { Problem } from "@questforge/schema";
import { ALL_SEVERITIES, problemCounts, visibleProblems } from "../src/model/problemList.ts";

const pr = (severity: Problem["severity"], message: string): Problem => ({
  severity,
  code: "missing_reference",
  breadcrumb: "X",
  message,
  location: { file: "f", path: [] },
});

describe("Problems list", () => {
  it("counts per severity, filters, and lists errors first", () => {
    const all = [pr("warning", "w1"), pr("error", "e1"), pr("warning", "w2"), pr("error", "e2")];
    expect(problemCounts(all)).toEqual({ error: 2, warning: 2 });
    expect(visibleProblems(all, ALL_SEVERITIES).map((p) => p.message)).toEqual(["e1", "e2", "w1", "w2"]);
    expect(visibleProblems(all, { error: false, warning: true }).map((p) => p.message)).toEqual(["w1", "w2"]);
    expect(visibleProblems(all, { error: true, warning: false }).map((p) => p.message)).toEqual(["e1", "e2"]);
  });
});
