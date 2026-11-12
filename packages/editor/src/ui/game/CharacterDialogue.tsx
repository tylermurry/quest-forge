import { AUTHOR_DEFAULTS, resolveStyle } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { dialogueChoicesOf, setChoiceHighlight, setChoiceSeparator, setSpeechNameColor } from "../../model/style.ts";

/** One colour box, like Typography's text colour: edits merge while the picker is dragged and break on blur. */
function ColorField(props: { label: string; value: string; onChange(color: string): void; onBlur(): void }) {
  return (
    <label className="grid gap-1">
      <span className="text-muted-foreground text-[11px]">{props.label}</span>
      <span className="flex items-center gap-2">
        <input type="color" aria-label={props.label} value={props.value} className="h-7 w-10 cursor-pointer rounded border bg-transparent p-0.5" onChange={(e) => props.onChange(e.target.value)} onBlur={props.onBlur} />
        <span className="text-[12px] tabular-nums">{props.value}</span>
      </span>
    </label>
  );
}

/**
 * Game Settings > Styling > Character Dialogue: the colour of every speaker's name (their words use the text colour
 * from Typography), the colour behind the hovered or selected answer and the colour of the line above the choices,
 * under the shared Styling preview. The answers' own text colour comes
 * from the highlight, so it stays readable.
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
      <h3 className="text-xl font-semibold">Character Dialogue</h3>
      <div className="grid max-w-3xl gap-8">
        <div role="group" aria-label="Speech" className="grid gap-1.5">
          <h4 className="text-[13px] font-semibold">Speech</h4>
          <ColorField
            label="Name colour"
            value={speech.name}
            onChange={(c) => editor.apply("Change name colour", (q) => setSpeechNameColor(q, c), "style:speech:name")}
            onBlur={() => editor.history.breakMerge()}
          />
        </div>
        <div role="group" aria-label="Choices" className="grid gap-1.5">
          <h4 className="text-[13px] font-semibold">Choices</h4>
          {saved === undefined && <p className="text-muted-foreground text-[12px]">Not customised yet: the game keeps its original gold highlight ({AUTHOR_DEFAULTS.dialogueChoices.highlight}) and no line above the choices. Changing a colour here adds the line.</p>}
          <div className="flex flex-wrap items-end gap-4">
            <ColorField
              label="Highlight colour"
              value={shown.highlight}
              onChange={(c) => editor.apply("Change choice highlight colour", (q) => setChoiceHighlight(q, c), "style:dialogueChoices:highlight")}
              onBlur={() => editor.history.breakMerge()}
            />
            <ColorField
              label="Separator colour"
              value={shown.separator}
              onChange={(c) => editor.apply("Change choice separator colour", (q) => setChoiceSeparator(q, c), "style:dialogueChoices:separator")}
              onBlur={() => editor.history.breakMerge()}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
