// Project browser commands (spec 08, D83, D86). Each is a pure function from one
// immutable Project to the next, so undo is just keeping the old one (D84).
import {
  ASSET_LAYOUT,
  CharacterFile,
  DialogueFile,
  ID_PATTERN,
  ItemFile,
  SCHEMA_VERSION,
  SECTION_ROOTS,
  SceneFile,
  assetPath,
  collectReferences,
  definedIds,
  describeReference,
  emptyProject,
  findReferences,
  folderOf,
  moveAsset,
  renameId,
  withFolder,
  type AssetKind,
  type AssetsFile,
  type DataPath,
  type Doc,
  type FlagsFile,
  type Project,
  type RefKind,
  type Reference,
} from "@questforge/schema";
import { assetFileFolder, isAssetKind, sectionEntries, sectionFolders, type Section } from "./browser.ts";

/** A command the user can't do, with a plain-English reason for the UI. */
export class CommandError extends Error {}

const FOLDER_NAME = /^[^/\\.][^/\\]*$/;
const MAX_ID = 64;

/** A free ID: `base`, else `base_2`, `base_3`… (cut to fit 64 characters). */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const fit = (stem: string, suffix: string) => stem.slice(0, MAX_ID - suffix.length).replace(/_+$/, "") + suffix;
  if (!used.has(base) && base.length <= MAX_ID) return base;
  for (let n = 2; ; n++) {
    const id = fit(base, `_${n}`);
    if (!used.has(id)) return id;
  }
}

/** Turns any text into an ID slug (D63), e.g. a file name or a title. */
export function slugify(text: string, prefix = "id"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const id = /^[a-z]/.test(slug) ? slug : `${prefix}_${slug}`.replace(/_+$/, "");
  return id.slice(0, MAX_ID).replace(/_+$/, "");
}

const join = (...segs: string[]) => segs.filter((s) => s !== "").join("/");
const parentOf = (folder: string) => folder.split("/").slice(0, -1).join("/");
const inFolder = (folder: string, root: string) => folder === root || folder.startsWith(`${root}/`);

// ── Docs ─────────────────────────────────────────────────────────────────────

type AnyDoc = Doc<{ id: string; name: string }>;
const docsOf = (p: Project, kind: AssetKind) => p[ASSET_LAYOUT[kind].list] as AnyDoc[];
const withDocs = (p: Project, kind: AssetKind, docs: AnyDoc[]): Project => ({ ...p, [ASSET_LAYOUT[kind].list]: docs });

function findDoc(p: Project, kind: AssetKind, id: string): AnyDoc {
  const doc = docsOf(p, kind).find((d) => d.data.id === id);
  if (!doc) throw new CommandError(`There's no ${kind} with ID ${id}.`);
  return doc;
}

/** Replaces one asset's data. */
export function updateDoc<T>(p: Project, kind: AssetKind, id: string, f: (data: T) => T): Project {
  const doc = findDoc(p, kind, id);
  return withDocs(p, kind, docsOf(p, kind).map((d) => (d === doc ? { ...d, data: f(d.data as T) as AnyDoc["data"] } : d)));
}

function setFlags(p: Project, f: (data: FlagsFile) => FlagsFile): Project {
  const flags = p.flags ?? { path: "flags.yaml", data: { schemaVersion: SCHEMA_VERSION, flags: [] } };
  const { folders, ...rest } = f(flags.data);
  // `folders` is omitted when empty, so a project without flag folders keeps its file unchanged.
  const data: FlagsFile = folders?.length ? { ...rest, folders: [...new Set(folders)].sort() } : rest;
  return { ...p, flags: { ...flags, data } };
}

function setAssets(p: Project, f: (data: AssetsFile) => AssetsFile): Project {
  const assets = p.assets ?? { path: "assets.yaml", data: { schemaVersion: SCHEMA_VERSION, images: [], audio: [] } };
  return { ...p, assets: { ...assets, data: f(assets.data) } };
}

const assetList = (section: "image" | "audio") => (section === "image" ? "images" : "audio");

// ── Creating ─────────────────────────────────────────────────────────────────

/** The image a new scene or item starts with: a background-looking one, else the first. */
function defaultImage(p: Project, hint: RegExp): string {
  const images = p.assets?.data.images ?? [];
  return (images.find((i) => hint.test(i.id)) ?? images[0])?.id ?? "image";
}

/** Starting data for a new asset of each kind (dangling picks show as problems until set). */
export function newAssetData(p: Project, kind: AssetKind, id: string, name: string) {
  switch (kind) {
    case "scene":
      // An empty scene: no background, no walkable area yet, a default spawn (D97).
      return SceneFile.parse({
        schemaVersion: SCHEMA_VERSION,
        id,
        name,
        depth: { far: { y: 200, scale: 0.5 }, near: { y: 400, scale: 1 } },
        walkable: { outer: [], holes: [] },
        spawns: { default: { x: 320, y: 360, facing: "down" } },
        objects: [],
        characters: [],
        hotspots: [],
        regions: [],
        rules: [],
      });
    case "item":
      return ItemFile.parse({ schemaVersion: SCHEMA_VERSION, id, name, description: `It's a ${name.toLowerCase()}.`, icon: defaultImage(p, /icon/) });
    case "character":
      return CharacterFile.parse({ schemaVersion: SCHEMA_VERSION, id, name, textColor: "#ffffff", walkSpeed: 80, mirrorLeft: true, animations: {} });
    case "dialogue":
      return DialogueFile.parse({
        schemaVersion: SCHEMA_VERSION,
        id,
        name,
        nodes: [
          { id: "start", type: "start", pos: [0, 0], next: "end" },
          { id: "end", type: "end", pos: [240, 0] },
        ],
      });
  }
}

const NEW_NAME: Record<AssetKind | "flag", string> = {
  scene: "New scene",
  item: "New item",
  character: "New character",
  dialogue: "New dialogue",
  flag: "new_flag",
};

/** Creates a new asset or flag in a folder. Returns the project and the new ID. */
export function createEntry(p: Project, section: Section, folder: string): { project: Project; id: string } {
  if (section === "image" || section === "audio") throw new CommandError("Images and sounds are added by importing files.");
  if (section === "flag") return createFlag(p, NEW_NAME.flag, "bool", folder);
  return createNamedEntry(p, section, NEW_NAME[section], folder);
}

/** A new flag or counter whose ID comes from `name` (made unique). */
export function createFlag(p: Project, name: string, type: "bool" | "counter", folder = ""): { project: Project; id: string } {
  const id = uniqueId(slugify(name, "flag"), definedIds(p, "flag"));
  const flag = type === "bool" ? ({ id, type, initial: false } as const) : ({ id, type, initial: 0 } as const);
  const project = setFlags(p, (d) => ({ ...d, flags: [...d.flags, { ...flag, ...(folder && { folder }) }] }));
  return { project, id };
}

/** A new asset called `name`, its ID made from the name (D123: "+ Create new…" in a picker). */
export function createNamedEntry(p: Project, section: AssetKind, name: string, folder = ""): { project: Project; id: string } {
  if (!name.trim()) throw new CommandError("Type a name first.");
  name = name.trim();
  const id = uniqueId(slugify(name), definedIds(p, section));
  const data = newAssetData(p, section, id, name);
  const withDir = folder ? withFolder(p, `${SECTION_ROOTS[section]}/${folder}`) : p;
  const project = withDocs(withDir, section, [...docsOf(withDir, section), { path: assetPath(section, id, folder), data } as AnyDoc]);
  return { project, id };
}

// ── Folders ──────────────────────────────────────────────────────────────────

/** A folder name not yet used in `parent`: `name`, else `name 2`, `name 3`… */
export function uniqueFolderName(p: Project, section: Section, parent: string, name = "New folder"): string {
  const taken = new Set(sectionFolders(p, section));
  if (!taken.has(join(parent, name))) return name;
  for (let n = 2; ; n++) if (!taken.has(join(parent, `${name} ${n}`))) return `${name} ${n}`;
}

function checkFolderName(name: string) {
  if (!FOLDER_NAME.test(name)) throw new CommandError(`"${name}" can't be a folder name. Use a name without slashes that doesn't start with a dot.`);
}

/** Adds an empty folder (and its parents). Returns its path within the section. */
export function createFolder(p: Project, section: Section, parent: string, name: string): { project: Project; folder: string } {
  checkFolderName(name);
  const folder = join(parent, name);
  if (sectionFolders(p, section).includes(folder)) throw new CommandError(`There's already a folder called "${name}" here.`);
  if (section === "flag") return { project: setFlags(p, (d) => ({ ...d, folders: [...(d.folders ?? []), ...withParents(folder)] })), folder };
  return { project: withFolder(p, `${SECTION_ROOTS[section]}/${folder}`), folder };
}

const withParents = (folder: string) => folder.split("/").map((_, i, segs) => segs.slice(0, i + 1).join("/"));

/**
 * Moves or renames a folder: everything inside it moves along (only file paths
 * change, D22). `to` is the folder's new path within the section.
 */
export function relocateFolder(p: Project, section: Section, from: string, to: string): Project {
  if (from === to) return p;
  if (from === "") throw new CommandError("The section itself can't be moved.");
  to.split("/").forEach(checkFolderName);
  if (inFolder(to, from)) throw new CommandError("A folder can't go inside itself.");
  if (sectionFolders(p, section).includes(to)) throw new CommandError(`There's already a folder at ${to}.`);
  const remap = (f: string) => (inFolder(f, from) ? to + f.slice(from.length) : f);

  if (section === "flag") {
    return setFlags(p, (d) => ({
      ...d,
      folders: [...new Set([...(d.folders ?? []).map(remap), ...withParents(to)])],
      flags: d.flags.map((f) => (f.folder !== undefined && inFolder(f.folder, from) ? { ...f, folder: remap(f.folder) } : f)),
    }));
  }
  const root = SECTION_ROOTS[section];
  const full = (f: string) => `${root}/${f}`;
  let next: Project = {
    ...p,
    folders: [...new Set(p.folders.map((f) => (inFolder(f, full(from)) ? full(remap(f.slice(root.length + 1))) : f)))].sort(),
  };
  next = withFolder(next, full(to));
  if (isAssetKind(section)) {
    return withDocs(next, section, docsOf(next, section).map((d) => {
      const f = folderOf(d.path);
      return inFolder(f, from) ? { ...d, path: assetPath(section, d.data.id, remap(f)) } : d;
    }));
  }
  const list = assetList(section);
  return setAssets(next, (d) => ({
    ...d,
    [list]: d[list].map((a) => {
      const f = assetFileFolder(section, a.path);
      return a.path.startsWith(`${root}/`) && inFolder(f, from) ? { ...a, path: join(root, remap(f), a.path.split("/").pop()!) } : a;
    }),
  }));
}

/** Entries inside a folder, sub-folders included. */
export const entriesInFolder = (p: Project, section: Section, folder: string) =>
  sectionEntries(p, section).filter((e) => inFolder(e.folder, folder));

/** Deletes a folder and everything in it (after the user confirmed, D86). */
export function deleteFolder(p: Project, section: Section, folder: string): Project {
  if (folder === "") throw new CommandError("The section itself can't be deleted.");
  let next = entriesInFolder(p, section, folder).reduce((acc, e) => deleteEntry(acc, section, e.id), p);
  if (section === "flag") return setFlags(next, (d) => ({ ...d, folders: (d.folders ?? []).filter((f) => !inFolder(f, folder)) }));
  const full = `${SECTION_ROOTS[section]}/${folder}`;
  next = { ...next, folders: next.folders.filter((f) => !inFolder(f, full)) };
  return next;
}

// ── Entries ──────────────────────────────────────────────────────────────────

/** Moves an entry to another folder (drag-and-drop, D83). */
export function moveEntry(p: Project, section: Section, id: string, folder: string): Project {
  if (isAssetKind(section)) {
    findDoc(p, section, id);
    try {
      return moveAsset(p, section, id, folder);
    } catch (e) {
      throw new CommandError(e instanceof Error ? e.message : String(e));
    }
  }
  if (section === "flag") {
    if (folder && !sectionFolders(p, section).includes(folder)) p = createFolder(p, section, parentOf(folder), folder.split("/").pop()!).project;
    return setFlags(p, (d) => ({
      ...d,
      flags: d.flags.map((f) => {
        if (f.id !== id) return f;
        const { folder: _old, ...rest } = f;
        return folder ? { ...rest, folder } : rest;
      }),
    }));
  }
  const list = assetList(section);
  const root = SECTION_ROOTS[section];
  const entry = p.assets?.data[list].find((a) => a.id === id);
  if (!entry) throw new CommandError(`There's no ${section === "image" ? "image" : "sound"} with ID ${id}.`);
  const path = join(root, folder, entry.path.split("/").pop()!);
  if (path === entry.path) return p;
  if (assetPaths(p).has(path) || p.files.includes(path)) throw new CommandError(`A file called ${path.split("/").pop()} is already in that folder.`);
  const next = folder ? withFolder(p, `${root}/${folder}`) : p;
  return setAssets(next, (d) => ({ ...d, [list]: d[list].map((a) => (a.id === id ? { ...a, path } : a)) }));
}

const assetPaths = (p: Project) => new Set([...(p.assets?.data.images ?? []), ...(p.assets?.data.audio ?? [])].map((a) => a.path));

/**
 * Renames what the user sees (D86): the display name for scenes, items, characters
 * and dialogues; the ID for flags, images and sounds, which have no name.
 */
export function renameEntry(p: Project, section: Section, id: string, name: string): Project {
  if (!isAssetKind(section)) return changeId(p, section, id, name);
  if (name.trim() === "") throw new CommandError("A name can't be empty.");
  return updateDoc<{ name: string }>(p, section, id, (d) => ({ ...d, name: name.trim() }));
}

/** "Change ID…" (D86): changes an ID and every reference to it (spec 01). */
export function changeId(p: Project, section: Section, from: string, to: string): Project {
  if (!ID_PATTERN.test(to) || to.length > MAX_ID) {
    throw new CommandError(`"${to}" can't be an ID. Use lowercase letters, digits and underscores, starting with a letter.`);
  }
  try {
    return renameId(p, section, from, to);
  } catch (e) {
    throw new CommandError(e instanceof Error ? e.message : String(e));
  }
}

const REF_KINDS: Record<Section, RefKind[]> = {
  scene: ["scene"],
  item: ["item"],
  character: ["character"],
  dialogue: ["dialogue"],
  flag: ["flag", "counter"],
  image: ["image"],
  audio: ["audio"],
};

/** Every reference to an entry, e.g. for the delete warning or "Change ID…". */
export function entryReferences(p: Project, section: Section, id: string): Reference[] {
  return findReferences(p, REF_KINDS[section][0]!, id);
}

/** A copy of an asset or flag next to the original (D86). Returns the project and the copy's ID. */
export function duplicateEntry(p: Project, section: Section, id: string): { project: Project; id: string } {
  if (section === "image" || section === "audio") throw new CommandError("Images and sounds can't be duplicated. Import the file again instead.");
  const copyId = uniqueId(`${id}_copy`, definedIds(p, section));
  if (section === "flag") {
    const flag = p.flags?.data.flags.find((f) => f.id === id);
    if (!flag) throw new CommandError(`There's no flag with ID ${id}.`);
    const project = setFlags(p, (d) => {
      const i = d.flags.indexOf(flag);
      return { ...d, flags: [...d.flags.slice(0, i + 1), { ...flag, id: copyId }, ...d.flags.slice(i + 1)] };
    });
    return { project, id: copyId };
  }
  const doc = findDoc(p, section, id);
  const data = { ...structuredClone(doc.data), id: copyId, name: `${doc.data.name} (copy)` };
  const copy: AnyDoc = { path: assetPath(section, copyId, folderOf(doc.path)), data };
  if (section === "scene") retargetSelf(copy, id, copyId);
  const docs = docsOf(p, section);
  const i = docs.indexOf(doc);
  return { project: withDocs(p, section, [...docs.slice(0, i + 1), copy, ...docs.slice(i + 1)]), id: copyId };
}

/** In a duplicated scene, references to the original scene point at the copy instead (D86). */
function retargetSelf(copy: AnyDoc, from: string, to: string) {
  const solo: Project = { ...emptyProject(), scenes: [copy as unknown as Doc<SceneFile>] };
  for (const ref of collectReferences(solo)) {
    if (ref.kind === "scene" && ref.id === from) setAt(copy.data, ref.location.path, to);
  }
}


function setAt(root: unknown, path: DataPath, value: unknown) {
  let cur = root as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
  cur[path[path.length - 1]!] = value;
}

/** Deletes an entry. References to it are left dangling and show as problems (D86). */
export function deleteEntry(p: Project, section: Section, id: string): Project {
  if (isAssetKind(section)) {
    const doc = findDoc(p, section, id);
    return withDocs(p, section, docsOf(p, section).filter((d) => d !== doc));
  }
  if (section === "flag") return setFlags(p, (d) => ({ ...d, flags: d.flags.filter((f) => f.id !== id) }));
  const list = assetList(section);
  const pending = { ...p.pendingFiles };
  for (const a of p.assets?.data[list] ?? []) if (a.id === id) delete pending[a.path];
  return { ...setAssets(p, (d) => ({ ...d, [list]: d[list].filter((a) => a.id !== id) })), pendingFiles: pending };
}

// ── The delete warning (spec 08) ─────────────────────────────────────────────

const FILE_NOUN: Record<Reference["fileKind"], [string, string]> = {
  game: ["the game settings", "the game settings"],
  flags: ["the flags", "the flags"],
  assets: ["the assets list", "the assets list"],
  scene: ["scene", "scenes"],
  item: ["item", "items"],
  character: ["character", "characters"],
  dialogue: ["dialogue", "dialogues"],
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The rule (or dialogue node) a reference sits in, if any. */
function container(ref: Reference): string | null {
  const path = ref.location.path;
  const i = path.lastIndexOf("rules");
  if (i >= 0 && typeof path[i + 1] === "number") return `${ref.location.file}#${path.slice(0, i + 2).join("/")}`;
  if (path[0] === "nodes" && typeof path[1] === "number") return `${ref.location.file}#nodes/${path[1]}`;
  return null;
}

/** "Used by 3 rules in 2 scenes", or null when nothing uses it. */
export function summarizeReferences(refs: Reference[]): string | null {
  if (!refs.length) return null;
  const rules = new Set<string>();
  const nodes = new Set<string>();
  let other = 0;
  for (const r of refs) {
    const c = container(r);
    if (c?.includes("#nodes/")) nodes.add(c);
    else if (c) rules.add(c);
    else other++;
  }
  const what = [
    rules.size && plural(rules.size, "rule", "rules"),
    nodes.size && plural(nodes.size, "dialogue node", "dialogue nodes"),
    other && plural(other, "setting", "settings"),
  ].filter(Boolean) as string[];
  const files = new Map<Reference["fileKind"], Set<string>>();
  for (const r of refs) files.set(r.fileKind, (files.get(r.fileKind) ?? new Set()).add(r.location.file));
  const order: Reference["fileKind"][] = ["scene", "item", "character", "dialogue", "game", "flags", "assets"];
  const where = [...files].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([kind, set]) => {
    const [one, many] = FILE_NOUN[kind];
    return kind === "game" || kind === "flags" || kind === "assets" ? one : plural(set.size, one, many);
  });
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  return `Used by ${list(what)} in ${list(where)}`;
}

/** One line per reference: where it is, for the delete dialog. */
export const describeReferences = (p: Project, refs: Reference[]) => refs.map((r) => describeReference(p, r));

export interface ReferenceGroup {
  /** The file that holds the uses, e.g. `Scene "Garden"` or `Game settings`. */
  title: string;
  items: { text: string; location: Reference["location"] }[];
}

/** Uses grouped by the file they're in (scenes first, then items, characters, dialogues, the rest), for the Inspector. */
export function groupReferences(p: Project, refs: Reference[]): ReferenceGroup[] {
  const order: Reference["fileKind"][] = ["scene", "item", "character", "dialogue", "game", "flags", "assets"];
  const groups = new Map<string, { kind: Reference["fileKind"]; group: ReferenceGroup }>();
  for (const r of refs) {
    const [root = "", ...rest] = describeReference(p, r).split(" › ");
    const g = groups.get(r.location.file) ?? { kind: r.fileKind, group: { title: r.fileKind === "scene" ? `Scene "${root}"` : root, items: [] } };
    groups.set(r.location.file, g);
    g.group.items.push({ text: rest.join(" › ") || "Setting", location: r.location });
  }
  return [...groups.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((g) => g.group);
}

/** References to everything inside a folder (for deleting a folder). */
export function folderReferences(p: Project, section: Section, folder: string): Reference[] {
  const ids = new Set(entriesInFolder(p, section, folder).map((e) => e.id));
  const kinds = REF_KINDS[section];
  return collectReferences(p).filter((r) => kinds.includes(r.kind) && ids.has(r.id));
}

// ── Inside a scene (the M3 outline, D89) ─────────────────────────────────────

export type SceneList = "objects" | "characters" | "hotspots" | "regions";

/** Removes an object, placed character, hotspot or region, with its rules. */
export function deleteSceneThing(p: Project, sceneId: string, list: SceneList, index: number): Project {
  return updateDoc<SceneFile>(p, "scene", sceneId, (s) => {
    if (!s[list][index]) throw new CommandError("That's no longer in the scene.");
    return { ...s, [list]: s[list].filter((_, i) => i !== index) };
  });
}

/** Removes a spawn point. */
export function deleteSpawn(p: Project, sceneId: string, spawn: string): Project {
  return updateDoc<SceneFile>(p, "scene", sceneId, (s) => {
    const { [spawn]: _gone, ...spawns } = s.spawns;
    return { ...s, spawns };
  });
}

/** References to one of a scene's objects or spawns. */
export function sceneThingReferences(p: Project, sceneId: string, kind: "object" | "spawn", id: string): Reference[] {
  return collectReferences(p).filter((r) => r.kind === kind && r.scope === sceneId && r.id === id);
}
