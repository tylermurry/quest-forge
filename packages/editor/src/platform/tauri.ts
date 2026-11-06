// Tauri platform (D90). Filled in with the Tauri shell ticket.
import { browserPlatform } from "./browser.ts";
import type { Platform } from "./platform.ts";

export const tauriPlatform: Platform = { ...browserPlatform, kind: "tauri" };
