import { resolveStyle, type IconEffect } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { dialogueChoicesOf, setChoiceEffect, setChoiceSeparator, setSpeechNameColor } from "../../model/style.ts";
import { ColorField } from "../ColorField.tsx";
import { Button } from "../components/ui/button.tsx";
import { ResetSection } from "./ResetSection.tsx";
import { cn } from "../lib/utils.ts";

const EFFECTS: { id: IconEffect; label: string }[] = [
  { id: "brighten", label: "Brighten" },
  { id: "darken", label: "Darken" },
];

/**
 * Game Settings > Styling > Character Dialogue: the color of every speaker's name (their words use the text color
 * from Typography), how the hovered or selected answer is marked (Brighten or Darken) and the color of the line
 * above the choices, under the shared Styling preview. The answers keep the text color.
 */
export function CharacterDialogue({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const p = editor.project;
  const style = p.game?.data.style;
  const saved = dialogueChoicesOf(p);
  // What the controls show: what the creator set, and for the rest what customising starts from.
  const shown = resolveStyle({ ...style, dialogueChoices: saved ?? {} }).dialogueChoices;
  const { speech } = resolveStyle(style);

  return (
    <section aria-label="Character Dialogue" className="grid gap-5">
      <div className="flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2">
        <h3 className="text-xl font-semibold">Character Dialogue</h3>
        <ResetSection actions={actions} section="characterDialogue" />
      </div>
      <div className="grid max-w-3xl gap-8">
        <div role="group" aria-label="Speech" className="grid gap-1.5">
          <h4 className="text-[13px] font-semibold">Speech</h4>
          <ColorField
            label="Name color"
            value={speech.name}
            onChange={(c) => editor.apply("Change name color", (q) => setSpeechNameColor(q, c), "style:speech:name")}
            onBlur={() => editor.history.breakMerge()}
          />
        </div>
        <div role="group" aria-label="Choices" className="grid gap-1.5">
          <h4 className="text-[13px] font-semibold">Choices</h4>
          <div className="flex flex-wrap items-end gap-4">
            <div role="group" aria-label="Hover effect" className="grid gap-1">
              <span className="text-muted-foreground text-[11px]">Hover effect</span>
              <div className="flex h-7 items-center gap-1">
                {EFFECTS.map((e) => {
                  const on = shown.effect === e.id;
                  return (
                    <Button key={e.id} type="button" size="xs" variant={on ? "secondary" : "ghost"} aria-pressed={on} onClick={() => editor.apply(`Set choice hover effect to ${e.label}`, (q) => setChoiceEffect(q, e.id))} className={cn("text-[12px]", on && "font-semibold")}>
                      {e.label}
                    </Button>
                  );
                })}
              </div>
            </div>
            <ColorField
              label="Separator color"
              value={shown.separator}
              onChange={(c) => editor.apply("Change choice separator color", (q) => setChoiceSeparator(q, c), "style:dialogueChoices:separator")}
              onBlur={() => editor.history.breakMerge()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
