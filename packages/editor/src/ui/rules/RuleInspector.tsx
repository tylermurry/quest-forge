import { useDndMonitor } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { Actions } from "../../model/actions.ts";
import { addRule, moveRule } from "../../model/rules/commands.ts";
import { ownerKey, ownerRules, type RuleOwnerRef } from "../../model/rules/owner.ts";
import { ruleProblems } from "../../model/rules/problems.ts";
import { QUICK_LABEL, QUICK_VERBS, hasQuickFields, quickField, setQuickText } from "../../model/rules/quick.ts";
import { Button } from "../components/ui/button.tsx";
import { TextField } from "../TextField.tsx";
import { RuleCard } from "./RuleCard.tsx";

const DT = "text-muted-foreground mt-3 text-[11px] font-semibold tracking-wider uppercase";

/** Look / Hand / Talk text: each keeps one plain rule. */
function QuickFields({ actions, owner }: { actions: Actions; owner: RuleOwnerRef }) {
  const { editor, ws } = actions;
  const own = ownerRules(editor.project, owner);
  if (!own) return null;
  const ok = ownerKey(owner);
  return (
    <section className="grid gap-2" aria-label="Quick fields">
      <h4 className={DT}>Quick text</h4>
      {QUICK_VERBS.map((verb) => {
        const q = quickField(own.rules, verb);
        if (q.state === "custom") {
          const i = own.rules.findIndex((r) => r.id === q.ruleId);
          return (
            <div key={verb} className="grid gap-1">
              <span className="text-muted-foreground text-[12px]">{QUICK_LABEL[verb]}</span>
              <button
                type="button"
                className="text-primary w-fit cursor-pointer text-left text-[13px] underline-offset-2 hover:underline"
                onClick={() => ws.flash({ file: own.file, path: [...own.path, i] })}
              >
                Set by rule {q.number}
              </button>
            </div>
          );
        }
        return (
          <TextField
            key={verb}
            multiline
            label={QUICK_LABEL[verb]}
            placeholder={
              verb === "look" ? "What the player sees…" : verb === "hand" ? "What happens when they touch it…" : "What happens when they talk to it…"
            }
            value={q.state === "plain" ? q.text : ""}
            valid={() => true}
            onChange={(v) => editor.apply(`Edit ${verb} text`, (p) => setQuickText(p, owner, verb, v), `${ok}/quick/${verb}`)}
            onBlur={() => editor.history.breakMerge()}
          />
        );
      })}
    </section>
  );
}

/**
 * The rule list for a hotspot, object, placed character, region, scene or the game
 *: quick fields first where there are verbs, then cards that read like
 * sentences, dragged to reorder (first match wins).
 */
export function RuleInspector({ actions, owner }: { actions: Actions; owner: RuleOwnerRef }) {
  const { editor } = actions;
  const own = ownerRules(editor.project, owner);
  const ok = ownerKey(owner);

  useDndMonitor({
    onDragEnd({ active, over }) {
      const a = active.data.current as { kind?: string; owner?: string; ruleId?: string } | undefined;
      const o = over?.data.current as { kind?: string; owner?: string; ruleId?: string } | undefined;
      if (a?.kind !== "ruleCard" || a.owner !== ok || o?.kind !== "ruleCard" || o.owner !== ok || a.ruleId === o.ruleId) return;
      const to = own?.rules.findIndex((r) => r.id === o.ruleId) ?? -1;
      if (to >= 0) editor.apply("Reorder rules", (p) => moveRule(p, owner, a.ruleId!, to));
    },
  });

  if (!own) return null;
  const problems = ruleProblems(editor.problems, own);
  return (
    <>
      {hasQuickFields(owner) && <QuickFields actions={actions} owner={owner} />}
      <section className="grid gap-2" aria-label="Rules">
        <h4 className={DT}>Rules</h4>
        {own.rules.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">No rules yet.{hasQuickFields(owner) ? " Type a quick text above, or add a rule." : ""}</p>
        ) : (
          <p className="text-muted-foreground text-[12px]">Checked top to bottom: the first rule that matches runs.</p>
        )}
        <SortableContext items={own.rules.map((r) => `${ok}/${r.id}`)} strategy={verticalListSortingStrategy}>
          <ol className="grid gap-2" aria-label="Rule list">
            {own.rules.map((r, i) => (
              <RuleCard key={r.id} actions={actions} owner={owner} own={own} rule={r} index={i} problems={problems} />
            ))}
          </ol>
        </SortableContext>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => editor.applyWith("Add rule", (p) => addRule(p, owner))}>
          <Plus className="size-3.5" /> Add rule
        </Button>
      </section>
    </>
  );
}
