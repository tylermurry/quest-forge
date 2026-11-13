import { SCENE_HEIGHT, SCENE_WIDTH, type EffectiveStyle, type FrameInsets, type IconEffect } from "@questforge/schema";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN, VOLUME_STEPS } from "../saves.ts";
import type { Session } from "../session.ts";
import { score } from "../state.ts";
import type { Rect } from "../sprite.ts";
import type { Vec } from "../vec.ts";
import type { PlayerUi } from "./controller.ts";
import { legibleInk, type ChoicesLook } from "./choices.ts";
import { drawIcon, shadeColor, shadedImage, type IconId } from "./icons.ts";
import { CHOICE_TEXT_INSET, PANEL_PAD, SEPARATOR_SPACE, fitInside, inRect, separatorRect, type ChoiceBox, type Layout } from "./layout.ts";
import { frameBorders, frameScale, outsetFrame, type PanelSkin, type SizedImage } from "./frame.ts";
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
 * off so pixel art stays crisp (`smooth` is for a picture drawn scaled down), and nothing is filled behind it,
 * so the image's transparency shows through.
 */
export function drawNineSlice(ctx: Ctx, image: SizedImage, insets: FrameInsets, dest: Rect, smooth = false) {
  ctx.imageSmoothingEnabled = smooth;
  for (const t of nineSliceTiles(image, insets, dest)) ctx.drawImage(image, t.sx, t.sy, t.sw, t.sh, t.dx, t.dy, t.dw, t.dh);
}

/**
 * The shared frame around `r`, with its picture scaled so the thickest border is `skin.scale` game pixels
 * (`frameScale`), as the editor's Styling preview shows it. Scaled down the picture is smoothed so thin lines
 * don't break up; otherwise it stays crisp.
 */
export function drawFrame(ctx: Ctx, skin: PanelSkin, r: Rect) {
  const k = frameScale(skin);
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(k, k);
  drawNineSlice(ctx, skin.image, skin.insets, { x: 0, y: 0, w: r.w / k, h: r.h / k }, k < 1);
  ctx.restore();
}

/** A panel's fill and edge: the shared frame when the game has one that loaded, else `builtIn`, today's look. */
export function drawChrome(ctx: Ctx, skin: PanelSkin | undefined, r: Rect, builtIn: () => void) {
  if (skin) drawFrame(ctx, skin, r);
  else builtIn();
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
  /** Default: the style's body color. */
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

/** Text on the game's panels and buttons: the author's color, or the legacy gold when there is no typography. */
const ink = (t: TextStyle) => (t.custom ? t.color : EDGE);

function button(ctx: Ctx, r: Rect, active = false, enabled = true, activeFill = ACTIVE) {
  ctx.fillStyle = active ? activeFill : BUTTON;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = enabled ? EDGE : DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

function panel(ctx: Ctx, t: TextStyle, skin: PanelSkin | undefined, r: Rect, title: string) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  // The frame goes around the panel, not over its content: the layout is fixed, so the frame is drawn outside it.
  drawChrome(ctx, skin, skin ? outsetFrame(r, frameBorders(skin), PANEL_PAD) : r, () => {
    ctx.fillStyle = PANEL;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  });
  drawFitted(ctx, t, title, r.x + r.w / 2, r.y + 8, r.w - 16, 16, { bold: true, color: ink(t), align: "center", baseline: "top" });
}

const inset = (r: Rect, k: number): Rect => ({ x: r.x + r.w * k, y: r.y + r.h * k, w: r.w * (1 - 2 * k), h: r.h * (1 - 2 * k) });

/** A picture drawn aspect-fit and centred in `box`, never deformed; with an effect, only its own pixels change. */
function drawPicture(ctx: Ctx, img: CanvasImageSource, box: Rect, effect?: IconEffect) {
  const sized = img as SizedImage;
  const at = fitInside(sized, box);
  ctx.drawImage(effect ? shadedImage(sized, effect) : img, at.x, at.y, at.w, at.h);
}

function itemIcon(ctx: Ctx, img: CanvasImageSource | undefined, r: Rect) {
  if (img) drawPicture(ctx, img, inset(r, 0.12));
}

/** A line of panel text, shrunk to `maxW` wide when that is given. */
function label(ctx: Ctx, t: TextStyle, text: string, x: number, y: number, align: CanvasTextAlign = "center", maxW = Infinity) {
  drawFitted(ctx, t, text, x, y, maxW, Infinity, { color: ink(t), align, baseline: "middle" });
}

/** Text centred in a control, shrunk to fit it. */
function buttonText(ctx: Ctx, t: TextStyle, text: string, r: Rect, o: TextOptions = {}) {
  drawFitted(ctx, t, text, r.x + r.w / 2, r.y + r.h / 2, r.w - 8, r.h, { color: ink(t), align: "center", baseline: "middle", ...o });
}

/** The whole UI layer over the scene. `drawBoxes` draws the text box above panels. `skin`: the shared frame the panels are drawn with, if any. */
export function drawUi(ctx: Ctx, ui: PlayerUi, icons: IconImage, t: TextStyle, bar: IconBarLook, choices: ChoicesLook, drawBoxes: () => void, skin?: PanelSkin) {
  const s = ui.session;
  const L = ui.layout;
  const itemImg = s.item ? icons(s.itemFile(s.item)?.icon ?? "") : undefined;

  if (ui.tabVisible) drawTab(ctx, ui, itemImg);
  if (ui.barOpen) {
    const scoreText = `Score: ${score(s.state)} of ${s.game.maxScore}`;
    drawIconBar(ctx, { layout: L, selected: s.verb, itemHeld: !!s.item, itemImage: itemImg, hover: ui.cursor, scoreText }, t, bar, icons);
  }
  if (ui.panel === "inventory") drawInventory(ctx, ui, t, skin, icons, itemImg);
  if (ui.panel === "settings") drawSettings(ctx, ui, t, skin);
  drawChoices(ctx, ui, t, choices, skin);
  drawBoxes();
  if (s.ending) drawEnding(ctx, ui, t, skin, s, L.ending);
  if (ui.panel === "save" || ui.panel === "load") drawSlots(ctx, ui, t, skin);
  if (ui.panel === "volume") drawVolume(ctx, ui, t, skin);
  if (ui.panel === "textsize") drawTextSize(ctx, ui, t, skin);
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

/** What the choices drawing needs: where the rows are, their texts, and where the pointer is (null for touch). */
export interface ChoicesView {
  box: ChoiceBox;
  /** The text of each row of `box`, top to bottom; a missing one leaves the row undrawn. */
  options: readonly (string | undefined)[];
  hover: Vec | null;
}

/** What a styled choice row's hover effect lays over it. */
const ROW_EFFECT: Record<IconEffect, string> = { brighten: "rgba(255,255,255,0.18)", darken: "rgba(0,0,0,0.35)" };
const ROW_RADIUS = 4;

/** Fills `r` with rounded corners. */
function fillRounded(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
  ctx.closePath();
  ctx.fill();
}

/** The choice row (or More…) under `p`, if any. */
export function choiceRowAt(box: ChoiceBox, p: Vec | null): Rect | null {
  if (!p) return null;
  return [...box.rows, ...(box.more ? [box.more] : [])].find((r) => inRect(p, r)) ?? null;
}

/**
 * The rows of the dialogue list box, without the box behind them. Styled (the author configured Dialogue
 * Choices): the line said before the choices (name, then text) when the box has one, the separator line at the top of the choices region, then each option as plain text; the row under
 * the pointer is brightened or darkened, with rounded corners. Legacy: each option on a button, the hovered one
 * filled gold with black text. The game and the editor's Dialogue Choices preview both draw with this.
 */
export function drawChoiceRows(ctx: Ctx, v: ChoicesView, t: TextStyle, look: ChoicesLook) {
  const { box, hover } = v;
  const effect = look.effect;
  if (effect === "none") {
    box.rows.forEach((row, i) => {
      const text = v.options[i];
      if (text === undefined) return;
      const over = !!hover && inRect(hover, row);
      button(ctx, row, over, true, ACTIVE);
      drawFitted(ctx, t, text, row.x + 8, row.y + row.h / 2, row.w - 16, row.h, { color: over ? legibleInk(ACTIVE) : ink(t), baseline: "middle" });
    });
    if (box.more) {
      button(ctx, box.more);
      buttonText(ctx, t, "More…", box.more);
    }
    return;
  }
  const prompt = box.prompt;
  if (prompt) {
    const at = (text: string, y: number, color: string, bold = false) => drawText(ctx, t, text, prompt.x, y, { size: prompt.size, align: "center", baseline: "top", color, bold });
    if (prompt.name) at(prompt.name, prompt.y, t.name, true);
    const first = prompt.y + (prompt.name ? prompt.line + SEPARATOR_SPACE : 0);
    prompt.lines.forEach((line, i) => at(line, first + i * prompt.line, t.color));
  }
  const sep = separatorRect(box);
  ctx.fillStyle = look.separator;
  ctx.fillRect(sep.x, sep.y, sep.w, sep.h);
  const mark = (row: Rect) => {
    if (!hover || !inRect(hover, row)) return;
    ctx.fillStyle = ROW_EFFECT[effect];
    fillRounded(ctx, row, ROW_RADIUS);
  };
  box.rows.forEach((row, i) => {
    const text = v.options[i];
    if (text === undefined) return;
    mark(row);
    drawFitted(ctx, t, text, row.x + CHOICE_TEXT_INSET, row.y + row.h / 2, row.w - CHOICE_TEXT_INSET * 2, row.h, { color: ink(t), baseline: "middle" });
  });
  if (box.more) {
    mark(box.more);
    buttonText(ctx, t, "More…", box.more);
  }
}

/** The dialogue list box: its panel (the shared frame, or the dark panel and edge), then the rows. */
export function drawChoiceBox(ctx: Ctx, v: ChoicesView, t: TextStyle, look: ChoicesLook, skin?: PanelSkin) {
  const { panel: r } = v.box;
  drawChrome(ctx, skin, r, () => {
    ctx.fillStyle = "rgba(20,14,10,0.92)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  });
  drawChoiceRows(ctx, v, t, look);
}

function drawChoices(ctx: Ctx, ui: PlayerUi, t: TextStyle, look: ChoicesLook, skin: PanelSkin | undefined) {
  const box = ui.choiceBox;
  const list = ui.session.choices;
  if (!box || !list) return;
  drawChoiceBox(ctx, { box, options: box.rows.map((_, i) => list.options[box.first + i]?.text), hover: ui.cursor }, t, look, skin);
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

/** The icon bar's look: its frame, the picture for each button, and the Brighten / Darken effect (`none` is the legacy look). */
export type IconBarLook = EffectiveStyle["iconBar"];

/** What the bar shows besides its look: the session's state in play, sample values in the editor's preview. */
export interface BarState {
  layout: Layout;
  /** The highlighted button (the current verb in play). */
  selected: string;
  /** An inventory item is selected, which enables the item button. */
  itemHeld: boolean;
  /** The held item's picture, once loaded. */
  itemImage: CanvasImageSource | undefined;
  /** The mouse position in scene pixels; null for touch. */
  hover: Vec | null;
  scoreText: string;
}

/**
 * The icon bar, drawn by the game and by the editor's Icon Bar preview. With no icon bar style it is the
 * original look (gold fill under the current verb). With one, the bar's frame replaces the dark strip, each
 * button shows its own picture (else the built-in icon) and the one Brighten / Darken effect marks the
 * hovered and the selected button, on the icon's pixels only: the button behind it never changes.
 */
export function drawIconBar(ctx: Ctx, bar: BarState, t: TextStyle, look: IconBarLook, image: IconImage) {
  const L = bar.layout;
  const effect = look.effect === "none" ? undefined : look.effect;
  // A frame that is not configured or has not loaded leaves today's strip.
  const frame = look.frame.image === undefined ? undefined : (image(look.frame.image) as SizedImage | undefined);
  if (frame) drawNineSlice(ctx, frame, look.frame.insets, L.bar);
  else {
    ctx.fillStyle = PANEL;
    ctx.fillRect(L.bar.x, L.bar.y, L.bar.w, L.bar.h);
    ctx.fillStyle = EDGE;
    ctx.fillRect(0, L.bar.h - 2, SCENE_WIDTH, 2);
  }
  for (const b of L.barButtons) {
    const active = b.id === bar.selected;
    const enabled = b.id !== "item" || bar.itemHeld;
    if (!effect) {
      button(ctx, b.rect, active, enabled);
      if (b.id === "item") itemIcon(ctx, bar.itemImage, b.rect);
      else drawIcon(ctx, b.id as IconId, inset(b.rect, 0.18), active ? "#000" : EDGE);
      continue;
    }
    // The same effect for hover and selected; a frame stands in for the button backgrounds.
    // A disabled button (the item button with nothing held) does not react to hover.
    const marked = active || (enabled && !!bar.hover && inRect(bar.hover, b.rect)) ? effect : undefined;
    if (!frame) button(ctx, b.rect, false, enabled);
    // The held item shows its own picture; the item icon is for when none is held.
    const own = b.id === "item" && bar.itemHeld ? bar.itemImage : look.icons[b.id] === undefined ? undefined : image(look.icons[b.id]!);
    if (own) drawPicture(ctx, own, inset(b.rect, 0.12), marked);
    else if (b.id !== "item") drawIcon(ctx, b.id as IconId, inset(b.rect, 0.18), marked ? shadeColor(EDGE, marked) : EDGE);
  }
  // Score; shrunk to the room beside the buttons, and hidden if even that doesn't fit.
  const last = L.barButtons.at(-1)!.rect;
  const room = L.score.x - (last.x + last.w + 8);
  if (fittedSize(ctx, t, bar.scoreText, room, L.bar.h).fits) label(ctx, t, bar.scoreText, L.score.x, L.score.y, "right", room);
}

function drawInventory(ctx: Ctx, ui: PlayerUi, t: TextStyle, skin: PanelSkin | undefined, icons: IconImage, itemImg: CanvasImageSource | undefined) {
  const s = ui.session;
  const L = ui.layout.inventory;
  panel(ctx, t, skin, L.panel, "Inventory");
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

function drawSettings(ctx: Ctx, ui: PlayerUi, t: TextStyle, skin: PanelSkin | undefined) {
  const L = ui.layout.settings;
  panel(ctx, t, skin, L.panel, "Settings");
  for (const b of L.buttons) {
    const enabled = b.id !== "load" || ui.slots.any;
    button(ctx, b.rect, false, enabled);
    buttonText(ctx, t, SETTINGS_TEXT[b.id]!, b.rect, { color: enabled ? ink(t) : DIM });
  }
}

const ENDING_TEXT: Record<string, string> = { restore: "Restore", restart: "Restart", try_again: "Try again" };

/** The Sierra death box: message, then Restore · Restart · Try again. A win offers Restore · Restart. */
function drawEnding(ctx: Ctx, ui: PlayerUi, t: TextStyle, skin: PanelSkin | undefined, s: Session, L: PlayerUi["layout"]["ending"]) {
  const e = s.ending!;
  panel(ctx, t, skin, L.panel, e.kind === "die" ? "You have died" : "You won!");
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
function drawSlots(ctx: Ctx, ui: PlayerUi, t: TextStyle, skin: PanelSkin | undefined) {
  const L = ui.layout.slots;
  const saving = ui.panel === "save";
  panel(ctx, t, skin, L.panel, saving ? "Save game" : "Load game");
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
function drawVolume(ctx: Ctx, ui: PlayerUi, t: TextStyle, skin: PanelSkin | undefined) {
  const L = ui.layout.volume;
  panel(ctx, t, skin, L.panel, "Volume");
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
function drawTextSize(ctx: Ctx, ui: PlayerUi, t: TextStyle, skin: PanelSkin | undefined) {
  const L = ui.layout.textSize;
  panel(ctx, t, skin, L.panel, "Text size");
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
  // Over a dialogue choice it's a hand, so the row reads as clickable.
  const box = ui.choiceBox;
  if (box && choiceRowAt(box, ui.cursor)) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawIcon(ctx, "hand", { ...r, x: r.x + dx, y: r.y + dy }, "#000");
    drawIcon(ctx, "hand", r, "#fff");
    return;
  }
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
