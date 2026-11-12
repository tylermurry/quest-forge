import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { awardTotal } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { RESPONSE_LABEL, RESPONSE_VERBS, setDefaultResponse, setMaxScore, setStart } from "../../model/game.ts";
import { GAME_AREAS, GENERAL_SECTIONS, STYLING_SECTIONS, generalSectionFor, type GameArea, type GameSection, type GeneralSection } from "../../model/gameSettings.ts";
import { pickerOptions } from "../../model/rules/pickers.ts";
import { SECTION_SAMPLE, type SampleId } from "../../model/stylePreview.ts";
import { ownerRules } from "../../model/rules/owner.ts";
import { ruleProblems } from "../../model/rules/problems.ts";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable.tsx";
import { flashElement } from "../flash.ts";
import { cn } from "../lib/utils.ts";
import { SECTION_HEADING } from "../SectionHeading.tsx";
import { NumberField } from "../NumberField.tsx";
import { Picker } from "../rules/Picker.tsx";
import { RuleInspector } from "../rules/RuleInspector.tsx";
import { CharacterDialogue } from "./CharacterDialogue.tsx";
import { IconBar } from "./IconBar.tsx";
import { Inventory } from "./Inventory.tsx";
import { FrameDraftContext, useFrameDrafts } from "./FrameControls.tsx";
import { Frames } from "./Frames.tsx";
import { StylePreview } from "./StylePreview.tsx";
import { Typography } from "./Typography.tsx";
import { TextField } from "../TextField.tsx";

const H = "text-xl font-semibold";
/** The `data-game` field each General subsection flashes on a jump-to. */
const GAME_FIELD: Record<GeneralSection, string> = { start: "startScene", score: "maxScore", defaultResponses: "defaultResponses", rules: "rules" };
const HINT = "text-muted-foreground text-[12px]";
/** The Styling preview pane's starting height: the samples row, the 640×400 game and a little room around it. */
const PREVIEW_PANE_HEIGHT = 464;

/** The first thing in a flashed field that takes focus (a text box, a picker), so a jump-to leaves the cursor there. */
const FOCUSABLE = "input, textarea, button, [role=combobox], [tabindex]";

/**
 * The Game settings editor in the center: a menu on the left that stays put while the page scrolls, with General
 * (start, score, default responses, game rules) and Styling (Frames, Typography, Character Dialogue, Inventory and
 * Icon Bar) as headings over their subsections, and the chosen subsection on the right. Styling splits the right
 * side: the one preview on top, in a pane that stays put and can be resized, and the section's settings below.
 * The open subsection is UI state in `ws.gameNav`.
 */
export function GameSettings({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const root = useRef<HTMLDivElement | null>(null);
  const game = editor.project.game;
  const nav = ws.gameNav;
  const drafts = useFrameDrafts();
  const previewPane = useRef<PanelImperativeHandle | null>(null);
  // The one Styling preview's sample: opening a section switches to its sample (Typography keeps what is showing).
  const [sample, setSample] = useState<SampleId>(SECTION_SAMPLE[nav.styling] ?? "narrationShort");
  useEffect(() => {
    const next = SECTION_SAMPLE[nav.styling];
    if (next) setSample(next);
  }, [nav.styling]);

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

  const current: GameSection = nav.area === "general" ? nav.general : nav.styling;
  const menu: { area: GameArea; title: string; sections: { section: GameSection; title: string }[] }[] = GAME_AREAS.map((a) => ({
    ...a,
    sections: a.area === "general" ? GENERAL_SECTIONS : STYLING_SECTIONS,
  }));

  return (
    <div ref={root} className="flex h-full min-h-0">
      <nav aria-label="Game settings" className="bg-panel w-48 shrink-0 overflow-y-auto border-r px-2 py-4">
        {menu.map((m) => (
          <div key={m.area} role="group" aria-labelledby={`game-area-${m.area}`} className="mb-5 grid gap-0.5">
            <h2 id={`game-area-${m.area}`} className={cn(SECTION_HEADING, "px-2 pb-1")}>
              {m.title}
            </h2>
            {m.sections.map((s) => {
              const selected = nav.area === m.area && current === s.section;
              return (
                <button
                  key={s.section}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => ws.setGameSection(s.section)}
                  className={cn("hover:bg-muted flex h-7 items-center gap-1.5 rounded-sm px-2 text-left text-[13px]", selected && "bg-muted text-foreground font-semibold")}
                >
                  {s.title}
                  {s.section === "rules" && (
                    <>
                      <span className="text-muted-foreground ml-auto font-normal tabular-nums">{rulesCount}</span>
                      {rulesInvalid && <CircleAlert className="text-err size-3.5" aria-label="Some rules have problems" />}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {nav.area === "general" ? (
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-2xl">
            {current === "start" ? (
              <StartSection actions={actions} />
            ) : current === "score" ? (
              <ScoreSection actions={actions} />
            ) : current === "defaultResponses" ? (
              <DefaultResponsesSection actions={actions} />
            ) : (
              <section aria-label="Rules" className="grid gap-1.5">
                <h3 className={H}>Rules</h3>
                <p className={HINT}>Rules that work anywhere in the game (first match wins).</p>
                <RuleInspector actions={actions} owner={{ kind: "game" }} />
              </section>
            )}
          </div>
        </div>
      ) : (
        // Styling: the one preview on top (it stays put and can be resized), the section's settings scrolling below.
        <FrameDraftContext.Provider value={drafts}>
          <div className="min-w-0 flex-1">
            <ResizablePanelGroup orientation="vertical" id="questforge.stylingPreview">
              <ResizablePanel id="preview" panelRef={previewPane} defaultSize={`${PREVIEW_PANE_HEIGHT}px`} minSize="140px" maxSize="85%">
                <StylePreview actions={actions} sample={sample} onSample={setSample} onResizePane={(delta) => previewPane.current?.resize(`${Math.round((previewPane.current?.getSize().inPixels ?? 0) + delta)}px`)} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="settings" minSize="15%">
                <div className="h-full overflow-y-auto px-6 py-5">
                  <div className="max-w-6xl">
                    {current === "frames" ? (
                      <Frames actions={actions} />
                    ) : current === "typography" ? (
                      <Typography actions={actions} />
                    ) : current === "characterDialogue" ? (
                      <CharacterDialogue actions={actions} />
                    ) : current === "inventory" ? (
                      <Inventory />
                    ) : (
                      <IconBar actions={actions} />
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </FrameDraftContext.Provider>
      )}
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
