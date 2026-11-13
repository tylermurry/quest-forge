// Editor UI state: open tabs, selection, expanded folders, search.
// Not game data and never undone. DOM-free; React subscribes to it.
import type { Location, Project } from "@questforge/schema";
import { opensTab, sectionEntries, sectionFolders, type Section } from "./browser.ts";
import { GENERAL_SECTIONS, INITIAL_GAME_NAV, generalSectionFor, stylingSectionFor, type GameSection, type GameSettingsNav, type GeneralSection, type StylingSection } from "./gameSettings.ts";
import type { Jump } from "./locate.ts";
import type { PointPick } from "./rules/pointPick.ts";
import { SceneUiStore } from "./scene/sceneUi.ts";
import { LIST_LAYER, type ThingList } from "./scene/things.ts";

export interface EntryRef {
  section: Section;
  id: string;
}

export type Selection =
  | { kind: "entry"; section: Section; id: string }
  | { kind: "folder"; section: Section; path: string }
  | { kind: "sceneThing"; scene: string; list: ThingList; key: string }
  /** Game-level rules and default responses. */
  | { kind: "game" }
  /** A node on a dialogue graph. */
  | { kind: "dialogueNode"; dialogue: string; node: string }
  | null;

/** The spot a jump-to points at, which the Inspector scrolls to and flashes. `seq` changes on every jump. */
export interface Highlight {
  location: Location;
  seq: number;
  /** Where the jump came from: a problem flashes red; a playtest log line or a "Used by" link, blue. */
  tone: FlashTone;
}

export type FlashTone = "problem" | "log";

/** The `active` key of the Game Settings tab. Entry tabs are `section:id`, so it can't collide. */
export const GAME_TAB = "game";

export const refKey = (r: EntryRef) => `${r.section}:${r.id}`;
const folderKey = (section: Section, path: string) => `${section}/${path}`;

export class WorkspaceState {
  tabs: EntryRef[] = [];
  active: string | null = null;
  /** Whether the singleton Game Settings tab is open. It sits before the entry tabs. */
  gameTab = false;
  /** The Game Settings tab's area and subsection per area; kept while the tab is closed. */
  gameNav: GameSettingsNav = { ...INITIAL_GAME_NAV };
  selection: Selection = null;
  /** Expanded folders by `folderKey`; sections are expanded by default (key with path ""). */
  expanded = new Set<string>();
  collapsedSections = new Set<Section>();
  search = "";
  /** A field the Inspector should focus next (e.g. a new hotspot's name); it clears it. */
  focusRequest: string | null = null;
  /** The Inspector's tab for things with rules. Kept while the selection changes. */
  inspectorTab: "details" | "rules" = "details";
  /** A rule action's point waiting for a click on its scene's canvas. */
  pointPick: (PointPick & { restore: Selection }) | null = null;
  /** The last jump-to's spot; cleared once the Inspector has shown it. */
  highlight: Highlight | null = null;
  /** Bumped when something asks to show the Problems dock (e.g. Play blocked by errors); the Workspace expands it. */
  dockRequest = 0;
  /** Bumped by every jump-to so the Workspace shows the Inspector before the spot is highlighted. */
  inspectorRequest = 0;
  /** Per-scene canvas state: layers, tool, zoom. Has its own subscription. */
  readonly sceneUi = new SceneUiStore();

  private _version = 0;
  private listeners = new Set<() => void>();
  get version() {
    return this._version;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  /** Opens (or focuses) an entry's tab and selects it (a click in the project browser). */
  open(ref: EntryRef) {
    if (!this.tabs.some((t) => refKey(t) === refKey(ref))) this.tabs = [...this.tabs, ref];
    this.active = refKey(ref);
    this.selection = { kind: "entry", ...ref };
    this.changed();
  }

  close(ref: EntryRef) {
    const i = this.tabs.findIndex((t) => refKey(t) === refKey(ref));
    if (i < 0) return;
    this.tabs = this.tabs.filter((_, j) => j !== i);
    if (this.active === refKey(ref)) {
      const next = this.tabs[Math.min(i, this.tabs.length - 1)];
      this.active = next ? refKey(next) : this.gameTab ? GAME_TAB : null;
    }
    this.changed();
  }

  activate(ref: EntryRef) {
    this.active = refKey(ref);
    this.selection = { kind: "entry", ...ref };
    this.changed();
  }

  /** Opens (or focuses) the one Game Settings tab and selects the Game. */
  openGame() {
    this.gameTab = true;
    this.active = GAME_TAB;
    this.selection = { kind: "game" };
    this.changed();
  }

  closeGame() {
    if (!this.gameTab) return;
    this.gameTab = false;
    if (this.active === GAME_TAB) {
      const next = this.tabs[0];
      this.active = next ? refKey(next) : null;
      this.selection = next ? { kind: "entry", ...next } : null;
    }
    this.changed();
  }

  get gameActive(): boolean {
    return this.active === GAME_TAB;
  }

  /** Shows a subsection of the Game Settings tab (and its area). */
  setGameSection(section: GameSection) {
    this.gameNav = GENERAL_SECTIONS.some((g) => g.section === section)
      ? { ...this.gameNav, area: "general", general: section as GeneralSection }
      : { ...this.gameNav, area: "styling", styling: section as StylingSection };
    this.changed();
  }

  /** Shows the Problems dock, expanding it if it is collapsed. */
  showProblems() {
    this.dockRequest++;
    this.changed();
  }

  /** The scene of the active tab, if a scene tab is active. */
  get activeScene(): string | null {
    return this.active?.startsWith("scene:") ? this.active.slice("scene:".length) : null;
  }

  setInspectorTab(tab: "details" | "rules") {
    if (this.inspectorTab === tab) return;
    this.inspectorTab = tab;
    this.changed();
  }

  requestFocus(field: string) {
    // The fields that ask for focus (a new hotspot's name) are on the Details tab.
    this.inspectorTab = "details";
    this.focusRequest = field;
    this.changed();
  }

  takeFocusRequest(): string | null {
    const f = this.focusRequest;
    this.focusRequest = null;
    return f;
  }

  select(selection: Selection) {
    this.selection = selection;
    this.changed();
  }

  /** Jump-to from a problem: opens and selects the exact thing, then highlights the spot. */
  jumpTo({ target, location }: Jump, tone: FlashTone = "problem") {
    this.inspectorRequest++;
    switch (target.kind) {
      case "entry":
        if (opensTab(target.entry.section)) this.open(target.entry);
        else this.selection = { kind: "entry", ...target.entry };
        this.collapsedSections.delete(target.entry.section);
        break;
      case "sceneThing":
        this.open({ section: "scene", id: target.scene });
        this.selection = { kind: "sceneThing", scene: target.scene, list: target.list, key: target.key };
        this.sceneUi.setLayer(target.scene, LIST_LAYER[target.list]);
        break;
      case "scene":
        this.open({ section: "scene", id: target.scene });
        break;
      case "game":
        // Opens Game Settings on the subsection the field lives in (a `style` path opens Styling); General's editor flashes the field.
        this.gameTab = true;
        this.active = GAME_TAB;
        this.selection = { kind: "game" };
        {
          const styling = stylingSectionFor(location.path);
          this.gameNav = styling ? { ...this.gameNav, area: "styling", styling } : { ...this.gameNav, area: "general", general: generalSectionFor(location.path) };
        }
        break;
      case "dialogueNode":
        // The graph selects the node, and the Inspector edits it.
        this.open({ section: "dialogue", id: target.dialogue });
        this.selection = { kind: "dialogueNode", dialogue: target.dialogue, node: target.node };
        break;
    }
    // A problem inside a rule opens the Rules tab; anything else, Details.
    this.inspectorTab = location.path.includes("rules") ? "rules" : "details";
    this.highlight = { location, seq: (this.highlight?.seq ?? 0) + 1, tone };
    this.changed();
  }

  /**
   * Starts "Pick on canvas": shows the pick's scene (opening its tab if needed) and
   * remembers the selection, which comes back when the pick ends.
   */
  startPointPick(pick: PointPick) {
    const restore = this.selection;
    if (this.active !== refKey({ section: "scene", id: pick.scene })) this.open({ section: "scene", id: pick.scene });
    this.selection = restore;
    this.pointPick = { ...pick, restore };
    this.changed();
  }

  /** Ends a pick (placed or cancelled) and brings back the Inspector it started from. */
  endPointPick() {
    if (!this.pointPick) return;
    this.selection = this.pointPick.restore;
    this.pointPick = null;
    this.changed();
  }

  /** Highlights a spot without changing the selection, e.g. "Set by rule N". */
  flash(location: Location) {
    this.highlight = { location, seq: (this.highlight?.seq ?? 0) + 1, tone: "problem" };
    this.changed();
  }

  /** The Inspector showed the highlight; it doesn't come back on the next render. */
  clearHighlight() {
    if (!this.highlight) return;
    this.highlight = null;
    this.changed();
  }

  toggleFolder(section: Section, path: string) {
    if (path === "") {
      if (this.collapsedSections.has(section)) this.collapsedSections.delete(section);
      else this.collapsedSections.add(section);
    } else {
      const k = folderKey(section, path);
      if (this.expanded.has(k)) this.expanded.delete(k);
      else this.expanded.add(k);
    }
    this.changed();
  }

  /** Expands a folder and its parents (e.g. after creating something inside it). */
  reveal(section: Section, path: string) {
    this.collapsedSections.delete(section);
    const segs = path ? path.split("/") : [];
    segs.forEach((_, i) => this.expanded.add(folderKey(section, segs.slice(0, i + 1).join("/"))));
    this.changed();
  }

  isExpanded(section: Section, path: string) {
    return path === "" ? !this.collapsedSections.has(section) : this.expanded.has(folderKey(section, path));
  }

  setSearch(q: string) {
    this.search = q;
    this.changed();
  }

  /** An entry's ID changed (Change ID…): its tab and selection follow. */
  renamed(section: Section, from: string, to: string) {
    const remap = (r: EntryRef) => (r.section === section && r.id === from ? { section, id: to } : r);
    this.tabs = this.tabs.map(remap);
    if (this.active === refKey({ section, id: from })) this.active = refKey({ section, id: to });
    if (this.selection?.kind === "entry" && this.selection.section === section && this.selection.id === from) this.selection = { ...this.selection, id: to };
    if (this.selection?.kind === "sceneThing" && section === "scene" && this.selection.scene === from) this.selection = { ...this.selection, scene: to };
    if (this.selection?.kind === "dialogueNode" && section === "dialogue" && this.selection.dialogue === from) this.selection = { ...this.selection, dialogue: to };
    if (section === "scene") this.sceneUi.renamed(from, to);
    this.changed();
  }

  /** Drops tabs, selection and expanded folders that no longer exist (after delete, undo, reload). */
  reconcile(project: Project) {
    const ids = new Map<Section, Set<string>>();
    const has = (r: EntryRef) => {
      if (!ids.has(r.section)) ids.set(r.section, new Set(sectionEntries(project, r.section).map((e) => e.id)));
      return ids.get(r.section)!.has(r.id);
    };
    const tabs = this.tabs.filter(has);
    let changed = tabs.length !== this.tabs.length;
    this.tabs = tabs;
    if (this.active && this.active !== GAME_TAB && !tabs.some((t) => refKey(t) === this.active)) {
      this.active = tabs[0] ? refKey(tabs[0]) : this.gameTab ? GAME_TAB : null;
      changed = true;
    }
    const s = this.selection;
    const gone =
      (s?.kind === "entry" && !has(s)) ||
      (s?.kind === "folder" && s.path !== "" && !sectionFolders(project, s.section).includes(s.path)) ||
      (s?.kind === "sceneThing" && !has({ section: "scene", id: s.scene })) ||
      (s?.kind === "dialogueNode" && !project.dialogues.some((d) => d.data.id === s.dialogue && d.data.nodes.some((n) => n.id === s.node)));
    if (gone) {
      this.selection = null;
      changed = true;
    }
    if (changed) this.changed();
  }
}
