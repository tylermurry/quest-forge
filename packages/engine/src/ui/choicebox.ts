import { SCENE_HEIGHT, type FrameInsets } from "@questforge/schema";
import { wrap } from "./textbox.ts";
import { SEPARATOR_SPACE, choiceLayout, type ChoiceBox, type ChoicePromptLayout, type Placement } from "./layout.ts";
import { lineFor, shrinkToFit, type Measure } from "./typography.ts";

// The styled dialogue list box with the line said just before it (the "prompt"), laid out like the Styling
// preview: the speaker's name, their line, then the separator and the rows, all in one panel. Pure; tested in Node.

/** What was said just before the choices: the speaker's name (null for narration) and the text. */
export interface ChoicePrompt {
  name: string | null;
  text: string;
}

export interface ChoiceBoxInput {
  unit: number;
  count: number;
  page: number;
  styled: boolean;
  placement: Placement | null;
  borders: FrameInsets | null;
  /** Shown only when `styled`; null or blank text shows none. */
  prompt: ChoicePrompt | null;
  measure: Measure;
  /** The text size to try (the author's, with the player's Text Size applied). */
  size: number;
}

/** The gap under the speaker's name, as in the Styling preview (`NAME_GAP`). */
const NAME_GAP = SEPARATOR_SPACE;
/** The padding above an unframed panel's first line; a frame's border is the padding otherwise. */
const TOP_PAD = 8;
/** The side room a panel's rows leave, which the prompt's text keeps too. */
const SIDE_PAD = 8;
/** The most the box may take of the screen height: what `choiceLayout` leaves above and below it. */
const SCREEN_ROOM = 8;

/** Cuts `line` so it and an ellipsis fit `width`. */
function ellipsize(measure: (s: string) => number, line: string, width: number): string {
  let t = line;
  while (t.length > 1 && measure(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * Where the list box and everything in it goes. Without a prompt (or when Dialogue Choices isn't styled) it is
 * `choiceLayout` as it always was. With one, the text wraps to the rows' width and the box grows to fit; a box
 * that would leave the screen gets smaller text first (never below the legacy size, see `shrinkToFit`), then fewer
 * lines (the last one ends with an ellipsis), so at least two rows (one and "More…") always stay on screen.
 */
export function layoutChoices(a: ChoiceBoxInput): ChoiceBox {
  const plain = () => choiceLayout(a.unit, a.count, a.page, a.styled, a.placement, a.borders);
  const text = a.prompt?.text.trim() ?? "";
  if (!a.styled || !a.prompt || text === "") return plain();
  const prompt = a.prompt;
  const base = plain();
  const width = Math.max(8, (base.inner ?? base.panel).w - SIDE_PAD * 2);
  const pad = a.borders ? 0 : TOP_PAD;
  const place = (size: number, lines: string[]) => {
    const line = lineFor(size);
    const layout: ChoicePromptLayout = { name: prompt.name, lines, size, line, pad, height: pad + (prompt.name ? line + NAME_GAP : 0) + lines.length * line };
    return choiceLayout(a.unit, a.count, a.page, a.styled, a.placement, a.borders, layout);
  };
  const lay = (size: number, max = Infinity) => {
    const measure = (s: string) => a.measure(s, size);
    let lines = wrap(measure, text, width);
    if (lines.length > max) lines = [...lines.slice(0, max - 1), ellipsize(measure, lines.slice(max - 1).join(" "), width)];
    return { lines, box: place(size, lines) };
  };
  const fits = (r: { box: ChoiceBox }) => r.box.panel.h <= SCENE_HEIGHT - SCREEN_ROOM;
  const { size, result } = shrinkToFit(a.size, (s) => lay(s), fits);
  if (fits(result)) return result.box;
  // Even the smallest text is too tall: keep the lines that leave room for the rows.
  for (let n = result.lines.length - 1; n >= 1; n--) {
    const cut = lay(size, n);
    if (fits(cut) || n === 1) return cut.box;
  }
  return result.box;
}
