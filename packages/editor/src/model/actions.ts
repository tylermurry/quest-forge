// What the browser's buttons, menus and drags do: each runs one command as one
// undo step with a readable label, and keeps the workspace (tabs, selection) in
// step. DOM-free so it's testable; React components only call these.
import { isAssetKind, sectionEntries, type Section } from "./browser.ts";
import {
  changeId,
  createEntry,
  createFolder,
  deleteEntry,
  deleteFolder,
  deleteSceneThing,
  deleteSpawn,
  describeReferences,
  duplicateEntry,
  entriesInFolder,
  entryReferences,
  folderReferences,
  moveEntry,
  relocateFolder,
  renameEntry,
  sceneThingReferences,
  summarizeReferences,
  uniqueFolderName,
  type SceneList,
} from "./commands.ts";
import type { Editor } from "./editor.ts";
import { importFiles, type ImportFile } from "./importing.ts";
import type { WorkspaceState } from "./workspace.ts";

export const NOUN: Record<Section, string> = {
  scene: "scene",
  item: "item",
  character: "character",
  dialogue: "dialogue",
  flag: "flag",
  image: "image",
  audio: "sound",
};

/** What a delete would break, for the confirm dialog. Null: nothing uses it. */
export interface DeleteWarning {
  title: string;
  summary: string;
  lines: string[];
}

/** Something being dragged within the browser. */
export type DragItem = { section: Section; kind: "entry"; id: string } | { section: Section; kind: "folder"; path: string };

export class Actions {
  constructor(
    readonly editor: Editor,
    readonly ws: WorkspaceState,
    /** URL for showing a project file, when the host can serve one. */
    readonly assetUrl?: (path: string) => string,
  ) {
    // Undo, redo and reloads can remove what tabs show. During an action the
    // action itself updates the workspace first (e.g. a tab follows Change ID).
    editor.subscribe(() => {
      if (!this.busy) ws.reconcile(editor.project);
    });
  }

  private busy = false;
  private quietly<T>(f: () => T): T {
    this.busy = true;
    try {
      return f();
    } finally {
      this.busy = false;
    }
  }

  private get project() {
    return this.editor.project;
  }

  newFolder(section: Section, parent: string): string | null {
    const name = uniqueFolderName(this.project, section, parent);
    const made = this.editor.applyWith("Create folder", (p) => createFolder(p, section, parent, name));
    if (!made) return null;
    this.ws.reveal(section, made.folder);
    this.ws.select({ kind: "folder", section, path: made.folder });
    return made.folder;
  }

  newEntry(section: Section, folder: string): string | null {
    const made = this.editor.applyWith(`Create ${NOUN[section]}`, (p) => createEntry(p, section, folder));
    if (!made) return null;
    this.ws.reveal(section, folder);
    if (isAssetKind(section)) this.ws.open({ section, id: made.id });
    else this.ws.select({ kind: "entry", section, id: made.id });
    return made.id;
  }

  /** Drop `item` on a folder (`""` = the section root). Different sections are ignored. */
  drop(item: DragItem, section: Section, folder: string): boolean {
    if (item.section !== section) return false;
    if (item.kind === "entry") {
      const entry = sectionEntries(this.project, section).find((e) => e.id === item.id);
      if (!entry || entry.folder === folder) return false;
      const ok = this.editor.apply(`Move ${NOUN[section]}`, (p) => moveEntry(p, section, item.id, folder));
      if (ok) this.ws.reveal(section, folder);
      return ok;
    }
    const name = item.path.split("/").pop()!;
    const to = folder ? `${folder}/${name}` : name;
    // Dropping a folder on itself or inside itself does nothing (like Finder), quietly.
    if (to === item.path || folder === item.path || folder.startsWith(`${item.path}/`)) return false;
    const ok = this.editor.apply("Move folder", (p) => relocateFolder(p, section, item.path, to));
    if (ok) {
      this.ws.reveal(section, to);
      this.ws.select({ kind: "folder", section, path: to });
    }
    return ok;
  }

  renameFolder(section: Section, path: string, name: string): boolean {
    const parent = path.split("/").slice(0, -1).join("/");
    const to = parent ? `${parent}/${name.trim()}` : name.trim();
    if (to === path) return false;
    const ok = this.editor.apply("Rename folder", (p) => relocateFolder(p, section, path, to));
    if (ok) {
      this.ws.reveal(section, to);
      this.ws.select({ kind: "folder", section, path: to });
    }
    return ok;
  }

  /** Inline rename: the display name, or the ID for flags/images/sounds. */
  rename(section: Section, id: string, name: string): boolean {
    const ok = this.quietly(() => this.editor.apply(`Rename ${NOUN[section]}`, (p) => renameEntry(p, section, id, name)));
    if (ok && !isAssetKind(section)) this.ws.renamed(section, id, name);
    this.ws.reconcile(this.project);
    return ok;
  }

  changeId(section: Section, from: string, to: string): boolean {
    const ok = this.quietly(() => this.editor.apply(`Change ${NOUN[section]} ID`, (p) => changeId(p, section, from, to)));
    if (ok) this.ws.renamed(section, from, to);
    this.ws.reconcile(this.project);
    return ok;
  }

  /** "Updates 3 references" text for the Change ID dialog. */
  changeIdImpact(section: Section, id: string): string {
    const n = entryReferences(this.project, section, id).length;
    return n === 0 ? "Nothing refers to it yet." : `Also updates ${n} reference${n === 1 ? "" : "s"} to it.`;
  }

  duplicate(section: Section, id: string): string | null {
    const made = this.editor.applyWith(`Duplicate ${NOUN[section]}`, (p) => duplicateEntry(p, section, id));
    if (!made) return null;
    this.ws.select({ kind: "entry", section, id: made.id });
    return made.id;
  }

  deleteWarning(section: Section, id: string): DeleteWarning | null {
    const refs = entryReferences(this.project, section, id);
    const summary = summarizeReferences(refs);
    if (!summary) return null;
    return { title: `Delete ${NOUN[section]} ${id}?`, summary, lines: describeReferences(this.project, refs) };
  }

  delete(section: Section, id: string): boolean {
    return this.editor.apply(`Delete ${NOUN[section]}`, (p) => deleteEntry(p, section, id));
  }

  /** Empty folders delete without asking; anything else gets a warning. */
  deleteFolderWarning(section: Section, path: string): DeleteWarning | null {
    const inside = entriesInFolder(this.project, section, path);
    if (!inside.length) return null;
    const refs = folderReferences(this.project, section, path);
    const things = `${inside.length} ${inside.length === 1 ? NOUN[section] : `${NOUN[section]}s`}`;
    return {
      title: `Delete folder ${path.split("/").pop()}?`,
      summary: `It holds ${things}.${refs.length ? ` ${summarizeReferences(refs)}.` : ""}`,
      lines: describeReferences(this.project, refs),
    };
  }

  deleteFolder(section: Section, path: string): boolean {
    return this.editor.apply("Delete folder", (p) => deleteFolder(p, section, path));
  }

  /** Imports files dropped from the OS as one undo step. Refused files get a notice. */
  importFiles(section: Section, folder: string, files: ImportFile[]): number {
    let refused: string[] = [];
    let count = 0;
    let last: { section: Section; id: string } | null = null;
    this.editor.apply(`Import ${files.length === 1 ? "file" : "files"}`, (p) => {
      const r = importFiles(p, files, section, folder);
      refused = r.refused;
      count = r.imported.length;
      const first = r.imported[0];
      if (first) last = { section: first.section, id: first.id };
      return r.project;
    });
    if (last) {
      const target: { section: Section; id: string } = last;
      this.ws.reveal(target.section, folder);
      this.ws.select({ kind: "entry", ...target });
    }
    if (refused.length) {
      this.editor.showNotice({
        kind: "error",
        text: `Not imported: ${refused.join(", ")}. Quest Forge imports images (PNG, JPG, WebP) and sounds (MP3, OGG, WAV).`,
      });
    }
    return count;
  }

  // ── Scene outline ────────────────────────────────────────────────────

  sceneThingWarning(scene: string, kind: "object" | "spawn", id: string): DeleteWarning | null {
    const refs = sceneThingReferences(this.project, scene, kind, id);
    const summary = summarizeReferences(refs);
    return summary ? { title: `Delete ${kind === "spawn" ? "spawn point" : kind} ${id}?`, summary, lines: describeReferences(this.project, refs) } : null;
  }

  deleteSceneThing(scene: string, list: SceneList, index: number, label: string): boolean {
    const ok = this.editor.apply(`Delete ${label}`, (p) => deleteSceneThing(p, scene, list, index));
    if (ok) this.ws.select({ kind: "entry", section: "scene", id: scene });
    return ok;
  }

  deleteSpawn(scene: string, spawn: string): boolean {
    const ok = this.editor.apply("Delete spawn point", (p) => deleteSpawn(p, scene, spawn));
    if (ok) this.ws.select({ kind: "entry", section: "scene", id: scene });
    return ok;
  }
}
