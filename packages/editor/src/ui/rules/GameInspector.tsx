import { useEffect, useRef } from "react";
import type { Actions } from "../../model/actions.ts";
import { RESPONSE_LABEL, RESPONSE_VERBS, setDefaultResponse, setMaxScore, setStart } from "../../model/game.ts";
import { pickerOptions } from "../../model/rules/pickers.ts";
import { awardTotal } from "@questforge/schema";
import { NumberField } from "../NumberField.tsx";
import { TextField } from "../TextField.tsx";
import { Picker } from "./Picker.tsx";
import { InspectorShell } from "../InspectorShell.tsx";
import { flashElement } from "../flash.ts";

const DT = "text-muted-foreground mt-3 text-[11px] font-semibold tracking-wider uppercase";

/**
 * The "Game" item (spec 10): where play starts, the max score, the default verb
 * responses and game-level `combine` / `dialogue_end` rules.
 */
export function GameInspector({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const p = editor.project;
  const root = useRef<HTMLDivElement | null>(null);
  const game = p.game;

  // Jump-to a game setting flashes its field; rule spots are handled by their cards (D120).
  const highlight = ws.highlight;
  useEffect(() => {
    if (!highlight || !game || highlight.location.file !== game.path || highlight.location.path[0] === "rules") return;
    const key = String(highlight.location.path[0] ?? "");
    const el = root.current?.querySelector<HTMLElement>(`[data-game="${key}"]`) ?? root.current;
    el?.scrollIntoView?.({ block: "nearest" });
    flashElement(el, highlight.tone);
    ws.clearHighlight();
  }, [highlight?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) return <p className="text-muted-foreground">This project has no game.yaml.</p>;
  const g = game.data;
  const blur = () => editor.history.breakMerge();
  const { total, awards } = awardTotal(p);
  return (
    <div ref={root}>
      <InspectorShell actions={actions} title={g.title} subtitle="Game settings and rules that work anywhere" owner={{ kind: "game" }}>

          <section className="grid gap-1.5" aria-label="Start" data-game="startScene">
            <h4 className={DT}>Start</h4>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-[12px]">Play starts in</span>
              <Picker label="Start scene" value={g.startScene} options={pickerOptions(p, "scene")} onPick={(id) => editor.apply("Change start scene", (q) => setStart(q, id))} />
              <span className="text-muted-foreground text-[12px]">at</span>
              <Picker label="Start spawn" value={g.startSpawn} options={pickerOptions(p, "spawn", g.startScene)} onPick={(id) => editor.apply("Change start spawn", (q) => setStart(q, g.startScene, id))} />
            </div>
          </section>

          <section className="grid gap-1.5" aria-label="Score" data-game="maxScore">
            <h4 className={DT}>Score</h4>
            <NumberField label="Max score" integer min={0} value={g.maxScore} onChange={(n) => editor.apply("Change max score", (q) => setMaxScore(q, n), "game:maxScore")} onBlur={blur} className="w-28" />
            <p className={total === g.maxScore ? "text-muted-foreground text-[12px]" : "text-warn text-[12px]"}>
              Awards in the game add up to {total} ({awards} award{awards === 1 ? "" : "s"}).
            </p>
          </section>

          <section className="grid gap-2" aria-label="Default responses" data-game="defaultResponses">
            <h4 className={DT}>Default responses</h4>
            <p className="text-muted-foreground text-[12px]">What the narrator says when no rule answers (first match wins, then these).</p>
            {RESPONSE_VERBS.map((verb) => (
              <TextField
                key={verb}
                multiline
                label={RESPONSE_LABEL[verb]}
                value={g.defaultResponses[verb]}
                onChange={(v) => editor.apply("Change default response", (q) => setDefaultResponse(q, verb, v), `game:response:${verb}`)}
                onBlur={blur}
              />
            ))}
          </section>

      </InspectorShell>
    </div>
  );
}
