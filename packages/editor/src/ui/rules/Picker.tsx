import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import type { PickOption } from "../../model/rules/pickers.ts";
import { Button } from "../components/ui/button.tsx";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.tsx";
import { Prompt } from "../Dialogs.tsx";
import { cn } from "../lib/utils.ts";

/**
 * A searchable picker over existing IDs (spec 10, D123). A value that no longer
 * exists stays shown as "(missing)" in red; "+ Create new…" asks for a name and
 * hands it back, and the caller creates and uses it in one undo step.
 */
export function Picker(props: {
  label: string;
  value: string;
  options: PickOption[];
  onPick(id: string): void;
  /** Noun for "+ Create new …"; absent when this kind can't be made here. */
  createNoun?: string;
  onCreate?(name: string): void;
  invalid?: boolean;
  /** Shown while `value` is "" (an "add" picker with nothing chosen), instead of "(missing)". */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const current = props.options.find((o) => o.id === props.value);
  const empty = props.value === "" && props.placeholder !== undefined;
  const missing = !current && !empty;
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label={props.label}
            aria-invalid={missing || props.invalid || undefined}
            className={cn("h-7 max-w-full min-w-0 justify-between gap-1 px-2 text-[13px] font-normal", (missing || props.invalid) && "border-err text-err")}
          >
            <span className={cn("truncate", empty && "text-muted-foreground")}>{current ? current.label : empty ? props.placeholder : `${props.value} (missing)`}</span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-60 p-0"
          align="start"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          // Focus the search box without scrolling the window: the content isn't positioned yet.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.querySelector("input")?.focus({ preventScroll: true });
          }}
        >
          <Command>
            <CommandInput placeholder={`Search ${props.label.toLowerCase()}…`} className="h-8 text-[13px]" />
            <CommandList>
              <CommandEmpty>Nothing matches.</CommandEmpty>
              <CommandGroup>
                {props.options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.label} ${o.id}`}
                    onSelect={() => {
                      setOpen(false);
                      if (o.id !== props.value) props.onPick(o.id);
                    }}
                    className="text-[13px]"
                  >
                    <Check className={cn("size-3.5", o.id === props.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              {props.createNoun && props.onCreate && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__create"
                      forceMount
                      onSelect={() => {
                        setOpen(false);
                        setCreating("");
                      }}
                      className="text-[13px]"
                    >
                      <Plus className="size-3.5" />
                      Create new {props.createNoun}…
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {creating !== null && props.onCreate && (
        <Prompt
          title={`New ${props.createNoun}`}
          label="Name"
          initial=""
          action="Create"
          onCancel={() => setCreating(null)}
          onSubmit={(name) => {
            setCreating(null);
            props.onCreate!(name);
          }}
        />
      )}
    </>
  );
}
