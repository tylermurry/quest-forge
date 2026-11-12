import { FileUp } from "lucide-react";
import { useRef } from "react";
import { AUTHOR_DEFAULTS, FONT_FAMILIES, TEXT_SIZE_MAX, TEXT_SIZE_MIN, resolveStyle, type FontFamily } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { fontOptions, setTypographyColor, setTypographyFamily, setTypographyFont, setTypographySize, typographyOf } from "../../model/style.ts";
import { Button } from "../components/ui/button.tsx";
import { NumberField } from "../NumberField.tsx";
import { Picker } from "../rules/Picker.tsx";
import { useCanvasImages } from "../scene/images.ts";
import { useStyleFont } from "./useStyleFont.ts";

const FAMILY_LABEL: Record<FontFamily, string> = { monospace: "Monospace (built in)", serif: "Serif (built in)", "sans-serif": "Sans-serif (built in)" };
const FAMILY = "family:";
const FONT = "font:";

/**
 * Game Settings > Styling > Typography: one font (a built-in family or a font imported into the project), the
 * text size and the text colour for every word the game draws, under the shared Styling preview. The player's own Text Size setting scales this size in the game; it is not set here.
 */
export function Typography({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const p = editor.project;
  const images = useCanvasImages(p);
  const file = useRef<HTMLInputElement | null>(null);
  const style = p.game?.data.style;
  const saved = typographyOf(p);
  const font = useStyleFont(p, style, images);
  // What the controls show: what the creator set, and for the rest what customising starts from.
  const shown = resolveStyle({ ...style, typography: saved ?? {} }).typography;

  const options = [
    ...FONT_FAMILIES.map((f) => ({ id: FAMILY + f, label: FAMILY_LABEL[f] })),
    ...fontOptions(p).map((o) => ({ id: FONT + o.id, label: `${o.label} (imported)` })),
  ];
  const value = shown.font !== undefined ? FONT + shown.font : FAMILY + (shown.family ?? AUTHOR_DEFAULTS.typography.family);
  const pickFont = (id: string) =>
    id.startsWith(FONT)
      ? editor.apply("Pick game font", (q) => setTypographyFont(q, id.slice(FONT.length)))
      : editor.apply("Pick game font", (q) => setTypographyFamily(q, id.slice(FAMILY.length) as FontFamily));
  const importFont = async (f: File) => {
    const known = new Set(editor.project.assets?.data.fonts?.map((x) => x.id));
    actions.importFiles("font", "", [{ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }]);
    const added = editor.project.assets?.data.fonts?.find((x) => !known.has(x.id));
    if (added) pickFont(FONT + added.id);
  };

  return (
    <section aria-label="Typography" className="grid gap-5">
      <header className="grid gap-1">
        <h3 className="text-xl font-semibold">Typography</h3>
        <p className="text-muted-foreground text-[12px]">The font, size and colour of the words in the game: narration, speech, dialogue choices and the buttons. Players can make it larger or smaller in the game&apos;s Settings (75% to 200% of the size you set here).</p>
      </header>
      <div className="grid gap-3 max-w-3xl">
        {saved === undefined && <p className="text-muted-foreground text-[12px]">Not customised yet: the game uses its original 10 pixel text. Changing anything here switches to your own typography, starting from {AUTHOR_DEFAULTS.typography.size} pixel white text.</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-[12px]">Font</span>
          <Picker label="Font" value={value} options={options} onPick={pickFont} />
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[13px] font-normal" onClick={() => file.current?.click()}>
            <FileUp className="size-3.5" />
            Import font…
          </Button>
          <input
            ref={file}
            type="file"
            accept=".woff2,.woff,font/woff2,font/woff"
            aria-label="Import a font file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFont(f);
            }}
          />
        </div>
        <p className="text-muted-foreground text-[12px]">Import a WOFF2 or WOFF font file to use your own lettering. It travels inside the game when you build it.</p>
        {font.problem && (
          <p role="alert" className="text-err text-[12px]">
            {font.problem}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <NumberField
            label="Text size (pixels)"
            integer
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            value={shown.size}
            onChange={(n) => editor.apply("Change text size", (q) => setTypographySize(q, n), "style:typography:size")}
            onBlur={() => editor.history.breakMerge()}
            className="w-32"
          />
          <label className="grid gap-1">
            <span className="text-muted-foreground text-[11px]">Text colour</span>
            <span className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Text colour"
                value={shown.color}
                className="h-7 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                onChange={(e) => editor.apply("Change text colour", (q) => setTypographyColor(q, e.target.value), "style:typography:color")}
                onBlur={() => editor.history.breakMerge()}
              />
              <span className="text-[12px] tabular-nums">{shown.color}</span>
            </span>
          </label>
        </div>
        <p className="text-muted-foreground text-[12px]">Speakers&apos; names use the name colour from Character Dialogue, and a character&apos;s own colour stays on the outline of their speech box. Pick a text colour that stands out against your frame.</p>
      </div>
    </section>
  );
}
