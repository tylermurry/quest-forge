import { useEffect, useMemo, useRef } from "react";
import type { Project } from "@questforge/schema";
import { formatLog, type LogTone } from "../../model/playtest/log.ts";
import type { Playtest } from "../../model/playtest/playtest.ts";
import type { WorkspaceState } from "../../model/workspace.ts";
import { cn } from "../lib/utils.ts";
import { usePlaytest } from "./hooks.ts";

const TONE: Record<LogTone, string> = {
  trigger: "text-foreground font-semibold",
  match: "text-ok",
  skip: "text-warn",
  default: "text-muted-foreground",
  action: "text-foreground",
  scene: "text-primary font-semibold",
  note: "text-muted-foreground italic",
};

/** The event log: lines about a rule jump to it in the rule inspector. */
export function EventLog({ playtest, project, ws }: { playtest: Playtest; project: Project; ws: WorkspaceState }) {
  usePlaytest(playtest);
  const run = playtest.run;
  const count = playtest.events.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `count` is a trigger: playtest.events grows in place, so the log is rebuilt when its length changes
  const lines = useMemo(() => (run ? formatLog(playtest.events, run.project, project) : []), [playtest, run, project, count]);
  const box = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);
  // Follow new lines unless the user scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `lines` is a trigger: scroll to the bottom whenever the log is rebuilt
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div
      ref={box}
      role="log"
      aria-label="Event log"
      className="h-full overflow-auto px-1 py-1 font-mono text-[11.5px] leading-[1.45]"
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
      }}
    >
      {lines.length === 0 && <p className="text-muted-foreground p-1 font-sans text-[12px]">Clicks, rules and actions show up here as you play.</p>}
      {lines.map((l, i) => {
        const cls = cn("block w-full truncate rounded-sm px-1 text-left", l.depth === 1 && "pl-4", TONE[l.tone]);
        return l.jump ? (
          <button
            type="button"
            // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows and a line never moves, so position is its identity
            key={i}
            title={`${l.text} (click to show the rule)`}
            className={cn(cls, "hover:bg-muted hover:underline")}
            onClick={() => ws.jumpTo(l.jump!, "log")}
          >
            {l.text}
          </button>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows and a line never moves, so position is its identity
          <div key={i} title={l.text} className={cls}>
            {l.text}
          </div>
        );
      })}
    </div>
  );
}
