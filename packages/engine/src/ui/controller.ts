import type { Session, Verb } from "../session.ts";
import type { Vec } from "../vec.ts";
import type { ChoiceList } from "../dialogue.ts";
import { choiceLayout, computeLayout, hitButton, inRect, type ChoiceBox, type InventoryButtonId, type Layout } from "./layout.ts";

// Player UI input (spec 06, D32, D33, D79, D80): the icon bar, inventory, settings,
// hover labels and tap-and-hold. Pointer events arrive in scene coordinates with
// their pointer type; nothing here touches the DOM, so it's tested in Node.

export type PointerKind = "mouse" | "touch" | "pen";

/** Mouse at the very top opens the bar (D79). */
export const REVEAL_CSS = 8;
/** Tap-and-hold (D79). */
export const HOLD_SECONDS = 0.4;
export const HOLD_SLOP_CSS = 10;

export type Panel = "inventory" | "settings" | null;
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
  /** A touch or pen has been seen: show the bar tab (D79). */
  touchSeen = false;
  panel: Panel = null;
  inventoryMode: InventoryMode = "select";
  /** Name label for what's under the pointer (hover or hold). */
  label: { text: string; at: Vec } | null = null;
  /** Mouse position for the drawn cursor (D77); null for touch. */
  cursor: Vec | null = null;
  /** Page of a long dialogue list box (UI state, D143). */
  choicePage = 0;
  private pagedList: ChoiceList | null = null;
  private press: Press | null = null;
  private cssScale = 1;

  constructor(readonly session: Session) {
    this.layout = computeLayout(1);
  }

  /** CSS px per scene px changed (resize, zoom). */
  setScale(cssScale: number) {
    this.cssScale = cssScale;
    this.layout = computeLayout(cssScale);
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
    return choiceLayout(this.layout.unit, list.options.length, this.choicePage);
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
    // Touch and pen act on release, so a hold can show the label instead (D79).
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
    const press = this.press;
    if (press && !press.long && !press.moved) {
      press.held += dt;
      if (press.held >= HOLD_SECONDS) {
        press.long = true;
        const t = this.panel || this.inBar(press.at) ? null : this.session.world.hitTest(press.at);
        this.label = t ? { text: t.name, at: press.at } : null;
      }
    }
    // The bar can't stay open under a sequence (D72), and the item it shows may go away.
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
    if (s.ending) {
      if (inRect(p, L.ending.restart)) this.restart();
      return;
    }
    // Text first: any click skips it, over the scene or the inventory (D72, D78).
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

  /** A tap on an option picks it; "More…" turns the page (D143). */
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
      case "close":
        this.panel = null;
        return;
      default:
        // Save, Load and Volume are disabled until M8 (D80).
        return;
    }
  }

  private restart() {
    this.session.requestRestart();
    this.panel = null;
    this.barOpen = false;
    this.label = null;
  }

  private inBar(p: Vec) {
    return this.barOpen && inRect(p, this.layout.bar);
  }

  /** Mouse hover: reveal the bar at the top edge, label what's under the cursor (D79). */
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
