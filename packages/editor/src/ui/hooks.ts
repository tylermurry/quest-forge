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
function inTextField(el: Element | null = document.activeElement): boolean {
  const h = el as HTMLElement | null;
  return !!h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.isContentEditable);
}

/** True when the event comes from the playtest game, which keeps plain keys to itself. */
function inPlaytestGame(el: Element | null): boolean {
  return !!el?.closest?.("[data-playtest-game]");
}

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Runs registry commands from key presses. With a native menu (the app) only plain
 * shortcuts are handled here; the menu's accelerators own the rest.
 */
export function useShortcutKeys(registry: CommandRegistry, nativeMenu = false) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.key !== "Backspace") return;
      const target = e.target as Element;
      const id = commandForKey(e, isMac(), inTextField(target), { plainOnly: nativeMenu, inGame: inPlaytestGame(target) });
      if (id && registry.run(id)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registry, nativeMenu]);
}
