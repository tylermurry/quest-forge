// Auto-layout for the dialogue graph (spec 11): columns by distance from Start, left
// to right, each column stacked top to bottom in the order the ports lead there.
// Nodes Start can't reach go in the columns after. Pure; positions are integers (D62).
import { nodePorts, type DialogueFile, type DialogueNode } from "@questforge/schema";

const COLUMN_WIDTH = 320;
const GAP_Y = 48;

/** A rough height of a node's card, so stacked cards don't overlap. */
function nodeHeight(n: DialogueNode): number {
  switch (n.type) {
    case "start":
    case "end":
      return 48;
    case "line":
      return 96;
    case "choices":
      return 56 + 30 * Math.max(1, n.options.length);
    case "actions":
      return 64 + 22 * Math.max(1, n.do.length);
    case "branch":
      return 96 + 22 * n.if.length;
  }
}

/** New positions for every node, by ID. */
export function autoLayout(d: DialogueFile): Map<string, [number, number]> {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const order: string[] = [];
  const walk = (from: string, base: number) => {
    const queue: [string, number][] = [[from, base]];
    while (queue.length) {
      const [id, k] = queue.shift()!;
      const n = byId.get(id);
      if (!n || depth.has(id)) continue;
      depth.set(id, k);
      order.push(id);
      for (const p of nodePorts(n)) if (p.next !== null && !depth.has(p.next)) queue.push([p.next, k + 1]);
    }
  };
  const start = d.nodes.find((n) => n.type === "start");
  if (start) walk(start.id, 0);
  for (const n of d.nodes) {
    if (depth.has(n.id)) continue;
    walk(n.id, Math.max(-1, ...depth.values()) + 1);
  }
  const columns = new Map<number, string[]>();
  for (const id of order) columns.set(depth.get(id)!, [...(columns.get(depth.get(id)!) ?? []), id]);
  const out = new Map<string, [number, number]>();
  for (const [k, ids] of columns) {
    const heights = ids.map((id) => nodeHeight(byId.get(id)!));
    const total = heights.reduce((a, b) => a + b, 0) + GAP_Y * (ids.length - 1);
    let y = -Math.round(total / 2);
    ids.forEach((id, i) => {
      out.set(id, [k * COLUMN_WIDTH, y]);
      y += heights[i]! + GAP_Y;
    });
  }
  return out;
}
