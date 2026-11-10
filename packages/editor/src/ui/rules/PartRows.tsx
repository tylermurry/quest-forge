import { ArrowDown, ArrowUp, CircleAlert, Plus, X } from "lucide-react";
import type { Action, Condition, Problem, Project } from "@questforge/schema";
import type { RuleDefaults } from "../../model/rules/defaults.ts";
import { actions, conditions, type AnimTarget } from "../../model/rules/parts.ts";
import { createAndUse } from "../../model/rules/pickers.ts";
import {
  ACTION_GROUPS,
  ACTION_LABEL,
  ACTION_PARTS,
  CONDITION_LABEL,
  CONDITION_ORDER,
  CONDITION_PARTS,
  type ActionType,
  type ConditionType,
  type PickKind,
} from "../../model/rules/vocab.ts";
import { Button } from "../components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { PartFields, type PartHandlers } from "./PartFields.tsx";

// Condition and action rows, shared by rule cards and the dialogue node
// inspector. Each row edits its list through `edit`, one undo step per change.

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

export function PartProblems({ problems }: { problems: readonly Problem[] | undefined }) {
  if (!problems?.length) return null;
  return (
    <ul className="grid w-full gap-0.5 text-[12px]" aria-label="Problems with this part">
      {problems.map((p, i) => (
        <li key={i} className={p.severity === "error" ? "text-err flex gap-1" : "text-warn flex gap-1"}>
          <CircleAlert className="mt-0.5 size-3 shrink-0" />
          {p.message}
        </li>
      ))}
    </ul>
  );
}

export interface PartListProps<T> {
  project: Project;
  list: readonly T[];
  /** Applies a list edit to the project (pure). */
  edit(p: Project, f: (list: T[], d: RuleDefaults) => T[]): Project;
  /** Runs a change as one undo step; `field` merges typing into one step. */
  run(label: string, f: (p: Project) => Project, field?: string): void;
  blur(): void;
  problems(i: number): readonly Problem[] | undefined;
  invalid(i: number): ReadonlySet<string>;
  /** `data-part` of row i, for jump-to. */
  partKey(i: number): string;
  /** Prefix of typing merge keys, e.g. `if`. */
  field: string;
  /** Undo label of a field edit, e.g. "Edit rule". */
  editLabel: string;
}

function handlers<T>(
  props: PartListProps<T>,
  i: number,
  set: (list: T[], d: RuleDefaults, patch: Record<string, unknown>) => T[],
): Omit<PartHandlers, "animTarget"> {
  const { run, edit, blur, field } = props;
  return {
    patch: (patch, f) => run(props.editLabel, (q) => edit(q, (l, d) => set(l, d, patch)), f && `${field}/${i}/${f}`),
    blur,
    create: (pick: PickKind, name: string, key: string) =>
      run(`Create ${pick} and use it`, (q) => createAndUse(q, pick, name, (r, id) => edit(r, (l, d) => set(l, d, { [key]: id })))),
  };
}

/** `If [Player has ▾] [Coin ▾]  and …` rows. */
export function ConditionRows(props: PartListProps<Condition> & { first?: string }) {
  const { project, list, run, edit } = props;
  return (
    <>
      {list.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 pl-2" data-part={props.partKey(i)}>
          <span className="text-[12px] font-semibold">{i === 0 ? (props.first ?? "If") : "and"}</span>
          <Select value={c.type} onValueChange={(v) => run("Change condition", (q) => edit(q, (l, d) => conditions.setType(d, l, i, v as ConditionType)))}>
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
            project={project}
            parts={CONDITION_PARTS[c.type]}
            value={c as Record<string, unknown>}
            invalidKeys={props.invalid(i)}
            h={{ ...handlers(props, i, (l, d, patch) => conditions.setFields(d, l, i, patch)), animTarget: () => {} }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-6"
            aria-label={`Remove condition ${i + 1}`}
            onClick={() => run("Remove condition", (q) => edit(q, (l) => conditions.remove(l, i)))}
          >
            <X className="size-3.5" />
          </Button>
          <PartProblems problems={props.problems(i)} />
        </div>
      ))}
    </>
  );
}

/** Numbered action rows with move up/down and remove. `pick` adds "Pick on canvas". */
export function ActionRows(props: PartListProps<Action> & { pick?(i: number): Pick<PartHandlers, "pickPoint" | "picking" | "pickDisabled"> }) {
  const { project, list, run, edit } = props;
  return (
    <ol className="grid gap-1.5">
      {list.map((a, i) => (
        <li key={i} className="flex items-start gap-1.5 pl-2" data-part={props.partKey(i)} aria-label={`Action ${i + 1}`}>
          <span className="text-muted-foreground h-7 w-4 text-right text-[12px] leading-7 tabular-nums">{i + 1}.</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Select value={a.type} onValueChange={(v) => run("Change action", (q) => edit(q, (l, d) => actions.setType(d, l, i, v as ActionType)))}>
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
              project={project}
              parts={ACTION_PARTS[a.type]}
              value={a as Record<string, unknown>}
              invalidKeys={props.invalid(i)}
              h={{
                ...handlers(props, i, (l, d, patch) => actions.setFields(d, l, i, patch)),
                animTarget: (t: AnimTarget) => run("Change animation target", (q) => edit(q, (l) => actions.setAnimTarget(q, l, i, t))),
                ...props.pick?.(i),
              }}
            />
            <div className="order-4 basis-full empty:hidden">
              <PartProblems problems={props.problems(i)} />
            </div>
          </div>
          <span className="mt-0.5 flex shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Move action ${i + 1} up`}
              disabled={i === 0}
              onClick={() => run("Move action", (q) => edit(q, (l) => actions.move(l, i, i - 1)))}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Move action ${i + 1} down`}
              disabled={i === list.length - 1}
              onClick={() => run("Move action", (q) => edit(q, (l) => actions.move(l, i, i + 1)))}
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Remove action ${i + 1}`}
              onClick={() => run("Remove action", (q) => edit(q, (l) => actions.remove(l, i)))}
            >
              <X className="size-3.5" />
            </Button>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "+ Condition" menu. */
export function AddConditionMenu({ onAdd, label = "Condition" }: { onAdd(type: ConditionType): void; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[12px]">
          <Plus className="size-3" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onPointerDown={stop} onClick={stop}>
        {CONDITION_ORDER.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => onAdd(t)}>
            {CONDITION_LABEL[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "+ Action" menu, grouped by kind. */
export function AddActionMenu({ onAdd }: { onAdd(type: ActionType): void }) {
  return (
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
              <DropdownMenuItem key={t} onSelect={() => onAdd(t)}>
                {ACTION_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
