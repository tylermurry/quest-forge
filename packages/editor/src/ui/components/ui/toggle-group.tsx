import * as React from "react"
import { cn } from "@/ui/lib/utils"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

/** A row of buttons where one or more are on; Radix Toggle Group in a segmented-control look. */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("bg-muted inline-flex w-fit flex-wrap items-center gap-0.5 rounded-md p-0.5", className)}
      {...props}
    />
  )
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-6 items-center justify-center gap-1 rounded-[5px] px-2.5 text-[12px] whitespace-nowrap outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:font-semibold data-[state=on]:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

/**
 * One choice from a few, as a toggle bar: always exactly one on (clicking the one that is on keeps it on).
 * `label` names the group for assistive technology.
 */
function ToggleBar<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange(value: T): void
  className?: string
}) {
  return (
    <ToggleGroup type="single" aria-label={label} value={value} onValueChange={(v) => v && onChange(v as T)} className={className}>
      {options.map((o) => (
        <ToggleGroupItem key={o.id} value={o.id}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export { ToggleBar, ToggleGroup, ToggleGroupItem }
