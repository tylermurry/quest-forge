import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The look of a section header row: small, muted, upper-case. The row itself adds height, padding and hover. */
export const SECTION_HEADING = "text-muted-foreground text-[11px] font-semibold tracking-wider uppercase";

/**
 * The inside of a section header, shared by the Project Browser's sections and the scene editor's layers: a
 * chevron that opens and closes the section (only with `toggle`; the layers have none), the section's icon, its
 * title and any buttons after it. `title` is text, or a control when clicking the title does something of its own
 * (choosing a layer).
 */
export function SectionHeading(props: { toggle?: { open: boolean; onToggle(): void }; name: string; icon: LucideIcon; title: ReactNode; children?: ReactNode }) {
  const Icon = props.icon;
  const toggle = props.toggle;
  return (
    <>
      {toggle && (
      <button
        type="button"
        className="flex size-4 shrink-0 items-center justify-center"
        aria-label={toggle.open ? `Collapse ${props.name}` : `Expand ${props.name}`}
        aria-expanded={toggle.open}
        onClick={(e) => (e.stopPropagation(), toggle.onToggle())}
      >
        {toggle.open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      )}
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 truncate">{props.title}</span>
      {props.children}
    </>
  );
}
