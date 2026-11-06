import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Actions } from "../model/actions.ts";
import { ownerRules, type RuleOwnerRef } from "../model/rules/owner.ts";
import { ruleProblems } from "../model/rules/problems.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.tsx";
import { RuleInspector } from "./rules/RuleInspector.tsx";

/**
 * Every Inspector page (D125): a title and subtitle that stay at the top while the
 * page scrolls, and for things with rules, Details / Rules tabs so the rule list
 * doesn't run into the other fields. The open tab is UI state (`ws.inspectorTab`).
 */
export function InspectorShell(props: { actions: Actions; title: ReactNode; subtitle?: ReactNode; owner?: RuleOwnerRef | null; children: ReactNode }) {
  const { ws, editor } = props.actions;
  const header = (
    <>
      <h3 className="truncate text-[15px] font-semibold">{props.title}</h3>
      {props.subtitle && <p className="text-muted-foreground truncate text-[12px]">{props.subtitle}</p>}
    </>
  );
  // The aside has no top padding: a sticky header is held below the scroll container's
  // padding, so the header carries the top padding itself.
  const sticky = "bg-panel sticky top-0 z-20 -mx-3 mb-2 border-b px-3 pt-3";

  if (!props.owner) {
    return (
      <div className="grid gap-1.5">
        <header className={`${sticky} pb-2`}>{header}</header>
        {props.children}
      </div>
    );
  }

  const own = ownerRules(editor.project, props.owner);
  const count = own?.rules.length ?? 0;
  const invalid = own ? ruleProblems(editor.problems, own).byRule.size > 0 : false;
  return (
    <Tabs value={ws.inspectorTab} onValueChange={(v) => ws.setInspectorTab(v as "details" | "rules")} className="gap-0">
      <header className={`${sticky} pb-0`}>
        {header}
        <TabsList variant="line" className="mt-1.5 h-8 w-full justify-start gap-1 p-0">
          <TabsTrigger value="details" className="flex-none px-2 text-[12px]">
            Details
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex-none px-2 text-[12px]">
            Rules
            <span className="text-muted-foreground tabular-nums">{count}</span>
            {invalid && <CircleAlert className="text-err size-3.5" aria-label="Some rules have problems" />}
          </TabsTrigger>
        </TabsList>
      </header>
      <TabsContent value="details" className="grid gap-1.5">
        {props.children}
      </TabsContent>
      <TabsContent value="rules" className="grid gap-1.5">
        <RuleInspector actions={props.actions} owner={props.owner} />
      </TabsContent>
    </Tabs>
  );
}
