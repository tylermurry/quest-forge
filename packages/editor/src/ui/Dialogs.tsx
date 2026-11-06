import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DeleteWarning } from "../model/actions.ts";

function Modal({ title, children, onCancel }: { title: string; children: ReactNode; onCancel(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Delete warning with Cancel / Delete anyway (spec 08, D86). */
export function ConfirmDelete({ warning, onConfirm, onCancel }: { warning: DeleteWarning; onConfirm(): void; onCancel(): void }) {
  return (
    <Modal title={warning.title} onCancel={onCancel}>
      <p>{warning.summary}.</p>
      {warning.lines.length > 0 && (
        <ul className="refs">
          {warning.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {warning.lines.length > 0 && <p className="muted">Deleting it leaves these pointing at nothing; they'll show up as problems to fix.</p>}
      <div className="row end">
        <button autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button className="danger" onClick={onConfirm}>
          Delete anyway
        </button>
      </div>
    </Modal>
  );
}

/** Asks for one line of text, e.g. "Change ID…". */
export function Prompt(props: { title: string; label: string; initial: string; hint?: (value: string) => string; action: string; onSubmit(value: string): void; onCancel(): void }) {
  const [value, setValue] = useState(props.initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  return (
    <Modal title={props.title} onCancel={props.onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(value);
        }}
      >
        <label className="field">
          {props.label}
          <input ref={input} aria-label={props.label} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        {props.hint && <p className="muted">{props.hint(value)}</p>}
        <div className="row end">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit">{props.action}</button>
        </div>
      </form>
    </Modal>
  );
}

export interface MenuItem {
  label: string;
  onSelect(): void;
  disabled?: boolean;
}

/** A small popup menu at a point (context menu or "⋯" button). */
export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose(): void }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  return (
    <ul className="menu" role="menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <li key={it.label}>
          <button
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
