import { SLOT_COUNT, TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_SCALE_STEP, VOLUME_STEPS, DEFAULT_SETTINGS, SaveSlots, type PlayerSettings } from "../saves.ts";
import type { Session, Verb } from "../session.ts";
import { score } from "../state.ts";
import type { Vec } from "../vec.ts";
import type { ChoiceList } from "../dialogue.ts";
import type { FrameInsets } from "@questforge/schema";
import { layoutChoices } from "./choicebox.ts";
import { textStyle, type Measure } from "./typography.ts";
import { computeLayout, hitButton, inRect, placementOf, type ChoiceBox, type InventoryButtonId, type Layout, type Placement } from "./layout.ts";

// Player UI input: the icon bar, inventory, settings,
// hover labels and tap-and-hold. Pointer events arrive in scene coordinates with
// their pointer type; nothing here touches the DOM, so it's tested in Node.

export type PointerKind = "mouse" | "touch" | "pen";

/** Mouse at the very top opens the bar. */
const REVEAL_CSS = 8;
/** Tap-and-hold. */
const HOLD_SECONDS = 0.4;
const HOLD_SLOP_CSS = 10;

/** `save` / `load` are the slot list; `volume` the volume panel; `textsize` the player's text size. */
export type Panel = "inventory" | "settings" | "save" | "load" | "volume" | "textsize" | null;

/** What the player UI keeps outside the game state: save slots, volumes and text size. */
export interface UiServices {
  slots: SaveSlots;
  settings: PlayerSettings;
  /** Volumes or text size changed: apply and store them. */
  onSettings?(s: PlayerSettings): void;
  /** The shared frame's drawn border thickness (`frameBorders`) when panels are drawn with it: the dialogue list box grows by it. */
  borders?: FrameInsets | null;
  /** Measures text in the font that is drawn, so the choice box's question wraps the way it is drawn. Without one, a rough width per character. */
  measure?: Measure;
}

/** Stands in for the canvas's text measurer when the host gives none (tests): every character is 0.6 em wide. */
const ROUGH_MEASURE: Measure = (text, size) => text.length * size * 0.6;

/** How long a notice ("Game saved.") stays up, in seconds. */
export const NOTICE_SECONDS = 2.5;
export type InventoryMode = "look" | "select" | "item";

interface Press {
  at: Vec;
  kind: PointerKind;
  held: number;
  /** Held long enough to show the label; release won't act. */
  long: boolean;
  moved: boolean;
}

export class PlayerUi {
  layout: Layout;
  barOpen = false;
  /** A touch or pen has been seen: show the bar tab. */
  touchSeen = false;
  panel: Panel = null;
  inventoryMode: InventoryMode = "select";
  /** Name label for what's under the pointer (hover or hold). */
  label: { text: string; at: Vec } | null = null;
  /** Mouse position for the drawn cursor; null for touch. */
  cursor: Vec | null = null;
  /** Page of a long dialogue list box (UI state). */
  choicePage = 0;
  /** The slot picked in the save / load list, 0-based (UI state). */
  slot: number | null = null;
  slotPage = 0;
  /** A short message at the bottom of the screen. */
  notice: { text: string; timeLeft: number } | null = null;
  readonly slots: SaveSlots;
  settings: PlayerSettings;
  private readonly onSettings: ((s: PlayerSettings) => void) | undefined;
  private pagedList: ChoiceList | null = null;
  private press: Press | null = null;
  private cssScale = 1;
  /** Where the creator put the panels (Frames > Position); null is the legacy layout. */
  readonly placement: Placement | null;
  private readonly borders: FrameInsets | null;
  private readonly measure: Measure;

  constructor(
    readonly session: Session,
    services?: UiServices,
  ) {
    this.placement = placementOf(session.game.style);
    this.layout = computeLayout(1, this.placement);
    this.slots = services?.slots ?? new SaveSlots(null, session.game);
    this.settings = { ...(services?.settings ?? DEFAULT_SETTINGS) };
    this.onSettings = services?.onSettings;
    this.borders = services?.borders ?? null;
    this.measure = services?.measure ?? ROUGH_MEASURE;
  }

  /** CSS px per scene px changed (resize, zoom). */
  setScale(cssScale: number) {
    this.cssScale = cssScale;
    this.layout = computeLayout(cssScale, this.placement);
  }

  get tabVisible(): boolean {
    return this.touchSeen && !this.barOpen && !this.panel && !this.session.busy;
  }

  /** The dialogue list box as laid out now, if the player is choosing. */
  get choiceBox(): ChoiceBox | null {
    const list = this.session.choices;
    if (!list) return null;
    // A new list starts on its first page.
    if (list !== this.pagedList) {
      this.pagedList = list;
      this.choicePage = 0;
    }
    const { question } = list;
    return layoutChoices({
      unit: this.layout.unit,
      count: list.options.length,
      page: this.choicePage,
      placement: this.placement,
      borders: this.borders,
      question: { name: question.character === null ? null : this.session.speakerName(question.character), text: question.text },
      measure: this.measure,
      size: textStyle(this.session.game.style, "", this.settings.textSize).size,
    });
  }

  /** Inventory items shown in the grid, in cell order. */
  get items(): string[] {
    return this.session.state.inventory.slice(0, this.layout.inventory.cells.length);
  }

  // ── Pointer events (scene coordinates; null = off the scene) ──────────────

  pointerDown(p: Vec | null, kind: PointerKind, button = 0) {
    if (kind !== "mouse") {
      this.touchSeen = true;
      this.cursor = null;
    }
    if (button === 2) {
      this.secondary();
      return;
    }
    if (button !== 0 || !p) return;
    if (kind === "mouse") {
      this.activate(p);
      return;
    }
    // Touch and pen act on release, so a hold can show the label instead.
    this.press = { at: p, kind, held: 0, long: false, moved: false };
  }

  pointerMove(p: Vec | null, kind: PointerKind) {
    if (kind === "mouse") {
      this.cursor = p;
      this.hover(p);
      return;
    }
    const press = this.press;
    if (press && p && Math.hypot(p[0] - press.at[0], p[1] - press.at[1]) * this.cssScale > HOLD_SLOP_CSS) {
      press.moved = true;
      if (press.long) this.label = null;
    }
  }

  pointerUp(p: Vec | null, kind: PointerKind) {
    if (kind === "mouse") return;
    const press = this.press;
    this.press = null;
    if (!press) return;
    if (press.long) {
      this.label = null;
      return;
    }
    if (!press.moved && p) this.activate(press.at);
  }

  pointerCancel() {
    this.press = null;
    this.label = null;
  }

  tick(dt: number) {
    if (this.notice) {
      this.notice.timeLeft -= dt;
      if (this.notice.timeLeft <= 0) this.notice = null;
    }
    const press = this.press;
    if (press && !press.long && !press.moved) {
      press.held += dt;
      if (press.held >= HOLD_SECONDS) {
        press.long = true;
        const t = this.panel || this.inBar(press.at) ? null : this.session.world.hitTest(press.at);
        this.label = t ? { text: t.name, at: press.at } : null;
      }
    }
    // The bar can't stay open under a sequence, and the item it shows may go away.
    if (this.session.busy && this.barOpen && !this.session.text) this.barOpen = false;
    if (this.inventoryMode === "item" && !this.session.item) this.inventoryMode = "select";
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private secondary() {
    if (this.panel || this.barOpen) return;
    this.session.secondaryClick();
  }

  /** A click or a tap (released without a hold) at `p`. */
  private activate(p: Vec) {
    const s = this.session;
    const L = this.layout;
    // The slot list and volume panel sit over everything, the death box included.
    if (this.panel === "save" || this.panel === "load") return this.slotsClick(p);
    if (this.panel === "volume") return this.volumeClick(p);
    if (this.panel === "textsize") return this.textSizeClick(p);
    if (s.ending) return this.endingClick(p);
    // Text first: any click skips it, over the scene or the inventory.
    if (s.text) {
      s.skipText();
      return;
    }
    if (s.choices) return this.choiceClick(p);
    if (this.panel === "inventory") return this.inventoryClick(p);
    if (this.panel === "settings") return this.settingsClick(p);
    if (this.barOpen) {
      if (inRect(p, L.bar)) return this.barClick(p);
      this.barOpen = false;
      return;
    }
    if (s.busy) return;
    if (this.tabVisible && inRect(p, L.tab.hit)) {
      this.barOpen = true;
      return;
    }
    s.primaryClick(p);
  }

  /** A tap on an option picks it; "More…" turns the page. */
  private choiceClick(p: Vec) {
    const box = this.choiceBox;
    const list = this.session.choices;
    if (!box || !list) return;
    if (box.more && inRect(p, box.more)) {
      this.choicePage = (this.choicePage + 1) % box.pages;
      return;
    }
    const i = box.rows.findIndex((r) => inRect(p, r));
    const option = i >= 0 ? list.options[box.first + i] : undefined;
    if (option) this.session.choose(option.id);
  }

  private barClick(p: Vec) {
    const id = hitButton(this.layout.barButtons, p);
    if (!id) return;
    const s = this.session;
    switch (id) {
      case "inventory":
        this.openInventory();
        break;
      case "settings":
        this.panel = "settings";
        break;
      case "item":
        if (!s.item) return;
        s.selectVerb("item");
        break;
      default:
        s.selectVerb(id satisfies Verb);
    }
    this.barOpen = false;
  }

  openInventory() {
    this.panel = "inventory";
    this.barOpen = false;
    this.inventoryMode = this.session.verb === "item" && this.session.item ? "item" : "select";
  }

  private inventoryClick(p: Vec) {
    const L = this.layout.inventory;
    const s = this.session;
    const button: InventoryButtonId | null = hitButton(L.buttons, p);
    if (button === "ok") {
      this.panel = null;
      return;
    }
    if (button === "item") {
      if (s.item) this.inventoryMode = "item";
      return;
    }
    if (button) {
      this.inventoryMode = button;
      return;
    }
    const cell = L.cells.findIndex((c) => inRect(p, c));
    const item = cell >= 0 ? this.items[cell] : undefined;
    if (!item) return;
    switch (this.inventoryMode) {
      case "look":
        s.lookAtItem(item);
        return;
      case "select":
        s.selectItem(item);
        this.panel = null;
        return;
      case "item":
        if (s.item) s.combineItems(s.item, item);
        return;
    }
  }

  private settingsClick(p: Vec) {
    switch (hitButton(this.layout.settings.buttons, p)) {
      case "restart":
        this.restart();
        return;
      case "save":
        this.openSlots("save");
        return;
      case "load":
        if (this.slots.any) this.openSlots("load");
        return;
      case "volume":
        this.panel = "volume";
        return;
      case "textsize":
        this.panel = "textsize";
        return;
      case "close":
        this.panel = null;
        return;
      default:
        return;
    }
  }

  /** The death or win box: Restore · Restart · Try again. */
  private endingClick(p: Vec) {
    const ending = this.session.ending!;
    const L = this.layout.ending;
    switch (hitButton(ending.kind === "die" ? L.buttons : L.win, p)) {
      case "restore":
        if (this.slots.any) this.openSlots("load");
        return;
      case "restart":
        this.restart();
        return;
      case "try_again":
        this.session.tryAgain();
        this.closeAll();
        return;
      default:
        return;
    }
  }

  /** Opens the save or load list on a sensible slot: the first empty one to save, the newest save to load. */
  openSlots(mode: "save" | "load") {
    const list = this.slots.list;
    let pick: number | null = null;
    if (mode === "save") {
      const empty = list.findIndex((x) => x === null);
      pick = empty >= 0 ? empty : null;
    } else {
      let newest = -1;
      list.forEach((x, i) => {
        if (x && (newest < 0 || x.savedAt > list[newest]!.savedAt)) newest = i;
      });
      pick = newest >= 0 ? newest : null;
    }
    this.panel = mode;
    this.barOpen = false;
    this.slot = pick;
    this.slotPage = pick === null ? 0 : Math.floor(pick / this.layout.slots.perPage);
  }

  /** Slot index shown in a row of the list on the current page, if any. */
  slotAt(row: number): number | null {
    const i = this.slotPage * this.layout.slots.perPage + row;
    return i < SLOT_COUNT ? i : null;
  }

  /** The Save / Load button works: a slot is picked (and, to load, holds a save). */
  get slotActionEnabled(): boolean {
    if (this.slot === null) return false;
    return this.panel === "save" || this.slots.list[this.slot] !== null;
  }

  private slotsClick(p: Vec) {
    const L = this.layout.slots;
    const button = hitButton(L.buttons, p);
    if (button === "cancel") {
      // Back to where the list was opened from: the death box needs no panel.
      this.panel = this.session.ending ? null : "settings";
      return;
    }
    if (button === "more") {
      this.slotPage = (this.slotPage + 1) % L.pages;
      return;
    }
    if (button === "act") {
      if (this.slotActionEnabled) (this.panel === "save" ? this.saveTo(this.slot!) : this.loadFrom(this.slot!));
      return;
    }
    const r = L.rows.findIndex((row) => inRect(p, row));
    const i = r >= 0 ? this.slotAt(r) : null;
    if (i !== null && (this.panel === "save" || this.slots.list[i])) this.slot = i;
  }

  /** Saves the game into a slot, named after the scene and score. */
  saveTo(index: number): boolean {
    const s = this.session;
    const name = `${s.scene.name} · Score ${score(s.state)} of ${s.game.maxScore}`;
    const ok = this.slots.save(index, name, s.state);
    this.panel = null;
    this.showNotice(ok ? `Game saved in slot ${index + 1}.` : (this.slots.error ?? "The game couldn't be saved."));
    return ok;
  }

  /** Loads a slot's save. */
  loadFrom(index: number): boolean {
    const slot = this.slots.get(index);
    if (!slot) return false;
    this.session.load(slot.state);
    this.closeAll();
    return true;
  }

  private volumeClick(p: Vec) {
    const id = hitButton(this.layout.volume.buttons, p);
    if (!id) return;
    if (id === "ok") {
      this.panel = "settings";
      return;
    }
    const key = id.startsWith("music") ? "music" : "sfx";
    const step = id.endsWith("_up") ? 1 : -1;
    const next = Math.max(0, Math.min(VOLUME_STEPS, this.settings[key] + step));
    if (next === this.settings[key]) return;
    this.settings = { ...this.settings, [key]: next };
    this.onSettings?.(this.settings);
  }

  private textSizeClick(p: Vec) {
    const id = hitButton(this.layout.textSize.buttons, p);
    if (!id) return;
    if (id === "ok") {
      this.panel = "settings";
      return;
    }
    const step = id === "size_up" ? TEXT_SCALE_STEP : -TEXT_SCALE_STEP;
    const next = Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, this.settings.textSize + step));
    if (next === this.settings.textSize) return;
    this.settings = { ...this.settings, textSize: next };
    this.onSettings?.(this.settings);
  }

  showNotice(text: string) {
    this.notice = { text, timeLeft: NOTICE_SECONDS };
  }

  private restart() {
    this.session.requestRestart();
    this.closeAll();
  }

  private closeAll() {
    this.panel = null;
    this.barOpen = false;
    this.label = null;
  }

  private inBar(p: Vec) {
    return this.barOpen && inRect(p, this.layout.bar);
  }

  /** Mouse hover: reveal the bar at the top edge, label what's under the cursor. */
  private hover(p: Vec | null) {
    const s = this.session;
    if (!p) {
      this.label = null;
      return;
    }
    if (!this.panel && !s.busy) {
      if (p[1] * this.cssScale < REVEAL_CSS) this.barOpen = true;
      else if (this.barOpen && !inRect(p, this.layout.bar)) this.barOpen = false;
    }
    const t = this.panel || this.inBar(p) || s.busy ? null : s.world.hitTest(p);
    this.label = t ? { text: t.name, at: p } : null;
  }
}
