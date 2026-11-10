import { CircleX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { Actions } from "../model/actions.ts";
import { locate } from "../model/locate.ts";
import { ALL_SEVERITIES, problemCounts, visibleProblems, type SeverityFilter } from "../model/problemList.ts";
import { cn } from "./lib/utils.ts";

function FilterToggle(props: { label: string; count: number; on: boolean; onToggle(): void; icon: typeof CircleX; tone: string }) {
  const Icon = props.icon;
  return (
    <button
      aria-pressed={props.on}
      aria-label={`Show ${props.label.toLowerCase()}`}
      onClick={props.onToggle}
      className={cn("flex h-6 items-center gap-1 rounded-sm border px-2 text-[12px]", props.on ? "bg-muted" : "text-muted-foreground opacity-70")}
    >
      <Icon className={cn("size-3.5", props.on && props.tone)} />
      {props.count} {props.label.toLowerCase()}
    </button>
  );
}

/** Bottom dock: the Problems panel. The game plays in the playtest area. */
export function Dock({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const [filter, setFilter] = useState<SeverityFilter>(ALL_SEVERITIES);
  const problems = editor.problems;
  const counts = problemCounts(problems);
  const shown = visibleProblems(problems, filter);
  return (
    <section aria-label="Problems panel" className="flex h-full min-h-0 flex-col">
      <h2 className="flex h-8 shrink-0 items-center border-b px-3 text-[12px] font-medium">Problems ({problems.length})</h2>
      <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
        {problems.length === 0 && <p className="text-ok px-2 py-1">No problems.</p>}
        {problems.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1" role="group" aria-label="Severity filter">
              <FilterToggle
                label="Errors"
                count={counts.error}
                on={filter.error}
                icon={CircleX}
                tone="text-err"
                onToggle={() => setFilter({ ...filter, error: !filter.error })}
              />
              <FilterToggle
                label="Warnings"
                count={counts.warning}
                on={filter.warning}
                icon={TriangleAlert}
                tone="text-warn"
                onToggle={() => setFilter({ ...filter, warning: !filter.warning })}
              />
              <span className="text-muted-foreground text-[12px]">
                {counts.error > 0 ? "Errors block playtest and export." : "Nothing blocks playtest."} Click one to jump to it.
              </span>
            </div>
            {shown.length === 0 && <p className="text-muted-foreground px-2 py-1 text-[12px]">All problems are filtered out.</p>}
            <ul aria-label="Problems">
              {shown.map((pr, i) => {
                const target = locate(editor.project, pr.location);
                const Icon = pr.severity === "error" ? CircleX : TriangleAlert;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: problems are re-derived from the project on every render and have no identity or state of their own, so position is the key
                  <li key={i}>
                    <button
                      className={cn(
                        "hover:bg-muted flex w-full items-start gap-2 rounded-sm px-2 py-1 text-left disabled:opacity-60",
                        pr.severity === "error" ? "text-err" : "text-warn",
                      )}
                      disabled={!target}
                      onClick={() => target && ws.jumpTo(target)}
                    >
                      <Icon className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        <span className="font-semibold">{pr.breadcrumb}</span>: {pr.message}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
