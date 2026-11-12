import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// Player UI layout: every control is at least 44 CSS px after
// scaling. The UI draws in the 640×400 back buffer, so sizes are computed from how
// many CSS px one scene px covers right now. Pure; tested in Node.

/** Spec 06 minimum hit size. */
export const MIN_HIT_CSS = 44;
/** Design size of a control in scene px when the screen is big enough. */
const DESIGN_UNIT = 32;
const GAP = 4;

/** Side of a square control in scene px at `cssScale` CSS px per scene px. */
export const unitFor = (cssScale: number) => Math.max(DESIGN_UNIT, Math.ceil(MIN_HIT_CSS / cssScale));

type BarButtonId = "walk" | "look" | "hand" | "talk" | "item" | "inventory" | "settings";
const BAR_BUTTONS: readonly BarButtonId[] = ["walk", "look", "hand", "talk", "item", "inventory", "settings"];
export type InventoryButtonId = "look" | "select" | "item" | "ok";
type SettingsButtonId = "restart" | "save" | "load" | "volume" | "textsize" | "close";
type SlotsButtonId = "act" | "more" | "cancel";
type VolumeButtonId = "music_down" | "music_up" | "sfx_down" | "sfx_up" | "ok";
type TextSizeButtonId = "size_down" | "size_up" | "ok";
type EndingButtonId = "restore" | "restart" | "try_again";

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
  /** Touch tab: drawn small, hit area full size. */
  tab: { hit: Rect; visual: Rect };
  inventory: { panel: Rect; cells: Rect[]; buttons: Button<InventoryButtonId>[] };
  settings: { panel: Rect; buttons: Button<SettingsButtonId>[] };
  /** Save / load list: slot rows on one page, then Save or Load, More…, Cancel. */
  slots: { panel: Rect; rows: Rect[]; perPage: number; pages: number; buttons: Button<SlotsButtonId>[] };
  /** Music and sound-effect volume: a bar between − and + for each. */
  volume: { panel: Rect; music: Rect; sfx: Rect; labelX: number; buttons: Button<VolumeButtonId>[] };
  /** Text size: a value between − and +. */
  textSize: { panel: Rect; value: Rect; labelX: number; buttons: Button<TextSizeButtonId>[] };
  /** The death / win box: message, then Restore · Restart · Try again (death only). */
  ending: { panel: Rect; message: Rect; buttons: Button<EndingButtonId>[]; win: Button<EndingButtonId>[] };
  /** Short notices ("Game saved."), at the bottom centre. */
  notice: { x: number; y: number };
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
  const sIds = ["restart", "save", "load", "volume", "textsize", "close"] as const;
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

  // Save / load slots: two columns of rows, paged when they don't all fit.
  const slotCount = 10;
  const slotsW = Math.min(SCENE_WIDTH - GAP * 4, 600);
  const rowsFit = Math.max(1, Math.floor((SCENE_HEIGHT - GAP * 4 - title - pad * 3 - u + GAP) / (u + GAP)));
  const perCol = Math.min(Math.ceil(slotCount / 2), rowsFit);
  const perPage = perCol * 2;
  const pages = Math.ceil(slotCount / perPage);
  const slotsPanel = centered(slotsW, title + pad * 3 + perCol * (u + GAP) - GAP + u);
  const colW = Math.floor((slotsW - pad * 2 - GAP) / 2);
  const slotRows: Rect[] = [];
  for (let i = 0; i < perPage; i++) {
    const col = Math.floor(i / perCol);
    slotRows.push({ x: slotsPanel.x + pad + col * (colW + GAP), y: slotsPanel.y + pad + title + (i % perCol) * (u + GAP), w: colW, h: u });
  }
  const slotBtnW = Math.max(u * 2.5, 96);
  const slotBtnY = slotsPanel.y + slotsPanel.h - pad - u;
  const slotButtons = row(pages > 1 ? (["act", "more", "cancel"] as const) : (["act", "cancel"] as const), slotsPanel, slotBtnY, slotBtnW, u);

  // Volume: "Music  [−] ▮▮▮▯▯ [+]" and the same for sound effects, then OK.
  const labelW = 110;
  const barW = 120;
  const volW = pad * 2 + labelW + u + GAP + barW + GAP + u;
  const volPanel = centered(volW, title + pad * 3 + 2 * (u + GAP) - GAP + u);
  const volRow = (i: number) => volPanel.y + pad + title + i * (u + GAP);
  const minusX = volPanel.x + pad + labelW;
  const barX = minusX + u + GAP;
  const plusX = barX + barW + GAP;
  const volButtons: Button<VolumeButtonId>[] = [
    { id: "music_down", rect: { x: minusX, y: volRow(0), w: u, h: u } },
    { id: "music_up", rect: { x: plusX, y: volRow(0), w: u, h: u } },
    { id: "sfx_down", rect: { x: minusX, y: volRow(1), w: u, h: u } },
    { id: "sfx_up", rect: { x: plusX, y: volRow(1), w: u, h: u } },
    ...row(["ok"] as const, volPanel, volPanel.y + volPanel.h - pad - u, Math.max(u * 2, 64), u),
  ];

  // Text size: "Text size  [−] 100% [+]", then OK.
  const sizeValueW = 72;
  const sizePanel = centered(pad * 2 + labelW + u + GAP + sizeValueW + GAP + u, title + pad * 3 + (u + GAP) - GAP + u);
  const sizeY = sizePanel.y + pad + title;
  const sizeMinusX = sizePanel.x + pad + labelW;
  const sizeValueX = sizeMinusX + u + GAP;
  const sizeButtons: Button<TextSizeButtonId>[] = [
    { id: "size_down", rect: { x: sizeMinusX, y: sizeY, w: u, h: u } },
    { id: "size_up", rect: { x: sizeValueX + sizeValueW + GAP, y: sizeY, w: u, h: u } },
    ...row(["ok"] as const, sizePanel, sizePanel.y + sizePanel.h - pad - u, Math.max(u * 2, 64), u),
  ];

  // Ending: message area, then a row of buttons.
  const eBtnW = Math.max(Math.round(u * 2.5), 100);
  const ePanel = centered(Math.max(380, eBtnW * 3 + GAP * 2 + pad * 2), 120 + u);
  const eBtnY = ePanel.y + ePanel.h - pad - u;
  const message: Rect = { x: ePanel.x + pad, y: ePanel.y + pad + title + GAP, w: ePanel.w - pad * 2, h: eBtnY - (ePanel.y + pad + title + GAP) - GAP };

  return {
    unit: u,
    bar,
    barButtons,
    score,
    tab,
    inventory: { panel, cells, buttons: invButtons },
    settings: { panel: sPanel, buttons: sButtons },
    slots: { panel: slotsPanel, rows: slotRows, perPage, pages, buttons: slotButtons },
    volume: { panel: volPanel, music: { x: barX, y: volRow(0), w: barW, h: u }, sfx: { x: barX, y: volRow(1), w: barW, h: u }, labelX: volPanel.x + pad, buttons: volButtons },
    textSize: { panel: sizePanel, value: { x: sizeValueX, y: sizeY, w: sizeValueW, h: u }, labelX: sizePanel.x + pad, buttons: sizeButtons },
    ending: {
      panel: ePanel,
      message,
      buttons: row(["restore", "restart", "try_again"] as const, ePanel, eBtnY, eBtnW, u),
      win: row(["restore", "restart"] as const, ePanel, eBtnY, eBtnW, u),
    },
    notice: { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT - GAP * 2 - 10 },
  };
}

export const inRect = (p: readonly [number, number], r: Rect) => p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h;

export function hitButton<Id extends string>(buttons: readonly Button<Id>[], p: readonly [number, number]): Id | null {
  return buttons.find((b) => inRect(p, b.rect))?.id ?? null;
}

/** The dialogue list box: one full-width row per option, at least 44 CSS px tall. */
export interface ChoiceBox {
  panel: Rect;
  /** One per option shown on this page, top to bottom. */
  rows: Rect[];
  /** Index of this page's first option. */
  first: number;
  /** "More…" when the options don't fit at once; it shows the next page. */
  more: Rect | null;
  pages: number;
}

const CHOICE_WIDTH = 560;

export function choiceLayout(unit: number, count: number, page: number): ChoiceBox {
  const pad = GAP * 2;
  const fit = Math.max(2, Math.floor((SCENE_HEIGHT - GAP * 4 - pad * 2 + GAP) / (unit + GAP)));
  const perPage = count <= fit ? count : fit - 1;
  const pages = Math.max(1, Math.ceil(count / Math.max(1, perPage)));
  const p = ((page % pages) + pages) % pages;
  const first = p * perPage;
  const shown = Math.min(perPage, count - first);
  const lines = shown + (pages > 1 ? 1 : 0);
  const h = pad * 2 + lines * (unit + GAP) - GAP;
  const panel: Rect = { x: Math.round((SCENE_WIDTH - CHOICE_WIDTH) / 2), y: SCENE_HEIGHT - GAP * 2 - h, w: CHOICE_WIDTH, h };
  const row = (i: number): Rect => ({ x: panel.x + pad, y: panel.y + pad + i * (unit + GAP), w: panel.w - pad * 2, h: unit });
  return { panel, rows: Array.from({ length: shown }, (_, i) => row(i)), first, more: pages > 1 ? row(shown) : null, pages };
}
