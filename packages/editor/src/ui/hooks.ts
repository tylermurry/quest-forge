import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { commandForKey, type CommandRegistry } from "../model/appCommands.ts";
import type { Editor } from "../model/editor.ts";
import type { Platform } from "../platform/platform.ts";

export const PlatformContext = createContext<Platform | null>(null);

export function usePlatform(): Platform {
  const p = useContext(PlatformContext);
  if (!p) throw new Error("No platform");
  return p;
}

/** Re-renders whenever the editor changes. */
export function useEditor(editor: Editor): Editor {
  useSyncExternalStore(editor.subscribe, () => editor.version);
  return editor;
}

export const CommandsContext = createContext<CommandRegistry | null>(null);

export function useCommands(): CommandRegistry {
  const c = useContext(CommandsContext);
  if (!c) throw new Error("No command registry");
  return c;
}

/** True when keyboard focus is in something that edits text. */
export function inTextField(el: Element | null = document.activeElement): boolean {
  const h = el as HTMLElement | null;
  return !!h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.isContentEditable);
}

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Runs registry commands from key presses (the dev page; the app's native menu owns them there). */
export function useShortcutKeys(registry: CommandRegistry, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const id = commandForKey(e, isMac(), inTextField(e.target as Element));
      if (id && registry.run(id)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registry, enabled]);
}
