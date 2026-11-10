// The project browser's model: one folder tree per section, built from
// the Project. DOM-free so it's testable in Node; the React tree only renders it.
import { ASSET_LAYOUT, SECTION_ROOTS, folderOf, sectionOfFolder, type AssetKind, type Doc, type Project, type RenameKind } from "@questforge/schema";

/** A browser section. Same kinds as the project-wide Rename command. */
export type Section = RenameKind;

export const SECTIONS: { section: Section; title: string }[] = [
  { section: "scene", title: "Scenes" },
  { section: "item", title: "Items" },
  { section: "character", title: "Characters" },
  { section: "dialogue", title: "Dialogues" },
  { section: "flag", title: "Flags" },
  { section: "audio", title: "Audio" },
  { section: "image", title: "Images" },
];

export const isAssetKind = (s: Section): s is AssetKind => s in ASSET_LAYOUT;
/** Sections whose entries open in a tab: assets, and images for slicing. */
export const opensTab = (s: Section) => isAssetKind(s) || s === "image";

/** One thing in the browser. `folder` is relative to the section root (`""` = root). */
export interface Entry {
  section: Section;
  id: string;
  /** Display name; the ID for kinds that have no name (flags, images, audio). */
  name: string;
  folder: string;
  /** Detail shown after the name, e.g. a flag's type. */
  detail?: string;
}

export interface FolderNode {
  section: Section;
  /** Relative to the section root; `""` is the section itself. */
  path: string;
  name: string;
  folders: FolderNode[];
  entries: Entry[];
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name) || (a.name < b.name ? -1 : 1);

/** The folder an image or audio file sits in, relative to its section root. */
export function assetFileFolder(section: "image" | "audio", path: string): string {
  const root = `${SECTION_ROOTS[section]}/`;
  return path.startsWith(root) ? path.slice(root.length).split("/").slice(0, -1).join("/") : "";
}

/** Every entry in a section. */
export function sectionEntries(project: Project, section: Section): Entry[] {
  if (isAssetKind(section)) {
    return (project[ASSET_LAYOUT[section].list] as Doc<{ id: string; name: string }>[]).map((d) => ({
      section,
      id: d.data.id,
      name: d.data.name,
      folder: folderOf(d.path),
    }));
  }
  if (section === "flag") {
    return (project.flags?.data.flags ?? []).map((f) => ({
      section,
      id: f.id,
      name: f.id,
      folder: f.folder ?? "",
      detail: f.type === "bool" ? `flag, starts ${f.initial}` : `counter, starts at ${f.initial}`,
    }));
  }
  const list = section === "image" ? project.assets?.data.images : project.assets?.data.audio;
  return (list ?? []).map((a) => ({ section, id: a.id, name: a.id, folder: assetFileFolder(section, a.path) }));
}

/** Every folder of a section (relative paths, parents included). */
export function sectionFolders(project: Project, section: Section): string[] {
  const out = new Set<string>();
  if (section === "flag") for (const f of project.flags?.data.folders ?? []) out.add(f);
  else {
    const root = SECTION_ROOTS[section];
    for (const f of project.folders) if (sectionOfFolder(f) === section) out.add(f.slice(root.length + 1));
  }
  for (const e of sectionEntries(project, section)) if (e.folder) out.add(e.folder);
  for (const f of [...out]) {
    const segs = f.split("/");
    for (let i = 1; i < segs.length; i++) out.add(segs.slice(0, i).join("/"));
  }
  return [...out].sort();
}

/** The folder tree of one section, sorted: folders first, then entries, by name. */
export function buildSection(project: Project, section: Section): FolderNode {
  const root: FolderNode = { section, path: "", name: "", folders: [], entries: [] };
  const nodes = new Map<string, FolderNode>([["", root]]);
  const node = (path: string): FolderNode => {
    const found = nodes.get(path);
    if (found) return found;
    const segs = path.split("/");
    const made: FolderNode = { section, path, name: segs[segs.length - 1]!, folders: [], entries: [] };
    nodes.set(path, made);
    node(segs.slice(0, -1).join("/")).folders.push(made);
    return made;
  };
  for (const f of sectionFolders(project, section)) node(f);
  for (const e of sectionEntries(project, section)) node(e.folder).entries.push(e);
  const sort = (n: FolderNode) => {
    n.folders.sort(byName);
    n.entries.sort(byName);
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/**
 * Filters a tree to entries whose name or ID contains the query,
 * keeping the folders that lead to them. An empty query keeps everything.
 */
export function filterTree(tree: FolderNode, query: string): FolderNode | null {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  const walk = (n: FolderNode): FolderNode | null => {
    const entries = n.entries.filter((e) => e.name.toLowerCase().includes(q) || e.id.includes(q));
    const folders = n.folders.map(walk).filter((f): f is FolderNode => f !== null);
    return entries.length || folders.length || n.path === "" ? { ...n, entries, folders } : null;
  };
  const out = walk(tree);
  return out && (out.entries.length || out.folders.length) ? out : null;
}

/** Number of entries in a tree. */
export const countEntries = (n: FolderNode): number => n.entries.length + n.folders.reduce((s, f) => s + countEntries(f), 0);
