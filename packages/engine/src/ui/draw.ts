import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Session } from "../session.ts";
import { score } from "../state.ts";
import type { Rect } from "../sprite.ts";
import type { PlayerUi } from "./controller.ts";
import { drawIcon, type IconId } from "./icons.ts";
import { TEXT_FONT, TEXT_LINE, wrap } from "./textbox.ts";

// Draws the player UI (spec 06) into the back buffer: icon bar, touch tab,
// inventory, settings, the ending box, labels and the cursor (D76, D77, D79, D80).

type Ctx = CanvasRenderingContext2D;
/** Decoded image for an image asset ID (item icons). */
export type IconImage = (id: string) => CanvasImageSource | undefined;

const PANEL = "#2a2018";
const BUTTON = "#4a3a2a";
const ACTIVE = "#c89a3c";
const EDGE = "#e8d8a8";
const DIM = "rgba(255,255,255,0.35)";

function button(ctx: Ctx, r: Rect, active = false, enabled = true) {
  ctx.fillStyle = active ? ACTIVE : BUTTON;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = enabled ? EDGE : DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

function panel(ctx: Ctx, r: Rect, title: string) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = PANEL;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.font = `bold ${TEXT_FONT}`;
  ctx.fillStyle = EDGE;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(title, r.x + r.w / 2, r.y + 8);
}

const inset = (r: Rect, k: number): Rect => ({ x: r.x + r.w * k, y: r.y + r.h * k, w: r.w * (1 - 2 * k), h: r.h * (1 - 2 * k) });

function itemIcon(ctx: Ctx, img: CanvasImageSource | undefined, r: Rect) {
  if (!img) return;
  const w = (img as { width: number }).width;
  const h = (img as { height: number }).height;
  const box = inset(r, 0.12);
  const k = Math.min(box.w / w, box.h / h);
  ctx.drawImage(img, Math.round(box.x + (box.w - w * k) / 2), Math.round(box.y + (box.h - h * k) / 2), w * k, h * k);
}

function label(ctx: Ctx, text: string, x: number, y: number, align: CanvasTextAlign = "center") {
  ctx.font = TEXT_FONT;
  ctx.fillStyle = EDGE;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/** The whole UI layer over the scene. `drawText` draws the text box above panels. */
export function drawUi(ctx: Ctx, ui: PlayerUi, icons: IconImage, drawText: () => void) {
  const s = ui.session;
  const L = ui.layout;
  const itemImg = s.item ? icons(s.itemFile(s.item)?.icon ?? "") : undefined;

  if (ui.tabVisible) drawTab(ctx, ui, itemImg);
  if (ui.barOpen) drawBar(ctx, ui, itemImg);
  if (ui.panel === "inventory") drawInventory(ctx, ui, icons, itemImg);
  if (ui.panel === "settings") drawSettings(ctx, ui);
  drawChoices(ctx, ui);
  drawText();
  if (s.ending) drawEnding(ctx, s, L.ending);
  if (ui.label) drawLabel(ctx, ui.label.text, ui.label.at);
  if (ui.cursor) drawCursor(ctx, ui, itemImg);
}

/** Cuts text to fit `width`, with an ellipsis. */
function fit(ctx: Ctx, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** The dialogue list box (spec 06, D143): the options the player can pick. */
function drawChoices(ctx: Ctx, ui: PlayerUi) {
  const box = ui.choiceBox;
  const list = ui.session.choices;
  if (!box || !list) return;
  const { panel: r } = box;
  ctx.fillStyle = "rgba(20,14,10,0.92)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.font = TEXT_FONT;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const hover = ui.cursor;
  box.rows.forEach((row, i) => {
    const option = list.options[box.first + i];
    if (!option) return;
    const over = !!hover && hover[0] >= row.x && hover[0] < row.x + row.w && hover[1] >= row.y && hover[1] < row.y + row.h;
    button(ctx, row, over);
    ctx.fillStyle = over ? "#000" : EDGE;
    ctx.fillText(fit(ctx, option.text, row.w - 16), row.x + 8, row.y + row.h / 2);
  });
  if (box.more) {
    button(ctx, box.more);
    label(ctx, "More…", box.more.x + box.more.w / 2, box.more.y + box.more.h / 2);
  }
}

function drawTab(ctx: Ctx, ui: PlayerUi, itemImg: CanvasImageSource | undefined) {
  const v = ui.layout.tab.visual;
  const h = 20;
  ctx.fillStyle = "rgba(42,32,24,0.85)";
  ctx.beginPath();
  ctx.roundRect(v.x, v.y, v.w, h, [0, 0, 6, 6]);
  ctx.fill();
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  // The current verb, since touch has no cursor to show it.
  const icon: Rect = { x: v.x + v.w / 2 - 8, y: 2, w: 16, h: 16 };
  if (ui.session.verb === "item") itemIcon(ctx, itemImg, icon);
  else drawIcon(ctx, ui.session.verb, icon, EDGE);
}

function drawBar(ctx: Ctx, ui: PlayerUi, itemImg: CanvasImageSource | undefined) {
  const s = ui.session;
  const L = ui.layout;
  ctx.fillStyle = PANEL;
  ctx.fillRect(L.bar.x, L.bar.y, L.bar.w, L.bar.h);
  ctx.fillStyle = EDGE;
  ctx.fillRect(0, L.bar.h - 2, SCENE_WIDTH, 2);
  for (const b of L.barButtons) {
    const active = b.id === s.verb;
    const enabled = b.id !== "item" || !!s.item;
    button(ctx, b.rect, active, enabled);
    if (b.id === "item") itemIcon(ctx, itemImg, b.rect);
    else drawIcon(ctx, b.id as IconId, inset(b.rect, 0.18), active ? "#000" : EDGE);
  }
  // Score (D71); hidden if a very large unit leaves no room for it.
  const text = `Score: ${score(s.state)} of ${s.game.maxScore}`;
  ctx.font = TEXT_FONT;
  const last = L.barButtons.at(-1)!.rect;
  if (L.score.x - ctx.measureText(text).width > last.x + last.w + 8) label(ctx, text, L.score.x, L.score.y, "right");
}

function drawInventory(ctx: Ctx, ui: PlayerUi, icons: IconImage, itemImg: CanvasImageSource | undefined) {
  const s = ui.session;
  const L = ui.layout.inventory;
  panel(ctx, L.panel, "Inventory");
  const items = ui.items;
  L.cells.forEach((c, i) => {
    const id = items[i];
    ctx.fillStyle = id && id === s.item ? "#5a4a2a" : "#1a140e";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
    if (id) itemIcon(ctx, icons(s.itemFile(id)?.icon ?? ""), c);
  });
  if (items.length === 0) label(ctx, "You aren't carrying anything.", L.panel.x + L.panel.w / 2, L.cells[0]!.y + L.cells[0]!.h / 2);
  for (const b of L.buttons) {
    const active = b.id === ui.inventoryMode;
    const enabled = b.id !== "item" || !!s.item;
    button(ctx, b.rect, active, enabled);
    const icon = inset({ ...b.rect, x: b.rect.x + (b.rect.w - b.rect.h) / 2, w: b.rect.h }, 0.18);
    const color = active ? "#000" : EDGE;
    if (b.id === "look") drawIcon(ctx, "look", icon, color);
    else if (b.id === "select") drawIcon(ctx, "hand", icon, color);
    else if (b.id === "item") itemIcon(ctx, itemImg, b.rect);
    else {
      ctx.font = `bold ${TEXT_FONT}`;
      ctx.fillStyle = EDGE;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OK", b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }
  }
}

const SETTINGS_TEXT: Record<string, string> = {
  restart: "Restart",
  save: "Save (coming in M8)",
  load: "Load (coming in M8)",
  volume: "Volume (coming in M8)",
  close: "Close",
};

function drawSettings(ctx: Ctx, ui: PlayerUi) {
  const L = ui.layout.settings;
  panel(ctx, L.panel, "Settings");
  for (const b of L.buttons) {
    const enabled = b.id === "restart" || b.id === "close";
    button(ctx, b.rect, false, enabled);
    ctx.font = TEXT_FONT;
    ctx.fillStyle = enabled ? EDGE : DIM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SETTINGS_TEXT[b.id]!, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
  }
}

/** The D71 stand-in for M8's death box. */
function drawEnding(ctx: Ctx, s: Session, L: { panel: Rect; restart: Rect }) {
  const e = s.ending!;
  panel(ctx, L.panel, e.kind === "die" ? "You have died" : "You won!");
  ctx.font = TEXT_FONT;
  const lines = wrap((t) => ctx.measureText(t).width, e.kind === "die" ? e.message : `Score: ${score(s.state)} of ${s.game.maxScore}`, L.panel.w - 40);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, L.panel.x + L.panel.w / 2, L.panel.y + 30 + i * TEXT_LINE));
  button(ctx, L.restart);
  label(ctx, "Restart", L.restart.x + L.restart.w / 2, L.restart.y + L.restart.h / 2);
}

function drawLabel(ctx: Ctx, text: string, at: readonly [number, number]) {
  ctx.font = TEXT_FONT;
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  const h = 14;
  const x = Math.round(Math.max(2, Math.min(SCENE_WIDTH - w - 2, at[0] + 12)));
  const y = Math.round(Math.max(2, at[1] - 22));
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 4, y + h / 2 + 0.5);
}

/** Drawn cursor (D77): the active verb's icon centered on the pointer, or the item. */
function drawCursor(ctx: Ctx, ui: PlayerUi, itemImg: CanvasImageSource | undefined) {
  const [x, y] = ui.cursor!;
  const r: Rect = { x: Math.round(x) - 8, y: Math.round(y) - 8, w: 16, h: 16 };
  const s = ui.session;
  // Over UI (or while locked) it's a plain pointer.
  const plain = s.busy || s.text || ui.panel || ui.barOpen;
  if (plain) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 12);
    ctx.lineTo(x + 3.5, y + 9);
    ctx.lineTo(x + 8, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (s.verb === "item") {
    itemIcon(ctx, itemImg, { x: r.x - 4, y: r.y - 4, w: 24, h: 24 });
    return;
  }
  // Dark outline so it reads on any background.
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawIcon(ctx, s.verb, { ...r, x: r.x + dx, y: r.y + dy }, "#000");
  drawIcon(ctx, s.verb, r, "#fff");
}
