import { CircleX, TriangleAlert } from "lucide-react";
import { formatProblem } from "@questforge/schema";
import type { Actions } from "../model/actions.ts";
import { locate } from "../model/locate.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.tsx";
import { cn } from "./lib/utils.ts";

/** Bottom dock (D89): a read-only Problems list with jump-to; Playtest arrives in M6. */
export function Dock({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const problems = editor.problems;
  const errors = problems.filter((p) => p.severity === "error").length;
  return (
    <Tabs defaultValue="problems" className="flex h-full min-h-0 flex-col gap-0">
      <TabsList className="h-8 shrink-0 rounded-none border-b bg-transparent px-1">
        <TabsTrigger value="problems" className="h-6 flex-none px-2 text-[12px]">
          Problems ({problems.length})
        </TabsTrigger>
        <TabsTrigger value="playtest" className="h-6 flex-none px-2 text-[12px]">
          Playtest
        </TabsTrigger>
      </TabsList>
      <TabsContent value="playtest" className="text-muted-foreground p-3">
        Playtest arrives in M6.
      </TabsContent>
      <TabsContent value="problems" className="min-h-0 overflow-auto px-1 py-1">
        {problems.length === 0 && <p className="text-ok px-2 py-1">No problems.</p>}
        {problems.length > 0 && (
          <>
            <p className="text-muted-foreground px-2 py-1 text-[12px]">
              {errors} error{errors === 1 ? "" : "s"} block playtest and export. Click one to jump to it.
            </p>
            <ul aria-label="Problems">
              {problems.map((pr, i) => {
                const target = locate(editor.project, pr.location);
                const Icon = pr.severity === "error" ? CircleX : TriangleAlert;
                return (
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
                      <span>{formatProblem(pr)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
