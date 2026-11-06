// Editor UI state (spec 08 layout): open tabs, selection, expanded folders, search.
// Not game data and never undone (D84). DOM-free; React subscribes to it.
import type { Project } from "@questforge/schema";
import { sectionEntries, sectionFolders, type Section } from "./browser.ts";
import { SceneUiStore } from "./scene/sceneUi.ts";
import type { ThingList } from "./scene/things.ts";

export interface EntryRef {
  section: Section;
  id: string;
}

export type Selection =
  | { kind: "entry"; section: Section; id: string }
  | { kind: "folder"; section: Section; path: string }
  | { kind: "sceneThing"; scene: string; list: ThingList; key: string }
  | null;

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

  requestFocus(field: string) {
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
