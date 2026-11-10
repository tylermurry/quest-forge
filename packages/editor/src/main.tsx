import { createRoot } from "react-dom/client";
import { browserPlatform } from "./platform/browser.ts";
import type { Platform } from "./platform/platform.ts";
import { App } from "./ui/App.tsx";
import { Toaster } from "./ui/components/ui/sonner.tsx";
import { PlatformContext } from "./ui/hooks.ts";
import "./ui/styles.css";

async function pickPlatform(): Promise<Platform> {
  if ("__TAURI_INTERNALS__" in window) return (await import("./platform/tauri.ts")).tauriPlatform;
  return browserPlatform;
}

const platform = await pickPlatform();
document.documentElement.dataset.platform = platform.kind;
// No browser right-click menu outside text fields: the editor has its own.
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (!t?.closest("input, textarea, [contenteditable=true]")) e.preventDefault();
});
createRoot(document.getElementById("root")!).render(
  <PlatformContext.Provider value={platform}>
    <App />
    <Toaster position="bottom-right" />
  </PlatformContext.Provider>,
);
