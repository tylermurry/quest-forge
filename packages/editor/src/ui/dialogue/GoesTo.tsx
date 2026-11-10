import { nodePorts, type DialogueFile, type DialogueNode, type Project } from "@questforge/schema";
import type { Editor } from "../../model/editor.ts";
import { CREATE_TYPES, NODE_LABEL, addNode, connect, type NodeType } from "../../model/dialogue/commands.ts";
import type { PickOption } from "../../model/rules/pickers.ts";
import { Picker } from "../rules/Picker.tsx";

const NOTHING = "";
const NEW = "new:";
const clip = (t: string, n = 30) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** How the picker names a node: its type and ID, with a line's text to tell look-alikes apart. */
function nodeLabel(n: DialogueNode): string {
  const text = n.type === "line" && n.text !== "" ? ` “${clip(n.text)}”` : "";
  return `${NODE_LABEL[n.type]} ${n.id}${text}`;
}

/** What a port is called here, matching its handle on the node card (true / false / the option's text). */
function portLabel(n: DialogueNode, port: string): string {
  if (port === "then") return "If true";
  if (port === "else") return "If false";
  if (n.type === "choices" && port.startsWith("option:")) {
    const j = n.options.findIndex((o) => `option:${o.id}` === port);
    const o = n.options[j];
    return o ? `Option ${j + 1}${o.text === "" ? "" : `: ${clip(o.text)}`}` : port;
  }
  return "Next";
}

/**
 * The keyboard route to wiring the graph: one "Goes to" picker per output port of a node.
 * Pick another node to connect or change the port, "Nothing" to clear it, or a new node
 * of some type, placed to the right of this one and connected in the same step.
 */
export function GoesTo({ editor, dialogue, doc, node }: { editor: Editor; dialogue: string; doc: DialogueFile; node: DialogueNode }) {
  const ports = nodePorts(node);
  if (ports.length === 0) return null;
  const targets: PickOption[] = doc.nodes.filter((n) => n.id !== node.id && n.type !== "start").map((n) => ({ id: n.id, label: nodeLabel(n) }));
  const options: PickOption[] = [
    { id: NOTHING, label: "Nothing" },
    ...targets,
    ...CREATE_TYPES.map((t): PickOption => ({ id: `${NEW}${t}`, label: `New ${NODE_LABEL[t].toLowerCase()} node` })),
  ];

  const pick = (port: string, row: number, id: string) => {
    if (id.startsWith(NEW)) {
      const type = id.slice(NEW.length) as NodeType;
      const pos: [number, number] = [node.pos[0] + 300, node.pos[1] + row * 140];
      editor.applyWith(`Add ${NODE_LABEL[type]} node`, (p: Project) => addNode(p, dialogue, type, pos, { node: node.id, port }));
    } else editor.apply(id === NOTHING ? "Disconnect" : "Connect", (p) => connect(p, dialogue, node.id, port, id === NOTHING ? null : id));
  };

  return (
    <div className="grid gap-2 border-t pt-3" role="group" aria-label="Goes to">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Goes to</span>
      {ports.map((port, row) => {
        const label = portLabel(node, port.port);
        return (
          <div key={port.port} className="grid gap-1" data-path={JSON.stringify(port.path)}>
            <span className="text-muted-foreground text-[12px]">{label}</span>
            <Picker label={`${label} goes to`} value={port.next ?? NOTHING} options={options} onPick={(id) => pick(port.port, row, id)} />
          </div>
        );
      })}
    </div>
  );
}
