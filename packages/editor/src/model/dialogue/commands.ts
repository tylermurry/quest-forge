// Dialogue graph commands (spec 11): pure Project → Project functions, each run as one
// undo step through Editor.apply (D84). Nodes and options are addressed by their
// stable IDs; positions are whole numbers in the file (D62).
import { nodePorts, optionPort, type Action, type ChoiceOption, type Condition, type DialogueFile, type DialogueNode, type Project } from "@questforge/schema";
import { CommandError, updateDoc } from "../commands.ts";
import { RuleDefaults } from "../rules/defaults.ts";
import type { RuleOwnerRef } from "../rules/owner.ts";
import { dialogueContext } from "./context.ts";
import { autoLayout } from "./layout.ts";

export type NodeType = DialogueNode["type"];
type Pos = [number, number];

/** Node types the "create node" menu offers, in order. Start is made with the dialogue (one per dialogue). */
export const CREATE_TYPES: readonly NodeType[] = ["line", "choices", "actions", "branch", "end"];

export const NODE_LABEL: Record<NodeType, string> = {
  start: "Start",
  line: "Line",
  choices: "Choices",
  actions: "Actions",
  branch: "Branch",
  end: "End",
};

export function dialogueOf(p: Project, id: string): DialogueFile {
  const d = p.dialogues.find((x) => x.data.id === id)?.data;
  if (!d) throw new CommandError("That dialogue is no longer there.");
  return d;
}

const nodeOf = (d: DialogueFile, id: string): DialogueNode => {
  const n = d.nodes.find((x) => x.id === id);
  if (!n) throw new CommandError("That node is no longer there.");
  return n;
};

function update(p: Project, dialogue: string, f: (d: DialogueFile) => DialogueFile): Project {
  dialogueOf(p, dialogue);
  return updateDoc<DialogueFile>(p, "dialogue", dialogue, f);
}

function updateNode(p: Project, dialogue: string, id: string, f: (n: DialogueNode) => DialogueNode): Project {
  return update(p, dialogue, (d) => {
    nodeOf(d, id);
    return { ...d, nodes: d.nodes.map((n) => (n.id === id ? f(n) : n)) };
  });
}

const round = (pos: Pos): Pos => [Math.round(pos[0]), Math.round(pos[1])];

/** Defaults for conditions and actions in a dialogue: its scene context (D142), else game-level. */
export function dialogueDefaults(p: Project, dialogue: string): RuleDefaults {
  const ctx = dialogueContext(p, dialogue);
  const owner: RuleOwnerRef = ctx?.started ? { kind: "scene", scene: ctx.scene } : { kind: "game" };
  return new RuleDefaults(p, owner);
}

/** A free node ID for a type: `line_1`, `line_2`, … */
export function newNodeId(d: DialogueFile, type: NodeType): string {
  const taken = new Set(d.nodes.map((n) => n.id));
  for (let i = 1; ; i++) if (!taken.has(`${type}_${i}`)) return `${type}_${i}`;
}

/** A free option ID, unique in the whole dialogue (validation wants that). */
export function newOptionId(d: DialogueFile): string {
  const taken = new Set(d.nodes.flatMap((n) => (n.type === "choices" ? n.options.map((o) => o.id) : [])));
  for (let i = 1; ; i++) if (!taken.has(`option_${i}`)) return `option_${i}`;
}

/** The speaker a new Line starts with: the line it follows, else the dialogue's character, else the narrator. */
function defaultSpeaker(p: Project, d: DialogueFile, from: string | undefined): string | undefined {
  const prev = from ? d.nodes.find((n) => n.id === from) : undefined;
  if (prev?.type === "line") return prev.character;
  return dialogueContext(p, d.id)?.character;
}

function freshNode(p: Project, d: DialogueFile, type: NodeType, id: string, pos: Pos, from?: string): DialogueNode {
  switch (type) {
    case "start":
      return { id, type, pos, next: null };
    case "line": {
      const character = defaultSpeaker(p, d, from);
      return { id, type, pos, ...(character !== undefined && { character }), text: "", next: null };
    }
    case "choices":
      return { id, type, pos, options: [{ id: newOptionId(d), text: "", if: [], once: false, next: null }] };
    case "actions":
      return { id, type, pos, do: [], next: null };
    case "branch":
      return { id, type, pos, if: [dialogueDefaults(p, d.id).condition("has_item")], then: null, else: null };
    case "end":
      return { id, type, pos };
  }
}

/** Points a port at `target` (null disconnects). Throws if the port isn't there. */
function setPort(n: DialogueNode, port: string, target: string | null): DialogueNode {
  if (!nodePorts(n).some((p) => p.port === port)) throw new CommandError("That connection point is no longer there.");
  if (port === "next" && "next" in n) return { ...n, next: target } as DialogueNode;
  if (n.type === "branch" && (port === "then" || port === "else")) return { ...n, [port]: target };
  if (n.type === "choices") return { ...n, options: n.options.map((o) => (optionPort(o.id) === port ? { ...o, next: target } : o)) };
  throw new CommandError("That connection point is no longer there.");
}

/**
 * Adds a node at `pos`; with `from`, the port it was dragged out of connects to it
 * (the "create node" menu, spec 11). One undo step.
 */
export function addNode(p: Project, dialogue: string, type: NodeType, pos: Pos, from?: { node: string; port: string }): { project: Project; id: string } {
  const d = dialogueOf(p, dialogue);
  if (type === "start" && d.nodes.some((n) => n.type === "start")) throw new CommandError("A dialogue has only one Start node.");
  const id = newNodeId(d, type);
  const node = freshNode(p, d, type, id, round(pos), from?.node);
  const project = update(p, dialogue, (x) => ({
    ...x,
    nodes: [...x.nodes.map((n) => (from && n.id === from.node ? setPort(n, from.port, id) : n)), node],
  }));
  if (from) nodeOf(d, from.node);
  return { project, id };
}

/** Deletes nodes; ports that led to them are left unconnected. The Start node stays (one per dialogue). */
export function deleteNodes(p: Project, dialogue: string, ids: readonly string[]): Project {
  const d = dialogueOf(p, dialogue);
  const gone = new Set(ids.filter((id) => d.nodes.some((n) => n.id === id && n.type !== "start")));
  if (gone.size === 0) throw new CommandError(ids.length ? "The Start node can't be deleted: every dialogue begins there." : "Nothing to delete.");
  return update(p, dialogue, (x) => ({
    ...x,
    nodes: x.nodes.filter((n) => !gone.has(n.id)).map((n) => nodePorts(n).reduce((m, port) => (port.next !== null && gone.has(port.next) ? setPort(m, port.port, null) : m), n)),
  }));
}

/** Moves nodes (a drag of one or many is one step). */
export function moveNodes(p: Project, dialogue: string, moves: readonly { id: string; pos: Pos }[]): Project {
  const at = new Map(moves.map((m) => [m.id, round(m.pos)]));
  return update(p, dialogue, (d) => ({
    ...d,
    nodes: d.nodes.map((n) => {
      const pos = at.get(n.id);
      return pos && (pos[0] !== n.pos[0] || pos[1] !== n.pos[1]) ? { ...n, pos } : n;
    }),
  }));
}

/** Connects a port to a node (replacing what it led to), or disconnects it with null. */
export function connect(p: Project, dialogue: string, node: string, port: string, target: string | null): Project {
  const d = dialogueOf(p, dialogue);
  if (target !== null) {
    const t = nodeOf(d, target);
    if (t.type === "start") throw new CommandError("Nothing can lead into the Start node.");
  }
  return updateNode(p, dialogue, node, (n) => setPort(n, port, target));
}

/** Auto-layout (spec 11): every node gets a new position, as one step. */
export function layoutDialogue(p: Project, dialogue: string): Project {
  const pos = autoLayout(dialogueOf(p, dialogue));
  return moveNodes(p, dialogue, [...pos].map(([id, at]) => ({ id, pos: at })));
}

// ── Line ────────────────────────────────────────────────────────────────────

/**
 * Edits a Line. `character: null` makes the narrator speak, which has no animation
 * (D139); a new speaker drops an animation slot they may not have.
 */
export function setLine(p: Project, dialogue: string, node: string, patch: { character?: string | null; text?: string; animation?: string | null }): Project {
  return updateNode(p, dialogue, node, (n) => {
    if (n.type !== "line") throw new CommandError("That isn't a Line node.");
    const character = patch.character === undefined ? n.character : (patch.character ?? undefined);
    const kept = character === n.character ? n.animation : undefined;
    const animation = character === undefined ? undefined : patch.animation === undefined ? kept : (patch.animation ?? undefined);
    return {
      id: n.id,
      type: n.type,
      pos: n.pos,
      ...(character !== undefined && { character }),
      text: patch.text ?? n.text,
      ...(animation !== undefined && { animation }),
      next: n.next,
    };
  });
}

// ── Choices ─────────────────────────────────────────────────────────────────

function updateOptions(p: Project, dialogue: string, node: string, f: (o: ChoiceOption[]) => ChoiceOption[]): Project {
  return updateNode(p, dialogue, node, (n) => {
    if (n.type !== "choices") throw new CommandError("That isn't a Choices node.");
    return { ...n, options: f(n.options) };
  });
}

const hasOption = (options: readonly ChoiceOption[], id: string) => {
  if (!options.some((o) => o.id === id)) throw new CommandError("That option is no longer there.");
};

export function addOption(p: Project, dialogue: string, node: string): { project: Project; id: string } {
  const id = newOptionId(dialogueOf(p, dialogue));
  return { project: updateOptions(p, dialogue, node, (os) => [...os, { id, text: "", if: [], once: false, next: null }]), id };
}

export function removeOption(p: Project, dialogue: string, node: string, option: string): Project {
  return updateOptions(p, dialogue, node, (os) => {
    hasOption(os, option);
    return os.filter((o) => o.id !== option);
  });
}

/** Options show in order, so they can be moved up and down. */
export function moveOption(p: Project, dialogue: string, node: string, option: string, to: number): Project {
  return updateOptions(p, dialogue, node, (os) => {
    hasOption(os, option);
    const next = os.filter((o) => o.id !== option);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, os.find((o) => o.id === option)!);
    return next;
  });
}

export function setOption(p: Project, dialogue: string, node: string, option: string, patch: { text?: string; once?: boolean }): Project {
  return updateOptions(p, dialogue, node, (os) => {
    hasOption(os, option);
    return os.map((o) => (o.id === option ? { ...o, ...patch } : o));
  });
}

// ── Conditions and actions (shared list edits, rules/parts.ts) ──────────────

/** Where a condition list lives: a Branch, or one option of a Choices node. */
export interface ConditionsRef {
  node: string;
  option?: string;
}

/** Applies a list edit to a Branch's or an option's conditions. */
export function editConditions(p: Project, dialogue: string, ref: ConditionsRef, f: (list: Condition[], d: RuleDefaults) => Condition[]): Project {
  const d = dialogueDefaults(p, dialogue);
  return updateNode(p, dialogue, ref.node, (n) => {
    if (n.type === "branch" && ref.option === undefined) return { ...n, if: f(n.if, d) };
    if (n.type === "choices" && ref.option !== undefined) {
      hasOption(n.options, ref.option);
      return { ...n, options: n.options.map((o) => (o.id === ref.option ? { ...o, if: f(o.if, d) } : o)) };
    }
    throw new CommandError("Those conditions are no longer there.");
  });
}

/** Applies a list edit to an Actions node's actions. */
export function editActions(p: Project, dialogue: string, node: string, f: (list: Action[], d: RuleDefaults) => Action[]): Project {
  const d = dialogueDefaults(p, dialogue);
  return updateNode(p, dialogue, node, (n) => {
    if (n.type !== "actions") throw new CommandError("That isn't an Actions node.");
    return { ...n, do: f(n.do, d) };
  });
}
