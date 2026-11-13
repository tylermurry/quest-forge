import { useEffect, useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Input } from "./components/ui/input.tsx";
import { Label } from "./components/ui/label.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.tsx";
import { cn } from "./lib/utils.ts";

/** "#rrggbb" in lower case, or null. A leading "#" is optional when typing. */
function parseHex(text: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

/**
 * A color that edits project data as it changes, like NumberField: a swatch that opens a picker (react-colorful,
 * used only here) and a hex box. Dragging in the picker or typing is one undo step; closing the picker or leaving
 * the box ends it. A hex that isn't valid stays in the box (marked) without being applied.
 */
export function ColorField(props: { label: string; value: string; onChange(color: string): void; onBlur(): void; className?: string }) {
  const id = useId();
  const [text, setText] = useState(props.value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(props.value);
  }, [props.value, focused]);
  const ok = parseHex(text) !== null;
  return (
    <div className={cn("grid gap-1", props.className)}>
      <Label htmlFor={id} className="text-muted-foreground text-[11px] font-normal">
        {props.label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Popover onOpenChange={(open) => !open && props.onBlur()}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Pick ${props.label.toLowerCase()}`}
              className="border-input focus-visible:border-ring focus-visible:ring-ring size-7 shrink-0 rounded-md border p-0.5 outline-none focus-visible:ring-1"
            >
              <span className="block size-full rounded-sm" style={{ backgroundColor: props.value }} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="qf-color-picker w-auto p-2">
            <HexColorPicker color={props.value} onChange={props.onChange} />
          </PopoverContent>
        </Popover>
        <Input
          id={id}
          aria-label={props.label}
          aria-invalid={!ok}
          spellCheck={false}
          className="h-7 w-24 px-2 font-mono text-[12px]"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(props.value);
            props.onBlur();
          }}
          onChange={(e) => {
            setText(e.target.value);
            const hex = parseHex(e.target.value);
            if (hex !== null) props.onChange(hex);
          }}
        />
      </div>
    </div>
  );
}
