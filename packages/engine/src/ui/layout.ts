import { SCENE_HEIGHT, SCENE_WIDTH, resolveStyle, type EffectiveStyle, type FrameInsets, type GameStyle } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// Player UI layout: every control is at least 44 CSS px after
// scaling. The UI draws in the 640×400 back buffer, so sizes are computed from how
// many CSS px one scene px covers right now. Pure; tested in Node.

/** Spec 06 minimum hit size. */
export const MIN_HIT_CSS = 44;
/** Design size of a control in scene px when the screen is big enough. */
const DESIGN_UNIT = 32;
const GAP = 4;
/** The room the fixed panels (inventory, settings, slots, volume, text size, ending) leave between their edge and their content. */
export const PANEL_PAD = GAP * 2;

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

/**
 * Where the creator put the panels in Game Settings > Styling > Frames > Position: `top` game pixels down (or
 * `center`), `width` percent of the screen wide. Narration, speech, the dialogue choices and the inventory use it.
 */
export type Placement = EffectiveStyle["narration"];

/** The game's panel placement, or null when `game.yaml` has no `narration` section: the legacy layout. */
export const placementOf = (style: GameStyle | undefined): Placement | null => (style?.narration ? resolveStyle(style).narration : null);

/** A placement's panel width in game pixels. */
export const placementWidth = (p: Placement) => Math.round((SCENE_WIDTH * p.width) / 100);

/** A `w` × `h` panel at a placement: centred across, `top` down or in the middle, and kept on the screen. */
export function placeAt(p: Placement, w: number, h: number): Rect {
  const wanted = p.top === "center" ? (SCENE_HEIGHT - h) / 2 : p.top;
  return { x: Math.round((SCENE_WIDTH - w) / 2), y: Math.max(0, Math.min(SCENE_HEIGHT - h, Math.round(wanted))), w, h };
}

const centered = (w: number, h: number): Rect => ({ x: Math.round((SCENE_WIDTH - w) / 2), y: Math.round((SCENE_HEIGHT - h) / 2), w, h });

/** A row of buttons of width `w` each, centered in `panel` at `y`. */
function row<Id extends string>(ids: readonly Id[], panel: Rect, y: number, w: number, h: number): Button<Id>[] {
  const total = ids.length * w + (ids.length - 1) * GAP;
  const x0 = panel.x + Math.round((panel.w - total) / 2);
  return ids.map((id, i) => ({ id, rect: { x: x0 + i * (w + GAP), y, w, h } }));
}

/**
 * `placement`: where the creator put the panels (`placementOf`); the inventory goes there, as wide as it says but
 * never narrower than its buttons need. Null keeps the legacy centred 600-pixel inventory.
 */
export function computeLayout(cssScale: number, placement: Placement | null = null): Layout {
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
  const pad = PANEL_PAD;
  const invBtnW = Math.max(u, 64);
  const invIds = ["look", "select", "item", "ok"] as const;
  const panelW = placement
    ? Math.min(SCENE_WIDTH, Math.max(placementWidth(placement), invIds.length * (invBtnW + GAP) - GAP + pad * 2))
    : Math.min(SCENE_WIDTH - GAP * 4, 600);
  const title = 16;
  const cols = Math.max(1, Math.floor((panelW - pad * 2 + GAP) / (u + GAP)));
  const maxRows = Math.max(1, Math.floor((SCENE_HEIGHT - GAP * 4 - title - pad * 3 - u + GAP) / (u + GAP)));
  const rows = Math.min(maxRows, 3);
  const gridW = cols * (u + GAP) - GAP;
  const panelH = title + pad * 3 + rows * (u + GAP) - GAP + u;
  const panel = placement ? placeAt(placement, panelW, panelH) : centered(panelW, panelH);
  const gx = panel.x + Math.round((panel.w - gridW) / 2);
  const gy = panel.y + pad + title;
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: gx + c * (u + GAP), y: gy + r * (u + GAP), w: u, h: u });
  const btnY = gy + rows * (u + GAP) - GAP + pad;
  const invButtons = row(invIds, panel, btnY, invBtnW, u);

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

/**
 * Where an image of `size` is drawn to fit inside `box` without changing its proportions: scaled by one
 * factor, centred, on whole pixels. Smaller images are enlarged to fit too.
 */
export function fitInside(size: { width: number; height: number }, box: Rect): Rect {
  const k = Math.min(box.w / size.width, box.h / size.height);
  return { x: Math.round(box.x + (box.w - size.width * k) / 2), y: Math.round(box.y + (box.h - size.height * k) / 2), w: size.width * k, h: size.height * k };
}

export function hitButton<Id extends string>(buttons: readonly Button<Id>[], p: readonly [number, number]): Id | null {
  return buttons.find((b) => inRect(p, b.rect))?.id ?? null;
}

/** The dialogue list box: one full-width row per option, at least 44 CSS px tall. */
export interface ChoiceBox {
  panel: Rect;
  /** The area inside the shared frame's borders, where the separator line goes. Absent: the whole panel. */
  inner?: Rect;
  /** What the node asks, above the separator, inside the panel. Absent only in the Styling preview, which lays the question out itself. */
  question?: ChoiceQuestionBox;
  /** One per option shown on this page, top to bottom. */
  rows: Rect[];
  /** Index of this page's first option. */
  first: number;
  /** "More…" when the options don't fit at once; it shows the next page. */
  more: Rect | null;
  pages: number;
}

/** A choice box's question, laid out: the speaker's name (absent for narration) and the text lines, at one size. */
export interface ChoiceQuestionLayout {
  name: string | null;
  lines: string[];
  /** The text size the question was laid out at, and the distance between its lines. */
  size: number;
  line: number;
  /** Room above the first line (the box's padding when it has no frame), included in `height`. */
  pad: number;
  /** Everything above the separator's own room: `pad`, the name line with its gap, and the lines. */
  height: number;
}

/** A laid out question placed in a box: `x` is the middle of the text area, `y` the top of the first line (the name's, when there is one). */
export interface ChoiceQuestionBox extends ChoiceQuestionLayout {
  x: number;
  y: number;
}

const CHOICE_WIDTH = 560;

/** The separator line's thickness. */
const SEPARATOR_THICKNESS = 2;
/** The room above and below the separator line. */
export const SEPARATOR_SPACE = 8;
/** How far the separator reaches past the rows on each side. */
const SEPARATOR_REACH = 4;
/** The gap between a choice row's edge and its text. */
export const CHOICE_TEXT_INSET = 12;

/** The space above the first row: the separator line with room above and below it. */
export const CHOICE_TOP = SEPARATOR_SPACE * 2 + SEPARATOR_THICKNESS;

/** The separator line at the top of the choices region, a little wider than the rows. */
export function separatorRect(box: ChoiceBox): Rect {
  const inset = GAP * 2 - SEPARATOR_REACH;
  const area = box.inner ?? box.panel;
  return { x: area.x + inset, y: area.y + (box.question?.height ?? 0) + SEPARATOR_SPACE, w: area.w - inset * 2, h: SEPARATOR_THICKNESS };
}

/**
 * Rows touch, so the pointer never falls between two answers and the hover moves straight from one to the next.
 * `placement`: where the creator put the panels (`placementOf`); null keeps the legacy 560-pixel box at the bottom.
 * `borders`: the shared frame's drawn border thickness (`frameBorders`) when the panels are framed; the rows and the
 * separator sit inside the borders and the panel grows by their thickness. Null leaves the legacy box.
 * `question`: what the node asks (`layoutChoices` makes it); its height goes above the separator, the box
 * grows by it and the pages hold fewer rows when the screen is short.
 */
export function choiceLayout(unit: number, count: number, page: number, placement: Placement | null = null, borders: FrameInsets | null = null, question: ChoiceQuestionLayout | null = null): ChoiceBox {
  const pad = GAP * 2;
  const b = borders ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const top = CHOICE_TOP + (question?.height ?? 0);
  const fit = Math.max(2, Math.floor((SCENE_HEIGHT - GAP * 4 - b.top - b.bottom - top - pad) / unit));
  const perPage = count <= fit ? count : fit - 1;
  const pages = Math.max(1, Math.ceil(count / Math.max(1, perPage)));
  const p = ((page % pages) + pages) % pages;
  const first = p * perPage;
  const shown = Math.min(perPage, count - first);
  const lines = shown + (pages > 1 ? 1 : 0);
  const h = b.top + top + pad + lines * unit + b.bottom;
  const panel: Rect = placement ? placeAt(placement, placementWidth(placement), h) : { x: Math.round((SCENE_WIDTH - CHOICE_WIDTH) / 2), y: SCENE_HEIGHT - GAP * 2 - h, w: CHOICE_WIDTH, h };
  const inner: Rect = { x: panel.x + b.left, y: panel.y + b.top, w: panel.w - b.left - b.right, h: panel.h - b.top - b.bottom };
  const row = (i: number): Rect => ({ x: inner.x + pad, y: inner.y + top + i * unit, w: inner.w - pad * 2, h: unit });
  const placed: ChoiceQuestionBox | null = question ? { ...question, x: inner.x + inner.w / 2, y: inner.y + question.pad } : null;
  return { panel, ...(borders ? { inner } : {}), ...(placed ? { question: placed } : {}), rows: Array.from({ length: shown }, (_, i) => row(i)), first, more: pages > 1 ? row(shown) : null, pages };
}
