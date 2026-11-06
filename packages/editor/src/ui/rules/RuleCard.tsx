import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, CircleAlert, Copy, GripVertical, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AnyRule, Problem, Project } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import {
  addAction,
  addCondition,
  deleteRule,
  duplicateRule,
  moveAction,
  removeAction,
  removeCondition,
  setActionFields,
  setActionType,
  setAnimationTarget,
  setConditionFields,
  setConditionType,
  setOnce,
  setTriggerField,
  setTriggerType,
} from "../../model/rules/commands.ts";
import { ownerKey, ownerTriggers, type OwnerRules, type RuleOwnerRef, type TriggerType } from "../../model/rules/owner.ts";
import { createAndUse } from "../../model/rules/pickers.ts";
import { pointPickScene } from "../../model/rules/pointPick.ts";
import { locateInRules, partKey, type RulePart, type RuleProblems } from "../../model/rules/problems.ts";
import {
  ACTION_GROUPS,
  ACTION_LABEL,
  ACTION_PARTS,
  CONDITION_LABEL,
  CONDITION_ORDER,
  CONDITION_PARTS,
  TRIGGER_LABEL,
  TRIGGER_PARTS,
  type ActionType,
  type ConditionType,
  type PickKind,
} from "../../model/rules/vocab.ts";
import { Button } from "../components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { cn } from "../lib/utils.ts";
import { PartFields, type PartHandlers } from "./PartFields.tsx";

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

function PartProblems({ problems }: { problems: readonly Problem[] | undefined }) {
  if (!problems?.length) return null;
  return (
    <ul className="text-err grid w-full gap-0.5 text-[12px]" aria-label="Problems with this part">
      {problems.map((p, i) => (
        <li key={i} className="flex gap-1">
          <CircleAlert className="mt-0.5 size-3 shrink-0" />
          {p.message}
        </li>
      ))}
    </ul>
  );
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

/** One rule as a sentence of dropdowns, pickers and text (spec 10). */
export function RuleCard({ actions, owner, own, rule, index, problems }: RuleCardProps) {
  const { editor, ws } = actions;
  const p: Project = editor.project;
  const ok = ownerKey(owner);
  const sortable = useSortable({ id: `${ok}/${rule.id}`, data: { kind: "ruleCard", owner: ok, ruleId: rule.id } });
  const root = useRef<HTMLLIElement | null>(null);

  const run = (label: string, f: (p: Project) => Project, field?: string) => editor.apply(label, f, field && `${ok}/${rule.id}/${field}`);
  const blur = () => editor.history.breakMerge();
  const part = (pt: RulePart) => problems.byPart.get(partKey(rule.id, pt));

  // Jump-to: scroll to and flash the exact part (D120).
  const highlight = ws.highlight;
  useEffect(() => {
    if (!highlight) return;
    const where = locateInRules(highlight.location, own);
    if (where?.ruleId !== rule.id) return;
    const sel = where.part ? `[data-part="${partKey(rule.id, where.part)}"]` : null;
    const el = (sel && root.current?.querySelector<HTMLElement>(sel)) || root.current;
    el?.scrollIntoView?.({ block: "nearest" });
    el?.classList.remove("qf-flash");
    void el?.offsetWidth;
    el?.classList.add("qf-flash");
    ws.clearHighlight();
  }, [highlight?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlers = (where: "when" | `if/${number}` | `do/${number}`, apply: (patch: Record<string, unknown>) => (p: Project) => Project): Omit<PartHandlers, "animTarget"> => ({
    patch: (patch, field) => run("Edit rule", apply(patch), field && `${where}/${field}`),
    blur,
    create: (pick: PickKind, name: string, key: string) => run(`Create ${pick} and use it`, (q) => createAndUse(q, pick, name, (r, id) => apply({ [key]: id })(r))),
  });

  // "Pick on canvas" for an action's point (D124).
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
        <button className="text-muted-foreground hover:text-foreground cursor-grab touch-none" aria-label={`Drag rule ${index + 1}`} {...sortable.attributes} {...sortable.listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">Rule {index + 1}</span>
        <span className="flex-1" />
        <label className="text-muted-foreground flex items-center gap-1.5 text-[12px]" title="Only ever runs once">
          Once
          <Switch size="sm" checked={rule.once} aria-label="Once" onCheckedChange={(v) => run(v ? "Make rule run once" : "Let rule run again", (q) => setOnce(q, owner, rule.id, v))} />
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
      {rule.if.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 pl-2" data-part={partKey(rule.id, { kind: "if", index: i })}>
          <span className="text-[12px] font-semibold">{i === 0 ? "If" : "and"}</span>
          <Select value={c.type} onValueChange={(v) => run("Change condition", (q) => setConditionType(q, owner, rule.id, i, v as ConditionType))}>
            <SelectTrigger size="sm" aria-label={`Condition ${i + 1}`} className="h-7 w-auto gap-1 px-2 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent onPointerDown={stop}>
              {CONDITION_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {CONDITION_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PartFields
            project={p}
            parts={CONDITION_PARTS[c.type]}
            value={c as Record<string, unknown>}
            invalidKeys={invalidKeys(part({ kind: "if", index: i }), own)}
            h={{ ...handlers(`if/${i}`, (patch) => (q) => setConditionFields(q, owner, rule.id, i, patch)), animTarget: () => {} }}
          />
          <Button variant="ghost" size="icon" className="ml-auto size-6" aria-label={`Remove condition ${i + 1}`} onClick={() => run("Remove condition", (q) => removeCondition(q, owner, rule.id, i))}>
            <X className="size-3.5" />
          </Button>
          <PartProblems problems={part({ kind: "if", index: i })} />
        </div>
      ))}

      {/* DO */}
      <div className="grid gap-1.5">
        <span className="text-[12px] font-semibold">Do</span>
        {rule.do.length === 0 && <p className="text-muted-foreground pl-2 text-[12px]">Nothing yet. Add an action below.</p>}
        <ol className="grid gap-1.5">
          {rule.do.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 pl-2" data-part={partKey(rule.id, { kind: "do", index: i })} aria-label={`Action ${i + 1}`}>
              <span className="text-muted-foreground w-4 text-right text-[12px] tabular-nums">{i + 1}.</span>
              <Select value={a.type} onValueChange={(v) => run("Change action", (q) => setActionType(q, owner, rule.id, i, v as ActionType))}>
                <SelectTrigger size="sm" aria-label={`Action ${i + 1} type`} className="h-7 w-auto gap-1 px-2 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent onPointerDown={stop}>
                  {ACTION_GROUPS.map((g) => (
                    <SelectGroup key={g.title}>
                      <SelectLabel>{g.title}</SelectLabel>
                      {g.types.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ACTION_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <PartFields
                project={p}
                parts={ACTION_PARTS[a.type]}
                value={a as Record<string, unknown>}
                invalidKeys={invalidKeys(part({ kind: "do", index: i }), own)}
                h={{
                  ...handlers(`do/${i}`, (patch) => (q) => setActionFields(q, owner, rule.id, i, patch)),
                  animTarget: (t) => run("Change animation target", (q) => setAnimationTarget(q, owner, rule.id, i, t)),
                  ...pickHandlers(i),
                }}
              />
              <span className="ml-auto flex">
                <Button variant="ghost" size="icon" className="size-6" aria-label={`Move action ${i + 1} up`} disabled={i === 0} onClick={() => run("Move action", (q) => moveAction(q, owner, rule.id, i, i - 1))}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6" aria-label={`Move action ${i + 1} down`} disabled={i === rule.do.length - 1} onClick={() => run("Move action", (q) => moveAction(q, owner, rule.id, i, i + 1))}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6" aria-label={`Remove action ${i + 1}`} onClick={() => run("Remove action", (q) => removeAction(q, owner, rule.id, i))}>
                  <X className="size-3.5" />
                </Button>
              </span>
              <PartProblems problems={part({ kind: "do", index: i })} />
            </li>
          ))}
        </ol>
      </div>

      <div className="flex gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[12px]">
              <Plus className="size-3" /> Condition
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onPointerDown={stop} onClick={stop}>
            {CONDITION_ORDER.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => run("Add condition", (q) => addCondition(q, owner, rule.id, t))}>
                {CONDITION_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[12px]">
              <Plus className="size-3" /> Action
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-auto" onPointerDown={stop} onClick={stop}>
            {ACTION_GROUPS.map((g, gi) => (
              <div key={g.title}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-muted-foreground text-[11px]">{g.title}</DropdownMenuLabel>
                {g.types.map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => run("Add action", (q) => addAction(q, owner, rule.id, t))}>
                    {ACTION_LABEL[t]}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
