import { SCENE_HEIGHT, SCENE_WIDTH, type FrameInsets } from "@questforge/schema";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN, VOLUME_STEPS } from "../saves.ts";
import type { Session } from "../session.ts";
import { score } from "../state.ts";
import type { Rect } from "../sprite.ts";
import type { PlayerUi } from "./controller.ts";
import { drawIcon, type IconId } from "./icons.ts";
import { nineSliceTiles } from "./nineslice.ts";
import { wrap } from "./textbox.ts";
import { fontOf, lineFor, shrinkToFit, type Measure, type TextStyle } from "./typography.ts";

// Draws the player UI into the back buffer: icon bar, touch tab,
// inventory, settings, the ending box, labels and the cursor.

type Ctx = CanvasRenderingContext2D;
/** Decoded image for an image asset ID (item icons). */
export type IconImage = (id: string) => CanvasImageSource | undefined;

const PANEL = "#2a2018";
const BUTTON = "#4a3a2a";
const ACTIVE = "#c89a3c";
const EDGE = "#e8d8a8";
const DIM = "rgba(255,255,255,0.35)";

/**
 * Draws a nine-slice frame: native-scale corners, tiled edges and centre (see `nineSliceTiles`). Smoothing is
 * off so pixel art stays crisp, and nothing is filled behind it, so the image's transparency shows through.
 */
export function drawNineSlice(ctx: Ctx, image: CanvasImageSource & { width: number; height: number }, insets: FrameInsets, dest: Rect) {
  ctx.imageSmoothingEnabled = false;
  for (const t of nineSliceTiles(image, insets, dest)) ctx.drawImage(image, t.sx, t.sy, t.sw, t.sh, t.dx, t.dy, t.dw, t.dh);
}

/** A text measurer that asks Canvas, for the family the game draws with. */
export function canvasMeasure(ctx: Ctx, family: string): Measure {
  return (text, size, bold) => {
    ctx.font = fontOf(family, size, bold);
    return ctx.measureText(text).width;
  };
}

export interface TextOptions {
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  bold?: boolean;
  /** Default: the style's body colour. */
  color?: string;
  /** Default: the style's size. */
  size?: number;
}

/** Draws one line of text in the game's typography. Gameplay and the editor's Styling preview both draw text with this. */
export function drawText(ctx: Ctx, t: TextStyle, text: string, x: number, y: number, o: TextOptions = {}) {
  ctx.font = fontOf(t.family, o.size ?? t.size, o.bold);
  ctx.fillStyle = o.color ?? t.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.baseline ?? "alphabetic";
  ctx.fillText(text, x, y);
}

/** The largest size, up to the style's own, at which `text` fits `maxW` × `maxH`; `fits` is false when even the smallest allowed size doesn't. */
function fittedSize(ctx: Ctx, t: TextStyle, text: string, maxW: number, maxH: number, bold?: boolean, from = t.size) {
  const measure = canvasMeasure(ctx, t.family);
  const { size, result } = shrinkToFit(from, (s) => ({ w: measure(text, s, bold), h: lineFor(s) }), (r) => r.w <= maxW && r.h <= maxH);
  return { size, fits: result.w <= maxW && result.h <= maxH };
}

/** Text inside a control or panel: shrinks (never below the legacy size) to fit `maxW` × `maxH`, then cuts with an ellipsis. */
function drawFitted(ctx: Ctx, t: TextStyle, text: string, x: number, y: number, maxW: number, maxH: number, o: TextOptions = {}) {
  const { size } = fittedSize(ctx, t, text, maxW, maxH, o.bold, o.size);
  ctx.font = fontOf(t.family, size, o.bold);
  drawText(ctx, t, fit(ctx, text, maxW), x, y, { ...o, size });
}

/** Text on the game's panels and buttons: the author's colour, or the legacy gold when there is no typography. */
const ink = (t: TextStyle) => (t.custom ? t.color : EDGE);

function button(ctx: Ctx, r: Rect, active = false, enabled = true) {
  ctx.fillStyle = active ? ACTIVE : BUTTON;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = enabled ? EDGE : DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

function panel(ctx: Ctx, t: TextStyle, r: Rect, title: string) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = PANEL;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  drawFitted(ctx, t, title, r.x + r.w / 2, r.y + 8, r.w - 16, 16, { bold: true, color: ink(t), align: "center", baseline: "top" });
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

/** A line of panel text, shrunk to `maxW` wide when that is given. */
function label(ctx: Ctx, t: TextStyle, text: string, x: number, y: number, align: CanvasTextAlign = "center", maxW = Infinity) {
  drawFitted(ctx, t, text, x, y, maxW, Infinity, { color: ink(t), align, baseline: "middle" });
}

/** Text centred in a control, shrunk to fit it. */
function buttonText(ctx: Ctx, t: TextStyle, text: string, r: Rect, o: TextOptions = {}) {
  drawFitted(ctx, t, text, r.x + r.w / 2, r.y + r.h / 2, r.w - 8, r.h, { color: ink(t), align: "center", baseline: "middle", ...o });
}

/** The whole UI layer over the scene. `drawText` draws the text box above panels. */
export function drawUi(ctx: Ctx, ui: PlayerUi, icons: IconImage, t: TextStyle, drawBoxes: () => void) {
  const s = ui.session;
  const L = ui.layout;
  const itemImg = s.item ? icons(s.itemFile(s.item)?.icon ?? "") : undefined;

  if (ui.tabVisible) drawTab(ctx, ui, itemImg);
  if (ui.barOpen) drawBar(ctx, ui, t, itemImg);
  if (ui.panel === "inventory") drawInventory(ctx, ui, t, icons, itemImg);
  if (ui.panel === "settings") drawSettings(ctx, ui, t);
  drawChoices(ctx, ui, t);
  drawBoxes();
  if (s.ending) drawEnding(ctx, ui, t, s, L.ending);
  if (ui.panel === "save" || ui.panel === "load") drawSlots(ctx, ui, t);
  if (ui.panel === "volume") drawVolume(ctx, ui, t);
  if (ui.panel === "textsize") drawTextSize(ctx, ui, t);
  if (ui.notice) drawNotice(ctx, t, ui.notice.text, L.notice);
  if (ui.label) drawLabel(ctx, t, ui.label.text, ui.label.at);
  if (ui.cursor) drawCursor(ctx, ui, itemImg);
}

/** Cuts text to fit `width`, with an ellipsis. */
function fit(ctx: Ctx, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** The dialogue list box: the options the player can pick. */
function drawChoices(ctx: Ctx, ui: PlayerUi, t: TextStyle) {
  const box = ui.choiceBox;
  const list = ui.session.choices;
  if (!box || !list) return;
  const { panel: r } = box;
  ctx.fillStyle = "rgba(20,14,10,0.92)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  const hover = ui.cursor;
  box.rows.forEach((row, i) => {
    const option = list.options[box.first + i];
    if (!option) return;
    const over = !!hover && hover[0] >= row.x && hover[0] < row.x + row.w && hover[1] >= row.y && hover[1] < row.y + row.h;
    button(ctx, row, over);
    drawFitted(ctx, t, option.text, row.x + 8, row.y + row.h / 2, row.w - 16, row.h, { color: over ? "#000" : ink(t), baseline: "middle" });
  });
  if (box.more) {
    button(ctx, box.more);
    buttonText(ctx, t, "More…", box.more);
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

function drawBar(ctx: Ctx, ui: PlayerUi, t: TextStyle, itemImg: CanvasImageSource | undefined) {
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
  // Score; shrunk to the room beside the buttons, and hidden if even that doesn't fit.
  const text = `Score: ${score(s.state)} of ${s.game.maxScore}`;
  const last = L.barButtons.at(-1)!.rect;
  const room = L.score.x - (last.x + last.w + 8);
  if (fittedSize(ctx, t, text, room, L.bar.h).fits) label(ctx, t, text, L.score.x, L.score.y, "right", room);
}

function drawInventory(ctx: Ctx, ui: PlayerUi, t: TextStyle, icons: IconImage, itemImg: CanvasImageSource | undefined) {
  const s = ui.session;
  const L = ui.layout.inventory;
  panel(ctx, t, L.panel, "Inventory");
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
  if (items.length === 0) label(ctx, t, "You aren't carrying anything.", L.panel.x + L.panel.w / 2, L.cells[0]!.y + L.cells[0]!.h / 2, "center", L.panel.w - 16);
  for (const b of L.buttons) {
    const active = b.id === ui.inventoryMode;
    const enabled = b.id !== "item" || !!s.item;
    button(ctx, b.rect, active, enabled);
    const icon = inset({ ...b.rect, x: b.rect.x + (b.rect.w - b.rect.h) / 2, w: b.rect.h }, 0.18);
    const color = active ? "#000" : EDGE;
    if (b.id === "look") drawIcon(ctx, "look", icon, color);
    else if (b.id === "select") drawIcon(ctx, "hand", icon, color);
    else if (b.id === "item") itemIcon(ctx, itemImg, b.rect);
    else buttonText(ctx, t, "OK", b.rect, { bold: true });
  }
}

const SETTINGS_TEXT: Record<string, string> = {
  restart: "Restart",
  save: "Save game",
  load: "Load game",
  volume: "Volume",
  textsize: "Text size",
  close: "Close",
};

function drawSettings(ctx: Ctx, ui: PlayerUi, t: TextStyle) {
  const L = ui.layout.settings;
  panel(ctx, t, L.panel, "Settings");
  for (const b of L.buttons) {
    const enabled = b.id !== "load" || ui.slots.any;
    button(ctx, b.rect, false, enabled);
    buttonText(ctx, t, SETTINGS_TEXT[b.id]!, b.rect, { color: enabled ? ink(t) : DIM });
  }
}

const ENDING_TEXT: Record<string, string> = { restore: "Restore", restart: "Restart", try_again: "Try again" };

/** The Sierra death box: message, then Restore · Restart · Try again. A win offers Restore · Restart. */
function drawEnding(ctx: Ctx, ui: PlayerUi, t: TextStyle, s: Session, L: PlayerUi["layout"]["ending"]) {
  const e = s.ending!;
  panel(ctx, t, L.panel, e.kind === "die" ? "You have died" : "You won!");
  const text = e.kind === "die" ? `${e.message}\n\nScore: ${score(s.state)} of ${s.game.maxScore}` : `Score: ${score(s.state)} of ${s.game.maxScore}`;
  const measure = canvasMeasure(ctx, t.family);
  // The message shrinks until it fits its area; at the smallest size a very long one still loses its last lines.
  const { size, result } = shrinkToFit(t.size, (sz) => ({ sz, lines: wrap((x) => measure(x, sz), text, L.message.w - 16) }), (r) => r.lines.length * lineFor(r.sz) <= L.message.h);
  const lines = result.lines;
  const line = lineFor(size);
  const shown = lines.slice(0, Math.max(1, Math.floor(L.message.h / line)));
  shown.forEach((l, i) => drawText(ctx, t, l, L.message.x + L.message.w / 2, L.message.y + i * line, { size, align: "center", baseline: "top" }));
  for (const b of e.kind === "die" ? L.buttons : L.win) {
    const enabled = b.id !== "restore" || ui.slots.any;
    button(ctx, b.rect, false, enabled);
    buttonText(ctx, t, ENDING_TEXT[b.id]!, b.rect, { color: enabled ? ink(t) : DIM });
  }
}

const savedAt = (ms: number) => {
  try {
    return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    // An unsupported locale makes toLocaleString throw. The slot is still drawn, just without a time.
    return "";
  }
};

/** The save / load list: numbered slots, the picked one highlighted. */
function drawSlots(ctx: Ctx, ui: PlayerUi, t: TextStyle) {
  const L = ui.layout.slots;
  const saving = ui.panel === "save";
  panel(ctx, t, L.panel, saving ? "Save game" : "Load game");
  L.rows.forEach((r, row) => {
    const i = ui.slotAt(row);
    if (i === null) return;
    const slot = ui.slots.list[i] ?? null;
    const picked = ui.slot === i;
    const usable = saving || slot !== null;
    button(ctx, r, picked, usable);
    // The two lines of a slot (name, time) share one size, small enough that both fit the row.
    const size = shrinkToFit(t.size, (sz) => sz, (sz) => lineFor(sz) * 2 <= r.h - 4).size;
    const half = lineFor(size) / 2;
    const color = picked ? "#000" : usable ? ink(t) : DIM;
    const mid = r.y + r.h / 2;
    drawFitted(ctx, t, `${i + 1}.`, r.x + 6, mid, 22, r.h, { size, color, baseline: "middle" });
    const x = r.x + 28;
    const w = r.w - 34;
    if (!slot) {
      drawFitted(ctx, t, "Empty", x, mid, w, r.h, { size, color, baseline: "middle" });
      return;
    }
    drawFitted(ctx, t, slot.name, x, mid - half, w, r.h, { size, color, baseline: "middle" });
    drawFitted(ctx, t, savedAt(slot.savedAt), x, mid + half, w, r.h, { size, color: picked ? "#222" : DIM, baseline: "middle" });
  });
  for (const b of L.buttons) {
    const enabled = b.id !== "act" || ui.slotActionEnabled;
    button(ctx, b.rect, false, enabled);
    const text = b.id === "act" ? (saving ? "Save" : "Load") : b.id === "more" ? `More… (${ui.slotPage + 1}/${L.pages})` : "Cancel";
    buttonText(ctx, t, text, b.rect, { bold: b.id === "act", color: enabled ? ink(t) : DIM });
  }
}

/** Music and sound-effect volume. */
function drawVolume(ctx: Ctx, ui: PlayerUi, t: TextStyle) {
  const L = ui.layout.volume;
  panel(ctx, t, L.panel, "Volume");
  const bars: [string, Rect, number][] = [
    ["Music", L.music, ui.settings.music],
    ["Sound effects", L.sfx, ui.settings.sfx],
  ];
  for (const [name, r, level] of bars) {
    label(ctx, t, name, L.labelX, r.y + r.h / 2, "left", L.buttons[0]!.rect.x - L.labelX - 6);
    const seg = (r.w - (VOLUME_STEPS - 1) * 2) / VOLUME_STEPS;
    for (let i = 0; i < VOLUME_STEPS; i++) {
      ctx.fillStyle = i < level ? ACTIVE : "#1a140e";
      ctx.fillRect(Math.round(r.x + i * (seg + 2)), r.y + r.h / 4, Math.floor(seg), Math.round(r.h / 2));
    }
  }
  for (const b of L.buttons) {
    button(ctx, b.rect);
    buttonText(ctx, t, b.id === "ok" ? "OK" : b.id.endsWith("_up") ? "+" : "−", b.rect, { bold: true });
  }
}

/** The player's Text Size: "Text size  [−] 100% [+]" and OK. */
function drawTextSize(ctx: Ctx, ui: PlayerUi, t: TextStyle) {
  const L = ui.layout.textSize;
  panel(ctx, t, L.panel, "Text size");
  label(ctx, t, "Text size", L.labelX, L.value.y + L.value.h / 2, "left", L.buttons[0]!.rect.x - L.labelX - 6);
  label(ctx, t, `${ui.settings.textSize}%`, L.value.x + L.value.w / 2, L.value.y + L.value.h / 2, "center", L.value.w);
  for (const b of L.buttons) {
    const enabled = b.id === "ok" || (b.id === "size_up" ? ui.settings.textSize < TEXT_SCALE_MAX : ui.settings.textSize > TEXT_SCALE_MIN);
    button(ctx, b.rect, false, enabled);
    buttonText(ctx, t, b.id === "ok" ? "OK" : b.id === "size_up" ? "+" : "−", b.rect, { bold: true, color: enabled ? ink(t) : DIM });
  }
}

/** A short message on a dark strip, at the size that fits the screen's width. */
function drawNotice(ctx: Ctx, t: TextStyle, text: string, at: { x: number; y: number }) {
  const { size } = fittedSize(ctx, t, text, SCENE_WIDTH - 24, Infinity);
  ctx.font = fontOf(t.family, size);
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  const h = lineFor(size) + 6;
  const cy = Math.min(at.y, SCENE_HEIGHT - 2 - h / 2);
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(Math.round(at.x - w / 2), Math.round(cy - h / 2), w, h);
  drawText(ctx, t, text, at.x, cy, { size, color: ink(t), align: "center", baseline: "middle" });
}

/** The name under the pointer, on a dark strip kept on screen. */
function drawLabel(ctx: Ctx, t: TextStyle, text: string, at: readonly [number, number]) {
  const { size } = fittedSize(ctx, t, text, SCENE_WIDTH - 16, Infinity);
  ctx.font = fontOf(t.family, size);
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  const h = lineFor(size) + 2;
  const x = Math.round(Math.max(2, Math.min(SCENE_WIDTH - w - 2, at[0] + 12)));
  const y = Math.round(Math.max(2, at[1] - 22));
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(x, y, w, h);
  drawText(ctx, t, text, x + 4, y + h / 2 + 0.5, { size, baseline: "middle" });
}

/** Drawn cursor: the active verb's icon centered on the pointer, or the item. */
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
