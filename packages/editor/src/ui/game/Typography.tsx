import { FileUp, Info } from "lucide-react";
import { useRef } from "react";
import { AUTHOR_DEFAULTS, FONT_FAMILIES, TEXT_SIZE_MAX, TEXT_SIZE_MIN, resolveStyle, type FontFamily } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { fontOptions, setTypographyColor, setTypographyFamily, setTypographyFont, setTypographySize, typographyOf } from "../../model/style.ts";
import { Button } from "../components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.tsx";
import { ColorField } from "../ColorField.tsx";
import { NumberField } from "../NumberField.tsx";
import { Picker } from "../rules/Picker.tsx";
import { useCanvasImages } from "../scene/images.ts";
import { useStyleFont } from "./useStyleFont.ts";

const FAMILY_LABEL: Record<FontFamily, string> = { monospace: "Monospace (built in)", serif: "Serif (built in)", "sans-serif": "Sans-serif (built in)" };
const FAMILY = "family:";
const FONT = "font:";

/**
 * Game Settings > Styling > Typography: one font (a built-in family or a font imported into the project), the
 * text size and the text color for every word the game draws, under the shared Styling preview. The player's own Text Size setting scales this size in the game; it is not set here.
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
      <h3 className="text-xl font-semibold">Typography</h3>
      <div className="grid gap-3 max-w-3xl">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="About importing fonts" className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm p-0.5 outline-none focus-visible:ring-1">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">Import a WOFF2 or WOFF font file to use your own lettering. It travels inside the game when you build it.</TooltipContent>
          </Tooltip>
        </div>
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
          <ColorField
            label="Text color"
            value={shown.color}
            onChange={(c) => editor.apply("Change text color", (q) => setTypographyColor(q, c), "style:typography:color")}
            onBlur={() => editor.history.breakMerge()}
          />
        </div>
      </div>
    </section>
  );
}
