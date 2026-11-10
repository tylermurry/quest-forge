import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AnyRule, Problem, Project } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { addAction, addCondition, deleteRule, duplicateRule, editRuleList, setOnce, setTriggerField, setTriggerType } from "../../model/rules/commands.ts";
import { ownerKey, ownerTriggers, type OwnerRules, type RuleOwnerRef, type TriggerType } from "../../model/rules/owner.ts";
import { createAndUse } from "../../model/rules/pickers.ts";
import { pointPickScene } from "../../model/rules/pointPick.ts";
import { locateInRules, partKey, type RulePart, type RuleProblems } from "../../model/rules/problems.ts";
import { TRIGGER_LABEL, TRIGGER_PARTS, type PickKind } from "../../model/rules/vocab.ts";
import { Button } from "../components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { cn } from "../lib/utils.ts";
import { PartFields, type PartHandlers } from "./PartFields.tsx";
import { ActionRows, AddActionMenu, AddConditionMenu, ConditionRows, PartProblems } from "./PartRows.tsx";
import { flashElement } from "../flash.ts";

/** The data keys a problem names inside one part, e.g. `item` or `target`. */
function invalidKeys(problems: readonly Problem[] | undefined, own: OwnerRules): Set<string> {
  const keys = new Set<string>();
  for (const p of problems ?? []) {
    const rest = p.location.path.slice(own.path.length);
    const key = rest[1] === "when" ? rest[2] : rest[3];
    if (typeof key === "string") keys.add(key);
  }
  return keys;
}

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

export interface RuleCardProps {
  actions: Actions;
  owner: RuleOwnerRef;
  own: OwnerRules;
  rule: AnyRule;
  index: number;
  problems: RuleProblems;
}

/** One rule as a sentence of dropdowns, pickers and text. */
export function RuleCard({ actions, owner, own, rule, index, problems }: RuleCardProps) {
  const { editor, ws } = actions;
  const p: Project = editor.project;
  const ok = ownerKey(owner);
  const sortable = useSortable({ id: `${ok}/${rule.id}`, data: { kind: "ruleCard", owner: ok, ruleId: rule.id } });
  const root = useRef<HTMLLIElement | null>(null);

  const run = (label: string, f: (p: Project) => Project, field?: string) => editor.apply(label, f, field && `${ok}/${rule.id}/${field}`);
  const blur = () => editor.history.breakMerge();
  const part = (pt: RulePart) => problems.byPart.get(partKey(rule.id, pt));

  // Jump-to: scroll to and flash the exact part.
  const highlight = ws.highlight;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per jump request (seq); re-running when the rule changes would flash again
  useEffect(() => {
    if (!highlight) return;
    const where = locateInRules(highlight.location, own);
    if (where?.ruleId !== rule.id) return;
    const sel = where.part ? `[data-part="${partKey(rule.id, where.part)}"]` : null;
    const el = (sel && root.current?.querySelector<HTMLElement>(sel)) || root.current;
    el?.scrollIntoView?.({ block: "nearest" });
    flashElement(el, highlight.tone);
    ws.clearHighlight();
  }, [highlight?.seq]);

  const handlers = (
    where: "when" | `if/${number}` | `do/${number}`,
    apply: (patch: Record<string, unknown>) => (p: Project) => Project,
  ): Omit<PartHandlers, "animTarget"> => ({
    patch: (patch, field) => run("Edit rule", apply(patch), field && `${where}/${field}`),
    blur,
    create: (pick: PickKind, name: string, key: string) =>
      run(`Create ${pick} and use it`, (q) => createAndUse(q, pick, name, (r, id) => apply({ [key]: id })(r))),
  });

  // "Pick on canvas" for an action's point.
  const activeScene = ws.active?.startsWith("scene:") ? ws.active.slice("scene:".length) : null;
  const pickHandlers = (i: number): Pick<PartHandlers, "pickPoint" | "picking" | "pickDisabled"> => {
    const scene = pointPickScene(owner, rule.do[i]!, activeScene);
    const pk = ws.pointPick;
    const picking = !!pk && ownerKey(pk.owner) === ok && pk.ruleId === rule.id && pk.index === i;
    if (!scene) return { pickDisabled: "Open a scene tab to pick a point on it" };
    return { picking, pickPoint: () => (picking ? ws.endPointPick() : ws.startPointPick({ owner, ruleId: rule.id, index: i, scene })) };
  };

  const triggers = ownerTriggers(owner);
  const ruleProblems = problems.byRule.get(rule.id);
  const style = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition };

  return (
    <li
      ref={(el) => {
        sortable.setNodeRef(el);
        root.current = el;
      }}
      style={style}
      className={cn("bg-card grid gap-2 rounded-md border p-2", ruleProblems?.length && "border-err", sortable.isDragging && "z-10 opacity-80 shadow-lg")}
      aria-label={`Rule ${index + 1}`}
    >
      <div className="flex items-center gap-1">
        <button
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
          aria-label={`Drag rule ${index + 1}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Rule {index + 1}</span>
        <span className="flex-1" />
        <label className="text-muted-foreground flex items-center gap-1.5 text-[12px]" title="Only ever runs once">
          Once
          <Switch
            size="sm"
            checked={rule.once}
            aria-label="Once"
            onCheckedChange={(v) => run(v ? "Make rule run once" : "Let rule run again", (q) => setOnce(q, owner, rule.id, v))}
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Rule menu">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onPointerDown={stop} onClick={stop}>
            <DropdownMenuItem onSelect={() => editor.applyWith("Duplicate rule", (q) => duplicateRule(q, owner, rule.id))}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => run("Delete rule", (q) => deleteRule(q, owner, rule.id))}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* WHEN */}
      <div className="flex flex-wrap items-center gap-1.5" data-part={partKey(rule.id, { kind: "when" })}>
        <span className="text-[12px] font-semibold">When</span>
        {triggers.length > 1 ? (
          <Select value={rule.when.type} onValueChange={(v) => run("Change trigger", (q) => setTriggerType(q, owner, rule.id, v as TriggerType))}>
            <SelectTrigger size="sm" aria-label="Trigger" className="h-7 w-auto gap-1 px-2 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent onPointerDown={stop}>
              {triggers.map((t) => (
                <SelectItem key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-[13px]">{TRIGGER_LABEL[rule.when.type]}</span>
        )}
        <PartFields
          project={p}
          parts={TRIGGER_PARTS[rule.when.type]}
          value={rule.when as Record<string, unknown>}
          invalidKeys={invalidKeys(part({ kind: "when" }), own)}
          h={{
            ...handlers("when", (patch) => (q) => Object.entries(patch).reduce((r, [k, v]) => setTriggerField(r, owner, rule.id, k, v), q)),
            animTarget: () => {},
          }}
        />
        <PartProblems problems={part({ kind: "when" })} />
      </div>

      {/* IF */}
      <ConditionRows
        project={p}
        list={rule.if}
        edit={(q, f) => editRuleList(q, owner, rule.id, "if", f)}
        run={run}
        blur={blur}
        field="if"
        editLabel="Edit rule"
        problems={(i) => part({ kind: "if", index: i })}
        invalid={(i) => invalidKeys(part({ kind: "if", index: i }), own)}
        partKey={(i) => partKey(rule.id, { kind: "if", index: i })}
      />

      {/* DO */}
      <div className="grid gap-1.5">
        <span className="text-[12px] font-semibold">Do</span>
        {rule.do.length === 0 && <p className="text-muted-foreground pl-2 text-[12px]">Nothing yet. Add an action below.</p>}
        <ActionRows
          project={p}
          list={rule.do}
          edit={(q, f) => editRuleList(q, owner, rule.id, "do", f)}
          run={run}
          blur={blur}
          field="do"
          editLabel="Edit rule"
          problems={(i) => part({ kind: "do", index: i })}
          invalid={(i) => invalidKeys(part({ kind: "do", index: i }), own)}
          partKey={(i) => partKey(rule.id, { kind: "do", index: i })}
          pick={pickHandlers}
        />
      </div>

      <div className="flex gap-1">
        <AddConditionMenu onAdd={(t) => run("Add condition", (q) => addCondition(q, owner, rule.id, t))} />
        <AddActionMenu onAdd={(t) => run("Add action", (q) => addAction(q, owner, rule.id, t))} />
      </div>
    </li>
  );
}
