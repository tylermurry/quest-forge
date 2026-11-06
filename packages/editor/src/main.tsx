import { createRoot } from "react-dom/client";
import { browserPlatform } from "./platform/browser.ts";
import type { Platform } from "./platform/platform.ts";
import { App } from "./ui/App.tsx";
import { PlatformContext } from "./ui/hooks.ts";
import "./ui/styles.css";

async function pickPlatform(): Promise<Platform> {
  if ("__TAURI_INTERNALS__" in window) return (await import("./platform/tauri.ts")).tauriPlatform;
  return browserPlatform;
}

const platform = await pickPlatform();
createRoot(document.getElementById("root")!).render(
  <PlatformContext.Provider value={platform}>
    <App />
  </PlatformContext.Provider>,
);
