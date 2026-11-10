import type { ReactNode } from "react";
import { usePlatform } from "./hooks.ts";
import { cn } from "./lib/utils.ts";

/** Whether the app draws its own title bar under the macOS traffic lights (overlay style, D92). */
const hasOverlayTitleBar = (kind: string) => kind === "tauri" && /Mac/i.test(navigator.userAgent);

/**
 * The window's top bar. In the macOS app it is the title bar itself: dragging it
 * moves the window, double-clicking zooms, and it leaves room for the traffic lights.
 */
export function TitleBar({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const overlay = hasOverlayTitleBar(platform.kind);
  return (
    <header
      data-tauri-drag-region={overlay ? "" : undefined}
      className={cn("bg-panel flex h-10 shrink-0 items-center gap-3 border-b px-3", overlay && "pl-[78px]")}
    >
      {children}
    </header>
  );
}
