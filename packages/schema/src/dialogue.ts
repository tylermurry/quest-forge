import { z } from "zod";
import { CanvasPos, Id, Text, schemaVersion } from "./common.ts";
import { Action, Condition, RuleText } from "./rules.ts";

// Dialogue graph. `next` is null while a port is unconnected.
const node = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ id: Id, type: z.literal(type), pos: CanvasPos, ...shape });
const Next = Id.nullable();

/** A player option. Its text may be `""` while authoring: an error, not a parse failure. */
export const ChoiceOption = z.strictObject({
  id: Id,
  text: RuleText,
  if: z.array(Condition),
  once: z.boolean(),
  next: Next,
});
export type ChoiceOption = z.infer<typeof ChoiceOption>;

export const DialogueNode = z.discriminatedUnion("type", [
  node("start", { next: Next }),
  /**
   * No `character` means the narrator speaks. `animation` is a slot of the speaker's that
   * plays while the line shows. Text may be `""` while authoring.
   */
  node("line", { character: Id.optional(), text: RuleText, animation: Id.optional(), next: Next }),
  /**
   * The question the options answer, posed with them in one box. No `character` means the
   * narrator asks. Text may be `""` while authoring.
   */
  node("choices", { character: Id.optional(), text: RuleText, options: z.array(ChoiceOption) }),
  node("actions", { do: z.array(Action), next: Next }),
  node("branch", { if: z.array(Condition), then: Next, else: Next }),
  node("end", {}),
]);
export type DialogueNode = z.infer<typeof DialogueNode>;
export const DIALOGUE_NODE_TYPES = DialogueNode.options.map((o) => o.shape.type.value);

/** `dialogues/**\/<id>.dialogue.yaml`. */
export const DialogueFile = z.strictObject({
  schemaVersion,
  id: Id,
  name: Text,
  nodes: z.array(DialogueNode),
});
export type DialogueFile = z.infer<typeof DialogueFile>;

/**
 * One output port of a node: `next` on Start, Line and Actions; `then` / `else`
 * on Branch; one per option on Choices (`option:<id>`). `path` is relative to the node.
 */
export interface NodePort {
  port: string;
  path: (string | number)[];
  next: string | null;
}

export const optionPort = (optionId: string) => `option:${optionId}`;

/** A node's output ports in display order. End has none. */
export function nodePorts(n: DialogueNode): NodePort[] {
  switch (n.type) {
    case "start":
    case "line":
    case "actions":
      return [{ port: "next", path: ["next"], next: n.next }];
    case "branch":
      return [
        { port: "then", path: ["then"], next: n.then },
        { port: "else", path: ["else"], next: n.else },
      ];
    case "choices":
      return n.options.map((o, j) => ({ port: optionPort(o.id), path: ["options", j, "next"], next: o.next }));
    case "end":
      return [];
  }
}

/** Node IDs reachable from the Start node, Start included. Empty with no Start. */
export function reachableNodes(d: DialogueFile): Set<string> {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const start = d.nodes.find((n) => n.type === "start");
  const reached = new Set<string>();
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.pop()!;
    const n = byId.get(id);
    if (!n || reached.has(id)) continue;
    reached.add(id);
    for (const p of nodePorts(n)) if (p.next !== null) queue.push(p.next);
  }
  return reached;
}

/**
 * Loops that never pass a Line or Choices node, so nothing waits for the player.
 * Each is a list of node IDs in file order; a node that links to itself counts.
 */
export function silentLoops(d: DialogueFile): string[][] {
  const quiet = d.nodes.filter((n) => n.type !== "line" && n.type !== "choices");
  const ids = new Set(quiet.map((n) => n.id));
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const edges = new Map(quiet.map((n) => [n.id, nodePorts(n).flatMap((p) => (p.next !== null && ids.has(p.next) ? [p.next] : []))]));
  // Tarjan's strongly connected components.
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v)!) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) !== index.get(v)) return;
    const scc: string[] = [];
    let w: string;
    do {
      w = stack.pop()!;
      onStack.delete(w);
      scc.push(w);
    } while (w !== v);
    if (scc.length > 1 || edges.get(v)!.includes(v)) out.push(scc.sort((a, b) => order.get(a)! - order.get(b)!));
  };
  for (const n of quiet) if (!index.has(n.id)) visit(n.id);
  return out.sort((a, b) => order.get(a[0]!)! - order.get(b[0]!)!);
}
