// Hide all side panels (Ctrl+\): the first press hides the project browser,
// the inspector and the Problems dock; the next shows the ones that were showing.

export type PanelName = "browser" | "inspector" | "dock";
const PANELS: readonly PanelName[] = ["browser", "inspector", "dock"];

export type PanelsShown = Record<PanelName, boolean>;

export interface PanelsToggle {
  /** What to show afterwards. */
  shown: PanelsShown;
  /** The panels to bring back on the next press, or null when nothing is hidden by it. */
  saved: PanelName[] | null;
}

/**
 * One press. With any panel showing, hides them all and remembers which were up.
 * With none showing, brings back the remembered ones (all of them if nothing was
 * remembered, e.g. they were hidden one by one).
 */
export function togglePanels(shown: PanelsShown, saved: PanelName[] | null): PanelsToggle {
  const up = PANELS.filter((p) => shown[p]);
  if (up.length > 0) return { shown: { browser: false, inspector: false, dock: false }, saved: up };
  const back = saved && saved.length > 0 ? saved : PANELS;
  return { shown: { browser: back.includes("browser"), inspector: back.includes("inspector"), dock: back.includes("dock") }, saved: null };
}

/**
 * What to do with the Inspector when the Game Settings tab is left. The tab hides the Inspector
 * only if it was up (`hiddenByTab`); a hide-all (Ctrl+\) done during the tab keeps it hidden,
 * and while a game plays it comes back with the play's other panels.
 */
export function inspectorOnLeavingGame(hiddenByTab: boolean, hideAllDuringTab: boolean, playing: boolean): "leave" | "expand" | "expand after play" | "stay hidden" {
  if (!hiddenByTab) return "leave";
  if (hideAllDuringTab) return "stay hidden";
  return playing ? "expand after play" : "expand";
}
