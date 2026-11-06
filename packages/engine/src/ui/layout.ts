import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// Player UI layout (spec 06, D76): every control is at least 44 CSS px after
// scaling. The UI draws in the 640×400 back buffer, so sizes are computed from how
// many CSS px one scene px covers right now. Pure; tested in Node.

/** Spec 06 minimum hit size. */
export const MIN_HIT_CSS = 44;
/** Design size of a control in scene px when the screen is big enough (D76). */
export const DESIGN_UNIT = 32;
const GAP = 4;

/** Side of a square control in scene px at `cssScale` CSS px per scene px. */
export const unitFor = (cssScale: number) => Math.max(DESIGN_UNIT, Math.ceil(MIN_HIT_CSS / cssScale));

export type BarButtonId = "walk" | "look" | "hand" | "talk" | "item" | "inventory" | "settings";
export const BAR_BUTTONS: readonly BarButtonId[] = ["walk", "look", "hand", "talk", "item", "inventory", "settings"];
export type InventoryButtonId = "look" | "select" | "item" | "ok";
export type SettingsButtonId = "restart" | "save" | "load" | "volume" | "close";

export interface Button<Id extends string = string> {
  id: Id;
  rect: Rect;
}

export interface Layout {
  /** Control size in scene px. */
  unit: number;
  bar: Rect;
  barButtons: Button<BarButtonId>[];
  /** Right edge of the score text, vertically centered in the bar. */
  score: { x: number; y: number };
  /** Touch tab (D79): drawn small, hit area full size. */
  tab: { hit: Rect; visual: Rect };
  inventory: { panel: Rect; cells: Rect[]; buttons: Button<InventoryButtonId>[] };
  settings: { panel: Rect; buttons: Button<SettingsButtonId>[] };
  ending: { panel: Rect; restart: Rect };
}

const centered = (w: number, h: number): Rect => ({ x: Math.round((SCENE_WIDTH - w) / 2), y: Math.round((SCENE_HEIGHT - h) / 2), w, h });

/** A row of buttons of width `w` each, centered in `panel` at `y`. */
function row<Id extends string>(ids: readonly Id[], panel: Rect, y: number, w: number, h: number): Button<Id>[] {
  const total = ids.length * w + (ids.length - 1) * GAP;
  const x0 = panel.x + Math.round((panel.w - total) / 2);
  return ids.map((id, i) => ({ id, rect: { x: x0 + i * (w + GAP), y, w, h } }));
}

export function computeLayout(cssScale: number): Layout {
  const u = unitFor(cssScale);

  // Icon bar across the top.
  const bar: Rect = { x: 0, y: 0, w: SCENE_WIDTH, h: u + GAP * 2 };
  const barButtons = BAR_BUTTONS.map((id, i) => ({ id, rect: { x: GAP + i * (u + GAP), y: GAP, w: u, h: u } }));
  const score = { x: SCENE_WIDTH - GAP * 2, y: bar.h / 2 };

  // Tab at top center: a small visible handle with a full-size hit area.
  const tabW = Math.max(u, 48);
  const tab = {
    hit: { x: Math.round((SCENE_WIDTH - tabW) / 2), y: 0, w: tabW, h: u },
    visual: { x: Math.round((SCENE_WIDTH - tabW) / 2), y: 0, w: tabW, h: 12 },
  };

  // Inventory: a grid of cells, then Look / Select / item / OK.
  const panelW = Math.min(SCENE_WIDTH - GAP * 4, 600);
  const pad = GAP * 2;
  const title = 16;
  const cols = Math.max(1, Math.floor((panelW - pad * 2 + GAP) / (u + GAP)));
  const maxRows = Math.max(1, Math.floor((SCENE_HEIGHT - GAP * 4 - title - pad * 3 - u + GAP) / (u + GAP)));
  const rows = Math.min(maxRows, 3);
  const gridW = cols * (u + GAP) - GAP;
  const panelH = title + pad * 3 + rows * (u + GAP) - GAP + u;
  const panel = centered(panelW, panelH);
  const gx = panel.x + Math.round((panel.w - gridW) / 2);
  const gy = panel.y + pad + title;
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: gx + c * (u + GAP), y: gy + r * (u + GAP), w: u, h: u });
  const btnY = gy + rows * (u + GAP) - GAP + pad;
  const invButtons = row(["look", "select", "item", "ok"] as const, panel, btnY, Math.max(u, 64), u);

  // Settings: one column of wide buttons.
  const sIds = ["restart", "save", "load", "volume", "close"] as const;
  const sBtnW = Math.max(u * 4, 160);
  const sPanelH = Math.min(SCENE_HEIGHT - GAP * 4, title + pad * 2 + sIds.length * (u + GAP) - GAP);
  const sPanel = centered(sBtnW + pad * 2, sPanelH);
  const sButtons = sIds.map((id, i) => ({ id, rect: { x: sPanel.x + pad, y: sPanel.y + pad + title + i * (u + GAP), w: sBtnW, h: u } }));
  // On short screens two columns keep everything on screen.
  if (sButtons.at(-1)!.rect.y + u > SCENE_HEIGHT - GAP) {
    const half = Math.ceil(sIds.length / 2);
    const w2 = sBtnW;
    sPanel.w = w2 * 2 + GAP + pad * 2;
    sPanel.x = Math.round((SCENE_WIDTH - sPanel.w) / 2);
    sPanel.h = title + pad * 2 + half * (u + GAP) - GAP;
    sPanel.y = Math.round((SCENE_HEIGHT - sPanel.h) / 2);
    sButtons.forEach((b, i) => {
      b.rect = { x: sPanel.x + pad + Math.floor(i / half) * (w2 + GAP), y: sPanel.y + pad + title + (i % half) * (u + GAP), w: w2, h: u };
    });
  }

  // Ending (D71 stand-in for the M8 death box): message area plus Restart.
  const ePanel = centered(380, 120 + u);
  const restart = { x: Math.round((SCENE_WIDTH - Math.max(u * 3, 120)) / 2), y: ePanel.y + ePanel.h - pad - u, w: Math.max(u * 3, 120), h: u };

  return {
    unit: u,
    bar,
    barButtons,
    score,
    tab,
    inventory: { panel, cells, buttons: invButtons },
    settings: { panel: sPanel, buttons: sButtons },
    ending: { panel: ePanel, restart },
  };
}

export const inRect = (p: readonly [number, number], r: Rect) => p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h;

export function hitButton<Id extends string>(buttons: readonly Button<Id>[], p: readonly [number, number]): Id | null {
  return buttons.find((b) => inRect(p, b.rect))?.id ?? null;
}
