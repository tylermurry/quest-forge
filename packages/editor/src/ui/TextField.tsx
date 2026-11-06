import { useEffect, useId, useState } from "react";
import { Input } from "./components/ui/input.tsx";
import { Label } from "./components/ui/label.tsx";
import { Textarea } from "./components/ui/textarea.tsx";

/**
 * A text field that edits project data as you type. Every keystroke within a
 * second is one undo step; leaving the field ends the step (D84). Invalid values
 * (e.g. empty) stay in the box without being applied.
 */
export function TextField(props: { label: string; value: string; multiline?: boolean; onChange(value: string): void; onBlur(): void; valid?(v: string): boolean }) {
  const id = useId();
  const [text, setText] = useState(props.value);
  const [focused, setFocused] = useState(false);
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
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      setText(props.value);
      props.onBlur();
    },
  };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground text-[12px] font-normal">
        {props.label}
      </Label>
      {props.multiline ? (
        <Textarea rows={3} {...common} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input {...common} className="h-8 text-[13px]" onChange={(e) => change(e.target.value)} />
      )}
    </div>
  );
}
