// Editor UI state (spec 08 layout): open tabs, selection, expanded folders, search.
// Not game data and never undone (D84). DOM-free; React subscribes to it.
import type { Location, Project } from "@questforge/schema";
import { opensTab, sectionEntries, sectionFolders, type Section } from "./browser.ts";
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
  /** Game-level rules and default responses (spec 10). */
  | { kind: "game" }
  | null;

/** The spot a jump-to points at, which the Inspector scrolls to and flashes (D120). `seq` changes on every jump. */
export interface Highlight {
  location: Location;
  seq: number;
}

export const refKey = (r: EntryRef) => `${r.section}:${r.id}`;
export const folderKey = (section: Section, path: string) => `${section}/${path}`;

export class WorkspaceState {
  tabs: EntryRef[] = [];
  active: string | null = null;
  selection: Selection = null;
  /** Expanded folders by `folderKey`; sections are expanded by default (key with path ""). */
  expanded = new Set<string>();
  collapsedSections = new Set<Section>();
  search = "";
  /** A field the Inspector should focus next (e.g. a new hotspot's name, D99); it clears it. */
  focusRequest: string | null = null;
  /** The Inspector's tab for things with rules (D125). Kept while the selection changes. */
  inspectorTab: "details" | "rules" = "details";
  /** A rule action's point waiting for a click on its scene's canvas (D124). */
  pointPick: (PointPick & { restore: Selection }) | null = null;
  /** The last jump-to's spot (D120); cleared once the Inspector has shown it. */
  highlight: Highlight | null = null;
  /** Per-scene canvas state: layers, tool, zoom (D101). Has its own subscription. */
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

  /** Opens (or focuses) an entry's tab (spec 08: double-click opens it in a tab). */
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
      this.active = next ? refKey(next) : null;
    }
    this.changed();
  }

  activate(ref: EntryRef) {
    this.active = refKey(ref);
    this.selection = { kind: "entry", ...ref };
    this.changed();
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

  /** Jump-to from a problem (spec 14, D120): opens and selects the exact thing, then highlights the spot. */
  jumpTo({ target, location }: Jump) {
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
        this.selection = { kind: "game" };
        break;
      case "dialogueNode":
        this.open({ section: "dialogue", id: target.dialogue });
        break;
    }
    // A problem inside a rule opens the Rules tab; anything else, Details (D125).
    this.inspectorTab = location.path.includes("rules") ? "rules" : "details";
    this.highlight = { location, seq: (this.highlight?.seq ?? 0) + 1 };
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

  /** Highlights a spot without changing the selection, e.g. "Set by rule N" (D118). */
  flash(location: Location) {
    this.highlight = { location, seq: (this.highlight?.seq ?? 0) + 1 };
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
    if (this.active && !tabs.some((t) => refKey(t) === this.active)) {
      this.active = tabs[0] ? refKey(tabs[0]) : null;
      changed = true;
    }
    const s = this.selection;
    const gone =
      (s?.kind === "entry" && !has(s)) ||
      (s?.kind === "folder" && s.path !== "" && !sectionFolders(project, s.section).includes(s.path)) ||
      (s?.kind === "sceneThing" && !has({ section: "scene", id: s.scene }));
    if (gone) {
      this.selection = null;
      changed = true;
    }
    if (changed) this.changed();
  }
}
