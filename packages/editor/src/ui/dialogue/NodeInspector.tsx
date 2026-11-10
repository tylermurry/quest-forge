import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { DialogueNode, Problem, Project } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { pathWithin } from "../../model/locate.ts";
import {
  NODE_LABEL,
  addOption,
  deleteNodes,
  editActions,
  editConditions,
  moveOption,
  removeOption,
  setLine,
  setOption,
  type ConditionsRef,
} from "../../model/dialogue/commands.ts";
import { invalidKeys, partProblems, problemsByNode } from "../../model/dialogue/problems.ts";
import { actions as actionList, conditions as conditionList } from "../../model/rules/parts.ts";
import { createAndUse, pickerOptions } from "../../model/rules/pickers.ts";
import { Button } from "../components/ui/button.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { useCommands } from "../hooks.ts";
import { InspectorShell } from "../InspectorShell.tsx";
import { cn } from "../lib/utils.ts";
import { ActionRows, AddActionMenu, AddConditionMenu, ConditionRows, PartProblems } from "../rules/PartRows.tsx";
import { Picker } from "../rules/Picker.tsx";
import { TextField } from "../TextField.tsx";
import { flashElement } from "../flash.ts";

const NARRATOR = "";

const HELP: Record<DialogueNode["type"], string> = {
  start: "Every dialogue begins here. A rule starts it with Start dialogue.",
  line: "A line in a text box, in the speaker's color (or the narrator's box).",
  choices: "Options the player picks from. Options whose conditions fail are hidden; a once-only option goes away after it is picked.",
  actions: "Runs these actions in order, then carries on.",
  branch: "If every condition is true, carries on from the true port, else from the false port.",
  end: "Ends the dialogue and runs the Game's “Dialogue ends” rule for it.",
};

/** The right inspector for one dialogue graph node (spec 11): the same pickers and rule parts as spec 10. */
export function NodeInspector({ actions, dialogue, nodeId }: { actions: Actions; dialogue: string; nodeId: string }) {
  const { editor, ws } = actions;
  const registry = useCommands();
  const p = editor.project;
  const doc = p.dialogues.find((d) => d.data.id === dialogue);
  const index = doc?.data.nodes.findIndex((n) => n.id === nodeId) ?? -1;
  const node = doc?.data.nodes[index];
  const root = useRef<HTMLDivElement | null>(null);

  // Jump-to: scroll to and flash the exact option, condition or action (D120).
  const highlight = ws.highlight;
  useEffect(() => {
    if (!highlight || !doc || highlight.location.file !== doc.path || !pathWithin(highlight.location.path, ["nodes", index])) return;
    const rest = highlight.location.path.slice(2);
    const parts = root.current ? [...root.current.querySelectorAll<HTMLElement>("[data-path]")] : [];
    const el = parts.filter((e) => pathWithin(rest, JSON.parse(e.dataset.path!) as (string | number)[])).at(-1) ?? root.current;
    el?.scrollIntoView?.({ block: "nearest" });
    flashElement(el, highlight.tone);
    ws.clearHighlight();
  }, [highlight?.seq]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per jump request (seq); re-running when other values change would flash again

  if (!doc || !node) return null;
  const problems = problemsByNode(editor.problems, doc.path, doc.data).get(node.id) ?? [];
  const key = `${dialogue}/${node.id}`;
  const run = (label: string, f: (q: Project) => Project, field?: string) => editor.apply(label, f, field && `${key}/${field}`);
  const blur = () => editor.history.breakMerge();
  const nodeLevel = problems.filter((x) => x.location.path.length <= 3 && !["text", "character", "animation", "next"].includes(String(x.location.path[2])));

  const conditionsOf = (ref: ConditionsRef, list: Parameters<typeof ConditionRows>[0]["list"], sub: (string | number)[], first?: string) => (
    <ConditionRows
      project={p}
      list={list}
      {...(first && { first })}
      edit={(q, f) => editConditions(q, dialogue, ref, f)}
      run={run}
      blur={blur}
      field={sub.join("/")}
      editLabel="Edit node"
      problems={(i) => partProblems(problems, index, [...sub, i])}
      invalid={(i) => invalidKeys(problems, index, [...sub, i])}
      partKey={(i) => JSON.stringify([...sub, i])}
    />
  );

  return (
    <InspectorShell actions={actions} title={`${NODE_LABEL[node.type]} node`} subtitle={`${doc.data.name} · ${node.id}`}>
      <div ref={root} className="grid gap-3" aria-label={`${NODE_LABEL[node.type]} node`}>
        <p className="text-muted-foreground text-[12px]">{HELP[node.type]}</p>
        <PartProblems problems={nodeLevel} />

        {node.type === "line" && <LineFields actions={actions} dialogue={dialogue} node={node} problems={problems} index={index} run={run} blur={blur} />}

        {node.type === "choices" && (
          <div className="grid gap-2">
            {node.options.length === 0 && <p className="text-muted-foreground text-[12px]">No options yet. The dialogue ends here until you add one.</p>}
            {node.options.map((o, j) => {
              const sub = ["options", j];
              const own = partProblems(problems, index, sub);
              const textProblems = own.filter((x) => x.location.path[4] === "text" || x.location.path[4] === "next");
              return (
                <div key={o.id} className={cn("bg-card grid gap-2 rounded-md border p-2", own.length > 0 && "border-err")} data-path={JSON.stringify(sub)} aria-label={`Option ${j + 1}`}>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Option {j + 1}</span>
                    <span className="flex-1" />
                    <label className="text-muted-foreground flex items-center gap-1.5 text-[12px]" title="Goes away after the player picks it">
                      Once
                      <Switch size="sm" checked={o.once} aria-label={`Option ${j + 1} once`} onCheckedChange={(v) => run(v ? "Make option once-only" : "Let option repeat", (q) => setOption(q, dialogue, node.id, o.id, { once: v }))} />
                    </label>
                    <Button variant="ghost" size="icon" className="size-6" aria-label={`Move option ${j + 1} up`} disabled={j === 0} onClick={() => run("Move option", (q) => moveOption(q, dialogue, node.id, o.id, j - 1))}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6" aria-label={`Move option ${j + 1} down`} disabled={j === node.options.length - 1} onClick={() => run("Move option", (q) => moveOption(q, dialogue, node.id, o.id, j + 1))}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6" aria-label={`Remove option ${j + 1}`} onClick={() => run("Remove option", (q) => removeOption(q, dialogue, node.id, o.id))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <TextField
                    compact
                    label={`Option ${j + 1} text`}
                    placeholder="What the player can say…"
                    value={o.text}
                    valid={() => true}
                    invalid={textProblems.some((x) => x.code === "empty_text")}
                    onChange={(v) => run("Edit option", (q) => setOption(q, dialogue, node.id, o.id, { text: v }), `${o.id}/text`)}
                    onBlur={blur}
                  />
                  {conditionsOf({ node: node.id, option: o.id }, o.if, [...sub, "if"], "Show if")}
                  <div className="flex">
                    <AddConditionMenu label="Show if…" onAdd={(t) => run("Add condition", (q) => editConditions(q, dialogue, { node: node.id, option: o.id }, (l, d) => conditionList.add(d, l, t)))} />
                  </div>
                  <PartProblems problems={textProblems} />
                </div>
              );
            })}
            <div>
              <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => editor.applyWith("Add option", (q) => addOption(q, dialogue, node.id))}>
                <Plus className="size-3.5" /> Option
              </Button>
            </div>
          </div>
        )}

        {node.type === "branch" && (
          <div className="grid gap-1.5" data-path={JSON.stringify(["if"])}>
            {node.if.length === 0 && <p className="text-muted-foreground text-[12px]">No conditions: it always carries on from the true port.</p>}
            {conditionsOf({ node: node.id }, node.if, ["if"])}
            <div className="flex">
              <AddConditionMenu onAdd={(t) => run("Add condition", (q) => editConditions(q, dialogue, { node: node.id }, (l, d) => conditionList.add(d, l, t)))} />
            </div>
          </div>
        )}

        {node.type === "actions" && (
          <div className="grid gap-1.5" data-path={JSON.stringify(["do"])}>
            {node.do.length === 0 && <p className="text-muted-foreground text-[12px]">Nothing yet. Add an action below.</p>}
            <ActionRows
              project={p}
              list={node.do}
              edit={(q, f) => editActions(q, dialogue, node.id, f)}
              run={run}
              blur={blur}
              field="do"
              editLabel="Edit node"
              problems={(i) => partProblems(problems, index, ["do", i])}
              invalid={(i) => invalidKeys(problems, index, ["do", i])}
              partKey={(i) => JSON.stringify(["do", i])}
            />
            <div className="flex">
              <AddActionMenu onAdd={(t) => run("Add action", (q) => editActions(q, dialogue, node.id, (l, d) => actionList.add(d, l, t)))} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-t pt-3">
          <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={!registry.isEnabled("play.node")} onClick={() => registry.run("play.node")}>
            <Play className="size-3.5" /> Play from this node
          </Button>
          {node.type !== "start" && (
            <Button size="sm" variant="ghost" className="text-err h-7 text-[12px]" onClick={() => run(`Delete ${NODE_LABEL[node.type]} node`, (q) => deleteNodes(q, dialogue, [node.id]))}>
              <Trash2 className="size-3.5" /> Delete node
            </Button>
          )}
        </div>
      </div>
    </InspectorShell>
  );
}

function LineFields(props: {
  actions: Actions;
  dialogue: string;
  node: Extract<DialogueNode, { type: "line" }>;
  problems: Problem[];
  index: number;
  run(label: string, f: (q: Project) => Project, field?: string): void;
  blur(): void;
}) {
  const { actions, dialogue, node, problems, index, run, blur } = props;
  const p = actions.editor.project;
  const bad = invalidKeys(problems, index, []);
  const fieldProblems = problems.filter((x) => ["character", "text", "animation"].includes(String(x.location.path[2])));
  const speakers = [{ id: NARRATOR, label: "Narrator" }, ...pickerOptions(p, "character")];
  const set = (patch: Parameters<typeof setLine>[3]) => (q: Project) => setLine(q, dialogue, node.id, patch);
  return (
    <div className="grid gap-2">
      <div className="grid gap-1" data-path={JSON.stringify(["character"])}>
        <span className="text-muted-foreground text-[12px]">Speaker</span>
        <Picker
          label="Speaker"
          value={node.character ?? NARRATOR}
          options={speakers}
          invalid={bad.has("character")}
          onPick={(id) => run("Change speaker", set({ character: id === NARRATOR ? null : id }))}
          createNoun="character"
          onCreate={(name) => run("Create character and use it", (q) => createAndUse(q, "character", name, (r, id) => set({ character: id })(r)))}
        />
      </div>
      <div data-path={JSON.stringify(["text"])}>
        <TextField label="Line" multiline value={node.text} valid={() => true} invalid={bad.has("text")} onChange={(v) => run("Edit line", set({ text: v }), "text")} onBlur={blur} />
      </div>
      {node.character !== undefined && (
        <div className="grid gap-1" data-path={JSON.stringify(["animation"])}>
          <span className="text-muted-foreground text-[12px]">Animation while speaking</span>
          <Picker
            label="Animation"
            value={node.animation ?? ""}
            placeholder="None"
            options={[{ id: "", label: "None" }, ...pickerOptions(p, "slot", node.character)]}
            invalid={bad.has("animation")}
            onPick={(id) => run("Change animation", set({ animation: id === "" ? null : id }))}
          />
        </div>
      )}
      <PartProblems problems={fieldProblems} />
    </div>
  );
}
