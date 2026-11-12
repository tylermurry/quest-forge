import { AUTHOR_DEFAULTS, resolveStyle } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { dialogueChoicesOf, setChoiceHighlight, setChoiceSeparator } from "../../model/style.ts";
import { useCanvasImages } from "../scene/images.ts";
import { FramePreview } from "./FramePreview.tsx";
import { useStyleFont } from "./useStyleFont.ts";

const SAMPLES = [{ id: "choices", label: "Dialogue choices" }] as const;

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
 * Game Settings > Styling > Dialogue Choices: the colour behind the hovered or selected answer and the colour of the
 * line above the choices, beside a preview drawn by the engine on the shared frame with the game's text. The
 * answers' own text colour comes from the highlight, so it stays readable.
 */
export function DialogueChoices({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const p = editor.project;
  const images = useCanvasImages(p);
  const style = p.game?.data.style;
  const saved = dialogueChoicesOf(p);
  const font = useStyleFont(p, style, images);
  // What the controls show: what the creator set, and for the rest what customising starts from.
  const shown = resolveStyle({ ...style, dialogueChoices: saved ?? {} }).dialogueChoices;
  const frame = resolveStyle(style).sharedFrame;

  return (
    <section aria-label="Dialogue Choices" className="grid gap-3">
      <header className="grid gap-1">
        <h3 className="text-base font-semibold">Dialogue Choices</h3>
        <p className="text-muted-foreground text-[12px]">How the answers a player can pick look when you talk to someone. They use your Shared Frame and your Typography; here you pick two colours.</p>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="grid gap-3">
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
          <p className="text-muted-foreground text-[12px]">The highlight fills the whole answer the player points at, and its text turns black or white on its own so it stays easy to read. The separator is the thin line at the top of the choices. Point at an answer in the preview, or click it, to see the highlight.</p>
        </div>
        <FramePreview frame={frame} style={style} images={images} family={font.family} samples={SAMPLES} shapes={false} />
      </div>
    </section>
  );
}
