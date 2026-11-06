import { X } from "lucide-react";
import type { Project } from "@questforge/schema";
import type { Playtest } from "../../model/playtest/playtest.ts";
import { applyStateEdit, stateView, type StateEdit } from "../../model/playtest/state.ts";
import { Switch } from "../components/ui/switch.tsx";
import { NumberField } from "../NumberField.tsx";
import { Picker } from "../rules/Picker.tsx";
import { usePlaytest } from "./hooks.ts";

function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section aria-label={title} className="border-b px-2 py-1.5 last:border-b-0">
      <h3 className="text-muted-foreground mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
        {title}
        {extra}
      </h3>
      {children}
    </section>
  );
}

/** The live game state beside the game (spec 12, D130). Edits apply at once and are never undone. */
export function StatePanel({ playtest, project, footer }: { playtest: Playtest; project: Project; footer?: React.ReactNode }) {
  usePlaytest(playtest);
  const session = playtest.session;
  if (!session) return <p className="text-muted-foreground p-2 text-[12px]">Loading…</p>;
  const v = stateView(project, session);
  const edit = (e: StateEdit) => {
    applyStateEdit(session, e);
    playtest.changed();
  };
  return (
    <div className="h-full overflow-auto text-[12px]" aria-label="Game state">
      <Section title="Scene">
        <div className="flex items-center gap-1.5">
          <Picker
            label="Go to scene"
            value={v.scene.id}
            options={v.scenes}
            onPick={(scene) => edit({ kind: "goToScene", scene })}
          />
          {!v.canGoToScene && <span className="text-muted-foreground">(waits for the current action)</span>}
        </div>
      </Section>
      <Section title="Inventory">
        <ul className="mb-1 flex flex-wrap gap-1">
          {v.inventory.map((i) => (
            <li key={i.id} className="bg-muted flex items-center gap-1 rounded-sm py-0.5 pr-0.5 pl-1.5">
              {i.label}
              <button aria-label={`Remove ${i.label}`} className="hover:bg-background rounded-sm p-0.5" onClick={() => edit({ kind: "takeItem", item: i.id })}>
                <X className="size-3" />
              </button>
            </li>
          ))}
          {v.inventory.length === 0 && <li className="text-muted-foreground">Empty</li>}
        </ul>
        {v.addable.length > 0 && <Picker label="Add item" placeholder="Add item…" value="" options={v.addable} onPick={(item) => edit({ kind: "giveItem", item })} />}
      </Section>
      {(v.flags.length > 0 || v.counters.length > 0) && (
        <Section title="Flags and counters">
          <ul className="space-y-1">
            {v.flags.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span className="font-mono">{f.id}</span>
                <Switch size="sm" aria-label={f.id} checked={f.value} onCheckedChange={(value) => edit({ kind: "setFlag", flag: f.id, value })} />
              </li>
            ))}
            {v.counters.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="font-mono">{c.id}</span>
                <NumberField compact integer label={c.id} value={c.value} className="w-20" onChange={(value) => edit({ kind: "setCounter", counter: c.id, value })} onBlur={() => {}} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Score" extra={<span className="text-foreground normal-case">{v.score} of {v.maxScore}</span>}>
        {v.awards.length === 0 && <p className="text-muted-foreground">No awards in this game.</p>}
        <ul className="space-y-0.5">
          {v.awards.map((a) => (
            <li key={a.id}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={a.granted} onChange={(e) => edit(e.target.checked ? { kind: "grantAward", award: a.id, points: a.points } : { kind: "revokeAward", award: a.id })} />
                <span className="font-mono">{a.id}</span>
                <span className="text-muted-foreground">+{a.points}</span>
              </label>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Visited scenes">
        <ul className="space-y-0.5">
          {v.visited.map((sc) => (
            <li key={sc.id}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={sc.visited} onChange={(e) => edit({ kind: "setVisited", scene: sc.id, visited: e.target.checked })} />
                {sc.label}
              </label>
            </li>
          ))}
        </ul>
      </Section>
      {footer}
    </div>
  );
}
