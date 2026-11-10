import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { DialogueNode, Problem, Project } from "@questforge/schema";
import { NODE_LABEL } from "../../model/dialogue/commands.ts";
import { actionText, conditionText } from "../../model/playtest/log.ts";
import { cn } from "../lib/utils.ts";

// One node on the dialogue graph (spec 11): a summary card with an input on the left
// and one output port per way on (D62 positions; editing happens in the Inspector).

interface NodeCardData extends Record<string, unknown> {
  node: DialogueNode;
  project: Project;
  problems: readonly Problem[];
  /** Briefly outlined after a jump-to (D120). */
  flash: number;
  /** The flash came from the playtest log, so it is blue. */
  flashLog?: boolean;
}
export type FlowNode = Node<NodeCardData, "dialogue">;

const ACCENT: Record<DialogueNode["type"], string> = {
  start: "bg-emerald-600",
  line: "bg-sky-600",
  choices: "bg-violet-600",
  actions: "bg-amber-600",
  branch: "bg-fuchsia-700",
  end: "bg-zinc-600",
};

const portClass = "!size-3 !border-2 !border-background !bg-muted-foreground hover:!bg-foreground";

function Port({ id, label, empty }: { id: string; label?: string; empty: boolean }) {
  return (
    <div className="relative flex min-h-6 items-center justify-end pr-2 text-[11px]">
      {label && <span className={cn("truncate", empty ? "text-warn" : "text-muted-foreground")}>{label}</span>}
      <Handle type="source" position={Position.Right} id={id} className={cn(portClass, empty && "!bg-warn")} aria-label={label ? `${label} port` : "Output port"} />
    </div>
  );
}

const clip = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node: n, project: p, problems } = data;
  const errors = problems.filter((x) => x.severity === "error");
  const warnings = problems.filter((x) => x.severity === "warning");
  const unreachable = warnings.some((w) => w.code === "dialogue_node_unreachable");
  const speaker = n.type === "line" && n.character !== undefined ? p.characters.find((c) => c.data.id === n.character)?.data : undefined;
  return (
    <div
      key={data.flash}
      className={cn(
        "bg-card text-card-foreground w-60 rounded-md border text-[12px] shadow-sm",
        selected && "ring-ring ring-2",
        errors.length > 0 && "border-err",
        unreachable && "border-dashed opacity-70",
        data.flash > 0 && (data.flashLog ? "qf-flash-log" : "qf-flash"),
      )}
      aria-label={`${NODE_LABEL[n.type]} node ${n.id}`}
      data-node={n.id}
    >
      {n.type !== "start" && <Handle type="target" position={Position.Left} className={portClass} aria-label="Input" />}
      <div className="flex items-center gap-1.5 rounded-t-md border-b px-2 py-1">
        <span className={cn("size-2 rounded-full", ACCENT[n.type])} />
        <span className="font-semibold">{NODE_LABEL[n.type]}</span>
        <span className="text-muted-foreground truncate font-mono text-[10px]">{n.id}</span>
        <span className="flex-1" />
        {errors.length > 0 && <CircleAlert className="text-err size-3.5" aria-label={`${errors.length} errors`} />}
        {errors.length === 0 && warnings.length > 0 && <TriangleAlert className="text-warn size-3.5" aria-label={`${warnings.length} warnings`} />}
      </div>

      {n.type === "start" && <Port id="next" empty={n.next === null} />}

      {n.type === "line" && (
        <>
          <div className="grid gap-0.5 px-2 pt-1">
            <span className="font-semibold" style={speaker ? { color: speaker.textColor } : undefined}>
              {n.character === undefined ? "Narrator" : (speaker?.name ?? `${n.character} (missing)`)}
              {n.animation && <span className="text-muted-foreground ml-1 font-normal">· {n.animation}</span>}
            </span>
            <span className={cn("line-clamp-2", n.text === "" && "text-err italic")}>{n.text === "" ? "Says nothing yet" : `“${clip(n.text, 90)}”`}</span>
          </div>
          <Port id="next" empty={n.next === null} />
        </>
      )}

      {n.type === "choices" && (
        <div className="grid py-1">
          {n.options.length === 0 && <span className="text-warn px-2">No options</span>}
          {n.options.map((o) => (
            <div key={o.id} className="relative border-b border-dashed px-2 py-0.5 last:border-b-0">
              <div className="pr-3">
                <span className={cn(o.text === "" && "text-err italic")}>{o.text === "" ? "No text yet" : clip(o.text)}</span>
                {o.once && <span className="bg-muted text-muted-foreground ml-1 rounded px-1 text-[10px]">once</span>}
              </div>
              {o.if.length > 0 && <div className="text-muted-foreground text-[11px]">if {o.if.map((c) => conditionText(p, c)).join(" and ")}</div>}
              <Handle type="source" position={Position.Right} id={`option:${o.id}`} className={cn(portClass, o.next === null && "!bg-warn")} aria-label={`Option ${o.text || o.id} port`} />
            </div>
          ))}
        </div>
      )}

      {n.type === "actions" && (
        <>
          <ol className="grid gap-0.5 px-2 pt-1">
            {n.do.length === 0 && <li className="text-muted-foreground italic">Nothing yet</li>}
            {n.do.map((a, i) => (
              <li key={i} className="truncate">
                {i + 1}. {clip(actionText(p, a), 48)}
              </li>
            ))}
          </ol>
          <Port id="next" empty={n.next === null} />
        </>
      )}

      {n.type === "branch" && (
        <>
          <div className="px-2 pt-1">{n.if.length === 0 ? <span className="text-muted-foreground italic">Always true</span> : n.if.map((c) => conditionText(p, c)).join(" and ")}</div>
          <Port id="then" label="true" empty={n.then === null} />
          <Port id="else" label="false" empty={n.else === null} />
        </>
      )}

      {n.type === "end" && <div className="text-muted-foreground px-2 py-1">Ends the dialogue</div>}
    </div>
  );
}
