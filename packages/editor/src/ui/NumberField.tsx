import { useEffect, useId, useState } from "react";
import { Input } from "./components/ui/input.tsx";
import { Label } from "./components/ui/label.tsx";
import { cn } from "./lib/utils.ts";

/**
 * A number that edits project data as you type, like TextField: typing within a
 * second is one undo step and leaving the field ends it. Text that isn't a
 * usable number stays in the box (marked) without being applied.
 */
export function NumberField(props: {
  label: string;
  value: number;
  onChange(value: number): void;
  onBlur(): void;
  /** Whole numbers only (scene geometry). */
  integer?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  /** Keeps the label for screen readers only, for fields inside a sentence. */
  compact?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(String(props.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(props.value));
  }, [props.value, focused]);
  const parse = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (props.integer && !Number.isInteger(n)) return null;
    if (props.min !== undefined && n < props.min) return null;
    if (props.max !== undefined && n > props.max) return null;
    return n;
  };
  const ok = parse(text) !== null;
  return (
    <div className={cn("grid gap-1", props.className)}>
      <Label htmlFor={id} className={cn("text-muted-foreground text-[11px] font-normal", props.compact && "sr-only")}>
        {props.label}
      </Label>
      <Input
        id={id}
        aria-label={props.label}
        aria-invalid={!ok}
        inputMode={props.integer ? "numeric" : "decimal"}
        className="h-7 px-2 text-[13px] tabular-nums"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(String(props.value));
          props.onBlur();
        }}
        onKeyDown={(e) => {
          // Arrow keys nudge by one step (scene pixels for geometry).
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const step = (props.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
          const n = parse(String(Math.round(((parse(text) ?? props.value) + step) * 100) / 100));
          if (n !== null) {
            setText(String(n));
            props.onChange(n);
          }
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value);
          if (n !== null) props.onChange(n);
        }}
      />
    </div>
  );
}
