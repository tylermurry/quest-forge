import { createContext, useContext, useSyncExternalStore } from "react";
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
