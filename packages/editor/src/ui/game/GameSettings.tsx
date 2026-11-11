import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { awardTotal } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { RESPONSE_LABEL, RESPONSE_VERBS, setDefaultResponse, setMaxScore, setStart } from "../../model/game.ts";
import { GAME_AREAS, GENERAL_SECTIONS, STYLING_SECTIONS, generalSectionFor, type GameArea, type GameSection, type GeneralSection } from "../../model/gameSettings.ts";
import { pickerOptions } from "../../model/rules/pickers.ts";
import { ownerRules } from "../../model/rules/owner.ts";
import { ruleProblems } from "../../model/rules/problems.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { flashElement } from "../flash.ts";
import { NumberField } from "../NumberField.tsx";
import { Picker } from "../rules/Picker.tsx";
import { RuleInspector } from "../rules/RuleInspector.tsx";
import { TextField } from "../TextField.tsx";

const H = "text-base font-semibold";
/** The `data-game` field each General subsection flashes on a jump-to. */
const GAME_FIELD: Record<GeneralSection, string> = { start: "startScene", score: "maxScore", defaultResponses: "defaultResponses", rules: "rules" };
const HINT = "text-muted-foreground text-[12px]";

/** The first thing in a flashed field that takes focus (a text box, a picker), so a jump-to leaves the cursor there. */
const FOCUSABLE = "input, textarea, button, [role=combobox], [tabindex]";

/**
 * The Game settings editor in the center: General (start, score, default responses, game
 * rules) and Styling (placeholders until the skin tickets land), each with a vertical
 * list of subsections. Open tab and subsection are UI state in `ws.gameNav`.
 */
export function GameSettings({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const root = useRef<HTMLDivElement | null>(null);
  const game = editor.project.game;
  const nav = ws.gameNav;

  // Jump-to a game setting flashes and focuses its field; rule spots are handled by their cards.
  // The target subsection mounts a render after the nav changes, so wait for the field to appear
  // (a few frames) instead of looking once; the highlight is cleared only once the field is handled.
  const highlight = ws.highlight;
  useEffect(() => {
    if (!highlight || !game || highlight.location.file !== game.path || highlight.location.path[0] === "rules") return;
    const key = GAME_FIELD[generalSectionFor(highlight.location.path)];
    let frames = 0;
    let timer = 0;
    const attempt = () => {
      const el = root.current?.querySelector<HTMLElement>(`[data-game="${key}"]`);
      if (el) {
        el.scrollIntoView?.({ block: "nearest" });
        flashElement(el, highlight.tone);
        el.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
        ws.clearHighlight();
      } else if (++frames < 30) timer = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(timer);
  }, [highlight?.seq]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per jump request (seq); re-running when the game settings change would flash again

  if (!game) return <p className="text-muted-foreground">This project has no game.yaml.</p>;
  const own = ownerRules(editor.project, { kind: "game" });
  const rulesInvalid = own ? ruleProblems(editor.problems, own).byRule.size > 0 : false;
  const rulesCount = own?.rules.length ?? 0;

  return (
    <div ref={root} className="flex max-w-4xl flex-col gap-3">
      <header>
        <h2 className="text-lg font-semibold">{game.data.title}</h2>
        <p className={HINT}>Game settings and rules that work anywhere</p>
      </header>
      <Tabs value={nav.area} onValueChange={(v) => ws.setGameArea(v as GameArea)} className="gap-3">
        <TabsList variant="line" aria-label="Game settings area" className="h-8 justify-start gap-1 border-b p-0">
          {GAME_AREAS.map((a) => (
            <TabsTrigger key={a.area} value={a.area} className="flex-none px-3 text-[13px]">
              {a.title}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <Tabs value={nav.general} onValueChange={(v) => ws.setGameSection(v as GameSection)} orientation="vertical" className="gap-6">
            <TabsList variant="line" aria-label="General sections" className="w-44 shrink-0 items-stretch justify-start gap-0.5 p-0">
              {GENERAL_SECTIONS.map((s) => (
                <TabsTrigger key={s.section} value={s.section} className="data-[state=active]:bg-muted data-[state=active]:font-semibold data-[state=active]:text-foreground justify-start px-2 text-[13px]">
                  {s.title}
                  {s.section === "rules" && (
                    <>
                      <span className="text-muted-foreground ml-auto tabular-nums">{rulesCount}</span>
                      {rulesInvalid && <CircleAlert className="text-err size-3.5" aria-label="Some rules have problems" />}
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="min-w-0 max-w-2xl flex-1">
              <TabsContent value="start">
                <StartSection actions={actions} />
              </TabsContent>
              <TabsContent value="score">
                <ScoreSection actions={actions} />
              </TabsContent>
              <TabsContent value="defaultResponses">
                <DefaultResponsesSection actions={actions} />
              </TabsContent>
              <TabsContent value="rules">
                <section aria-label="Rules" className="grid gap-1.5">
                  <h3 className={H}>Rules</h3>
                  <p className={HINT}>Rules that work anywhere in the game (first match wins).</p>
                  <RuleInspector actions={actions} owner={{ kind: "game" }} />
                </section>
              </TabsContent>
            </div>
          </Tabs>
        </TabsContent>
        <TabsContent value="styling">
          <Tabs value={nav.styling} onValueChange={(v) => ws.setGameSection(v as GameSection)} orientation="vertical" className="gap-6">
            <TabsList variant="line" aria-label="Styling sections" className="w-44 shrink-0 items-stretch justify-start gap-0.5 p-0">
              {STYLING_SECTIONS.map((s) => (
                <TabsTrigger key={s.section} value={s.section} className="data-[state=active]:bg-muted data-[state=active]:font-semibold data-[state=active]:text-foreground justify-start px-2 text-[13px]">
                  {s.title}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="min-w-0 max-w-2xl flex-1">
              {STYLING_SECTIONS.map((s) => (
                <TabsContent key={s.section} value={s.section}>
                  <section aria-label={s.title} className="grid gap-1.5">
                    <h3 className={H}>{s.title}</h3>
                    <p className="text-muted-foreground text-[13px]">Nothing to set here yet. This section is coming in a later update.</p>
                  </section>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StartSection({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const p = editor.project;
  const g = p.game!.data;
  return (
    <section className="grid gap-1.5" aria-label="Start" data-game="startScene">
      <h3 className={H}>Start</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-[12px]">Play starts in</span>
        <Picker label="Start scene" value={g.startScene} options={pickerOptions(p, "scene")} onPick={(id) => editor.apply("Change start scene", (q) => setStart(q, id))} />
        <span className="text-muted-foreground text-[12px]">at</span>
        <Picker label="Start spawn" value={g.startSpawn} options={pickerOptions(p, "spawn", g.startScene)} onPick={(id) => editor.apply("Change start spawn", (q) => setStart(q, g.startScene, id))} />
      </div>
    </section>
  );
}

function ScoreSection({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const g = editor.project.game!.data;
  const { total, awards } = awardTotal(editor.project);
  return (
    <section className="grid gap-1.5" aria-label="Score" data-game="maxScore">
      <h3 className={H}>Score</h3>
      <NumberField label="Max score" integer min={0} value={g.maxScore} onChange={(n) => editor.apply("Change max score", (q) => setMaxScore(q, n), "game:maxScore")} onBlur={() => editor.history.breakMerge()} className="w-28" />
      <p className={total === g.maxScore ? "text-muted-foreground text-[12px]" : "text-warn text-[12px]"}>
        Awards in the game add up to {total} ({awards} award{awards === 1 ? "" : "s"}).
      </p>
    </section>
  );
}

function DefaultResponsesSection({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const g = editor.project.game!.data;
  return (
    <section className="grid gap-2" aria-label="Default responses" data-game="defaultResponses">
      <h3 className={H}>Default Responses</h3>
      <p className={HINT}>What the narrator says when no rule answers (first match wins, then these).</p>
      {RESPONSE_VERBS.map((verb) => (
        <TextField
          key={verb}
          multiline
          label={RESPONSE_LABEL[verb]}
          value={g.defaultResponses[verb]}
          onChange={(v) => editor.apply("Change default response", (q) => setDefaultResponse(q, verb, v), `game:response:${verb}`)}
          onBlur={() => editor.history.breakMerge()}
        />
      ))}
    </section>
  );
}
