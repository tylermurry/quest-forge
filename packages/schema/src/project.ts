import { LineCounter, parseDocument } from "yaml";
import type { z } from "zod";
import { AssetsFile } from "./assets.ts";
import { CharacterFile } from "./character.ts";
import { Id } from "./common.ts";
import { DialogueFile } from "./dialogue.ts";
import { FlagsFile } from "./flags.ts";
import type { ProjectFs } from "./fs.ts";
import { GameFile } from "./game.ts";
import { ItemFile } from "./item.ts";
import { migrate } from "./migrate.ts";
import { describePath, type DataPath, type FileKind, type Problem } from "./problems.ts";
import { SceneFile } from "./scene.ts";
import { serialize } from "./serialize.ts";

/** A parsed project file and where it lives. */
export interface Doc<T> {
  path: string;
  data: T;
}

export type AssetKind = "scene" | "item" | "character" | "dialogue";

/** The in-memory project. Treat as immutable: operations return a new Project. */
export interface Project {
  game: Doc<GameFile> | null;
  flags: Doc<FlagsFile> | null;
  assets: Doc<AssetsFile> | null;
  scenes: Doc<SceneFile>[];
  items: Doc<ItemFile>[];
  characters: Doc<CharacterFile>[];
  dialogues: Doc<DialogueFile>[];
  /** Every file on disk at load time (used to check that asset files exist). */
  files: string[];
  /** Text of each file as last loaded or saved; `planSave` diffs against it. */
  saved: Record<string, string>;
}

export const SCHEMAS = {
  game: GameFile,
  flags: FlagsFile,
  assets: AssetsFile,
  scene: SceneFile,
  item: ItemFile,
  character: CharacterFile,
  dialogue: DialogueFile,
} satisfies Record<FileKind, z.ZodType>;

export const ROOT_FILES = { game: "game.yaml", flags: "flags.yaml", assets: "assets.yaml" } as const;

/** Section folder and file suffix per asset kind (spec 01). */
export const ASSET_LAYOUT = {
  scene: { dir: "scenes", suffix: ".scene.yaml", list: "scenes" },
  item: { dir: "items", suffix: ".item.yaml", list: "items" },
  character: { dir: "characters", suffix: ".character.yaml", list: "characters" },
  dialogue: { dir: "dialogues", suffix: ".dialogue.yaml", list: "dialogues" },
} as const satisfies Record<AssetKind, { dir: string; suffix: string; list: keyof Project }>;

type ListKey = (typeof ASSET_LAYOUT)[AssetKind]["list"];

/** Which kind of project file a path is, or null if it isn't one. */
export function classify(path: string): FileKind | null {
  for (const [kind, file] of Object.entries(ROOT_FILES)) if (path === file) return kind as FileKind;
  for (const [kind, { dir, suffix }] of Object.entries(ASSET_LAYOUT)) {
    if (path.startsWith(`${dir}/`) && path.endsWith(suffix)) return kind as AssetKind;
  }
  return null;
}

export function emptyProject(): Project {
  return { game: null, flags: null, assets: null, scenes: [], items: [], characters: [], dialogues: [], files: [], saved: {} };
}

const lastKey = (path: DataPath) => {
  const k = path.findLast((s) => typeof s === "string");
  return k === undefined ? "this" : `"${k}"`;
};
const getAt = (v: unknown, path: DataPath) =>
  path.reduce<unknown>((cur, k) => (typeof cur === "object" && cur !== null ? (cur as Record<string | number, unknown>)[k] : undefined), v);

function zodProblems(kind: FileKind, file: string, raw: unknown, error: z.ZodError): Problem[] {
  return error.issues.map((issue) => {
    const path = issue.path.filter((s): s is string | number => typeof s !== "symbol");
    let message: string;
    if (issue.code === "unrecognized_keys") {
      message = `has unknown setting${issue.keys.length > 1 ? "s" : ""} ${issue.keys.map((k) => `"${k}"`).join(", ")}.`;
    } else if (getAt(raw, path) === undefined && path.length > 0) {
      message = `is missing ${lastKey(path)}.`;
    } else if (issue.code === "invalid_union") {
      message = `${lastKey(path)} has an unknown type.`;
    } else {
      message = `${lastKey(path)} is invalid: ${issue.message}.`;
    }
    return { severity: "error", code: "invalid_data", breadcrumb: describePath(kind, file, raw, path), message, location: { file, path } };
  });
}

/** Parses one file's text. Returns the data, or the problems that stopped it loading. */
export function parseFile<K extends FileKind>(
  kind: K,
  file: string,
  text: string,
): { ok: true; data: z.infer<(typeof SCHEMAS)[K]> } | { ok: false; problems: Problem[] } {
  const fail = (code: Problem["code"], message: string, path: DataPath = []): { ok: false; problems: Problem[] } => ({
    ok: false,
    problems: [{ severity: "error", code, breadcrumb: file, message, location: { file, path } }],
  });
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { version: "1.2", uniqueKeys: true, prettyErrors: false, lineCounter });
  const yamlError = doc.errors[0];
  if (yamlError) {
    const line = lineCounter.linePos(yamlError.pos[0]).line;
    return fail("yaml_syntax", `can't be read${line ? ` (line ${line})` : ""}: ${yamlError.message.split("\n")[0]}`);
  }
  const migrated = migrate(doc.toJS());
  if (!migrated.ok) return fail("unsupported_version", "was made with a newer version of Questforge. Update the editor to open it.", ["schemaVersion"]);
  const result = SCHEMAS[kind].safeParse(migrated.value);
  if (!result.success) return { ok: false, problems: zodProblems(kind, file, migrated.value, result.error) };
  return { ok: true, data: result.data as z.infer<(typeof SCHEMAS)[K]> };
}

/**
 * Loads a project folder. Files that fail to parse are left out of the project
 * (and never overwritten by a save); their problems are returned.
 */
export async function loadProject(fs: ProjectFs): Promise<{ project: Project; problems: Problem[] }> {
  const project = emptyProject();
  const problems: Problem[] = [];
  project.files = await fs.list();
  for (const file of Object.values(ROOT_FILES)) {
    if (!project.files.includes(file)) {
      problems.push({ severity: "error", code: "missing_file", breadcrumb: file, message: "is missing from the project folder.", location: { file, path: [] } });
    }
  }
  for (const path of project.files) {
    const kind = classify(path);
    if (!kind) continue;
    const text = await fs.readText(path);
    const parsed = parseFile(kind, path, text);
    if (!parsed.ok) {
      problems.push(...parsed.problems);
      continue;
    }
    project.saved[path] = text;
    const doc = { path, data: parsed.data };
    if (kind === "game" || kind === "flags" || kind === "assets") (project as unknown as Record<string, unknown>)[kind] = doc;
    else (project[ASSET_LAYOUT[kind].list] as Doc<unknown>[]).push(doc);
  }
  return { project, problems };
}

/** Every file the project currently consists of, with its kind. */
export function* allDocs(project: Project): Generator<{ kind: FileKind; doc: Doc<unknown> }> {
  for (const kind of ["game", "flags", "assets"] as const) {
    const doc = project[kind];
    if (doc) yield { kind, doc };
  }
  for (const kind of Object.keys(ASSET_LAYOUT) as AssetKind[]) {
    for (const doc of project[ASSET_LAYOUT[kind].list]) yield { kind, doc };
  }
}

export interface SavePlan {
  writes: { path: string; content: string }[];
  deletes: string[];
}

export class SaveError extends Error {
  constructor(readonly problems: Problem[]) {
    super(`Refusing to save invalid data:\n${problems.map((p) => `${p.location.file}: ${p.breadcrumb}: ${p.message}`).join("\n")}`);
  }
}

/**
 * Works out exactly which files a save would touch: files whose canonical text
 * changed, and files that were loaded/saved but no longer belong to any doc
 * (moved, renamed or deleted). Unchanged files are never rewritten.
 */
export function planSave(project: Project): SavePlan {
  const writes: SavePlan["writes"] = [];
  const problems: Problem[] = [];
  const current = new Set<string>();
  for (const { kind, doc } of allDocs(project)) {
    if (current.has(doc.path)) throw new Error(`Two project files share the path ${doc.path}`);
    current.add(doc.path);
    // Re-parse so keys come out in schema order and nothing invalid reaches disk.
    const parsed = SCHEMAS[kind].safeParse(doc.data);
    if (!parsed.success) {
      problems.push(...zodProblems(kind, doc.path, doc.data, parsed.error));
      continue;
    }
    const content = serialize(parsed.data);
    if (project.saved[doc.path] !== content) writes.push({ path: doc.path, content });
  }
  if (problems.length) throw new SaveError(problems);
  const deletes = Object.keys(project.saved).filter((p) => !current.has(p)).sort();
  return { writes, deletes };
}

/** Saves changed files and returns the project with its saved snapshot updated. */
export async function saveProject(fs: ProjectFs, project: Project): Promise<{ project: Project; plan: SavePlan }> {
  const plan = planSave(project);
  // Write before deleting, so a failed write never loses the old copy of a moved file.
  for (const { path, content } of plan.writes) await fs.writeText(path, content);
  for (const path of plan.deletes) await fs.remove(path);
  const saved = { ...project.saved };
  for (const { path, content } of plan.writes) saved[path] = content;
  for (const path of plan.deletes) delete saved[path];
  const files = [...new Set([...project.files.filter((f) => !plan.deletes.includes(f)), ...plan.writes.map((w) => w.path)])].sort();
  return { project: { ...project, saved, files }, plan };
}

const FOLDER_SEGMENT = /^[^/\\.][^/\\]*$/;

/** The path an asset gets in a folder (`""` = section root). */
export function assetPath(kind: AssetKind, id: string, folder: string): string {
  const segs = folder === "" ? [] : folder.split("/");
  if (!segs.every((s) => FOLDER_SEGMENT.test(s))) throw new Error(`Invalid folder name: ${folder}`);
  Id.parse(id);
  const { dir, suffix } = ASSET_LAYOUT[kind];
  return [dir, ...segs, `${id}${suffix}`].join("/");
}

/** The folder (within its section) that an asset path sits in. */
export function folderOf(path: string): string {
  return path.split("/").slice(1, -1).join("/");
}

/** Moves an asset to another folder. Only its file path changes (D22). */
export function moveAsset(project: Project, kind: AssetKind, id: string, folder: string): Project {
  const list = ASSET_LAYOUT[kind].list as ListKey;
  const docs = project[list] as Doc<{ id: string }>[];
  const doc = docs.find((d) => d.data.id === id);
  if (!doc) throw new Error(`No ${kind} with ID ${id}`);
  const path = assetPath(kind, id, folder);
  if (path !== doc.path && [...allDocs(project)].some(({ doc: d }) => d.path === path)) {
    throw new Error(`A file already exists at ${path}`);
  }
  return { ...project, [list]: docs.map((d) => (d === doc ? { ...d, path } : d)) };
}
