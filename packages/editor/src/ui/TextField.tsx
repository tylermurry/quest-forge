import { useEffect, useState } from "react";

/**
 * A text field that edits project data as you type. Every keystroke within a
 * second is one undo step; leaving the field ends the step (D84). Invalid values
 * (e.g. empty) stay in the box without being applied.
 */
export function TextField(props: { label: string; value: string; multiline?: boolean; onChange(value: string): void; onBlur(): void; valid?(v: string): boolean }) {
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
    "aria-label": props.label,
    value: text,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      setText(props.value);
      props.onBlur();
    },
  };
  return (
    <label className="field">
      <span className="muted">{props.label}</span>
      {props.multiline ? <textarea rows={3} {...common} onChange={(e) => change(e.target.value)} /> : <input {...common} onChange={(e) => change(e.target.value)} />}
    </label>
  );
}
