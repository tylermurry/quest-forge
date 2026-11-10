// Validation problems on the dialogue graph: by node for the canvas, and by
// part (an option, a condition, an action) for the node inspector. DOM-free.
import type { DataPath, DialogueFile, Problem } from "@questforge/schema";
import { pathWithin } from "../locate.ts";

/** Problems in a dialogue's file, grouped by the node they point into. */
export function problemsByNode(problems: readonly Problem[], file: string, d: DialogueFile): Map<string, Problem[]> {
  const out = new Map<string, Problem[]>();
  for (const p of problems) {
    if (p.location.file !== file || p.location.path[0] !== "nodes" || typeof p.location.path[1] !== "number") continue;
    const node = d.nodes[p.location.path[1]];
    if (node) out.set(node.id, [...(out.get(node.id) ?? []), p]);
  }
  return out;
}

/** The problems inside `sub` of one node, e.g. `["options", 1]` or `["do", 0]`. */
export const partProblems = (nodeProblems: readonly Problem[] | undefined, nodeIndex: number, sub: DataPath) =>
  (nodeProblems ?? []).filter((p) => pathWithin(p.location.path, ["nodes", nodeIndex, ...sub]));

/** The data keys problems name directly inside a part (for red fields), e.g. `item`. */
export function invalidKeys(problems: readonly Problem[], nodeIndex: number, sub: DataPath): Set<string> {
  const keys = new Set<string>();
  const depth = 2 + sub.length;
  for (const p of problems) {
    if (!pathWithin(p.location.path, ["nodes", nodeIndex, ...sub])) continue;
    const key = p.location.path[depth];
    if (typeof key === "string") keys.add(key);
  }
  return keys;
}
