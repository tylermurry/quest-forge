import type { FlashTone } from "../model/workspace.ts";

/** Restarts the jump-to flash on an element: red for a problem, blue for a playtest log line (D120). */
export function flashElement(el: HTMLElement | null | undefined, tone: FlashTone) {
  if (!el) return;
  el.classList.remove("qf-flash", "qf-flash-log");
  void el.offsetWidth;
  el.classList.add(tone === "log" ? "qf-flash-log" : "qf-flash");
}
