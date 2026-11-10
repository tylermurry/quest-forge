import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Input } from "./components/ui/input.tsx";
import { Label } from "./components/ui/label.tsx";
import { Textarea } from "./components/ui/textarea.tsx";

/**
 * A text field that edits project data as you type. Every keystroke within a
 * second is one undo step; leaving the field ends the step. Invalid values
 * (e.g. empty) stay in the box without being applied.
 */
export function TextField(props: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange(value: string): void;
  onBlur(): void;
  valid?(v: string): boolean;
  /** Label for screen readers only, plus a placeholder (fields inside a rule sentence). */
  compact?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(props.value);
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Compact boxes fit their text up to three lines; focusing one shows all of it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `text` is a trigger: the box is re-measured whenever its content changes
  useLayoutEffect(() => {
    const el = area.current;
    if (!props.compact || !el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const full = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${focused ? full : Math.min(full, line * 3 + chrome)}px`;
  }, [text, focused, props.compact]);
  useEffect(() => {
    if (!focused) setText(props.value);
  }, [props.value, focused]);
  const change = (v: string) => {
    setText(v);
    if ((props.valid ?? ((x: string) => x.trim() !== ""))(v)) props.onChange(v);
  };
  const common = {
    id,
    "aria-label": props.label,
    value: text,
    className: "text-[13px]",
    placeholder: props.placeholder,
    "aria-invalid": props.invalid || undefined,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      setText(props.value);
      props.onBlur();
    },
  };
  return (
    <div className={props.compact ? "order-3 grid min-w-0 basis-full" : "grid gap-1.5"}>
      <Label htmlFor={id} className={props.compact ? "sr-only" : "text-muted-foreground text-[12px] font-normal"}>
        {props.label}
      </Label>
      {props.multiline ? (
        <Textarea
          ref={area}
          rows={props.compact ? 1 : 3}
          {...common}
          className={props.compact ? "field-sizing-fixed min-h-0 resize-y px-2 py-1 text-[13px] leading-5" : common.className}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <Input {...common} className="h-8 text-[13px]" onChange={(e) => change(e.target.value)} />
      )}
    </div>
  );
}
