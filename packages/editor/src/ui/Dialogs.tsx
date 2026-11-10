import { useState, type ComponentType, type ReactNode } from "react";
import type { DeleteWarning } from "../model/actions.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog.tsx";
import { Button } from "./components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog.tsx";
import { Input } from "./components/ui/input.tsx";
import { Label } from "./components/ui/label.tsx";

/** Delete warning with Cancel / Delete anyway. */
export function ConfirmDelete({ warning, onConfirm, onCancel }: { warning: DeleteWarning; onConfirm(): void; onCancel(): void }) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px]">{warning.title}</AlertDialogTitle>
          <AlertDialogDescription>{warning.summary}.</AlertDialogDescription>
        </AlertDialogHeader>
        {warning.lines.length > 0 && (
          <>
            <ul className="max-h-48 list-disc overflow-auto pl-5 text-[13px]">
              {warning.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <p className="text-muted-foreground text-[12px]">Deleting it leaves these pointing at nothing; they'll show up as problems to fix.</p>
          </>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" autoFocus>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction size="sm" className="bg-destructive hover:bg-destructive/90 text-white" onClick={onConfirm}>
            Delete anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Asks for one line of text, e.g. "Change ID…". */
export function Prompt(props: {
  title: string;
  label: string;
  initial: string;
  hint?: (value: string) => string;
  action: string;
  onSubmit(value: string): void;
  onCancel(): void;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => (e.preventDefault(), document.getElementById("prompt-input")?.focus())}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(value);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">{props.title}</DialogTitle>
            <DialogDescription>{props.hint?.(value) ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-input">{props.label}</Label>
            <Input
              id="prompt-input"
              aria-label={props.label}
              value={value}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {props.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface MenuItem {
  label: string;
  onSelect(): void;
  disabled?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
  destructive?: boolean;
}

/** The pieces a menu is built from: lets one item list render as a context menu or a dropdown. */
export interface MenuParts {
  Item: ComponentType<{ children: ReactNode; disabled?: boolean; variant?: "default" | "destructive"; onSelect?(e: Event): void }>;
  Separator: ComponentType;
}

export function MenuItems({ items, parts }: { items: MenuItem[]; parts: MenuParts }) {
  const { Item, Separator } = parts;
  return (
    <>
      {items.map((it) => (
        <span key={it.label} className="contents">
          {it.separated && <Separator />}
          <Item disabled={it.disabled} variant={it.destructive ? "destructive" : "default"} onSelect={() => it.onSelect()}>
            {it.label}
          </Item>
        </span>
      ))}
    </>
  );
}
