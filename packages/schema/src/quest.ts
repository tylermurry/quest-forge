// The built game: a `.quest` file. It is a zip holding `game.json` (every
// project file merged into one, editor-only data left out) and the image and audio
// files the game uses, at their project paths. Build Game writes one; the engine
// plays one. Both sides read it through here, so they can't disagree.
import { z } from "zod";
import { AssetsFile } from "./assets.ts";
import { CharacterFile } from "./character.ts";
import { DialogueFile } from "./dialogue.ts";
import { FlagsFile } from "./flags.ts";
import { GameFile } from "./game.ts";
import { ItemFile } from "./item.ts";
import { migrate } from "./migrate.ts";
import { ROOT_FILES, assetPath, emptyProject, type AssetKind, type Project } from "./project.ts";
import { collectReferences } from "./references.ts";
import { SceneFile } from "./scene.ts";
import { validateProject } from "./validate.ts";
import { ZipError, readZip, writeZip, type ZipEntry } from "./zip.ts";

export const QUEST_EXTENSION = "quest";
/** The one JSON entry in a `.quest` archive. */
export const QUEST_GAME_ENTRY = "game.json";
export const QUEST_FORMAT = "questforge-game";
/** Bumped when the layout of `game.json` itself changes; the file schemas carry their own `schemaVersion`. */
export const QUEST_FORMAT_VERSION = 1;

/** `game.json`: the whole game in one document. */
export const QuestGame = z.strictObject({
  format: z.literal(QUEST_FORMAT),
  formatVersion: z.int().positive(),
  game: z.unknown(),
  flags: z.unknown(),
  assets: z.unknown(),
  scenes: z.array(z.unknown()),
  items: z.array(z.unknown()),
  characters: z.array(z.unknown()),
  dialogues: z.array(z.unknown()),
});
export type QuestGame = z.infer<typeof QuestGame>;

/** Build Game can't go ahead (validation errors, or an asset file that can't be read). */
export class BuildError extends Error {}

/** A `.quest` file that can't be played: not one, damaged, or made by a newer Questforge. */
export class QuestError extends Error {}

/** IDs of the images and audio the game uses. Anything else in `assets.yaml` is left out of a build. */
export function usedAssetIds(project: Project): { images: Set<string>; audio: Set<string> } {
  const images = new Set<string>();
  const audio = new Set<string>();
  for (const r of collectReferences(project)) {
    if (r.kind === "image") images.add(r.id);
    else if (r.kind === "audio") audio.add(r.id);
  }
  return { images, audio };
}

/**
 * The project as one `game.json`, plus the asset paths it needs. Browser folders
 * (flag folders included) are editor-only and dropped, and so are unused assets.
 * The project must be loaded (game, flags and assets files present).
 */
export function compileGame(project: Project): { game: QuestGame; files: string[] } {
  if (!project.game || !project.flags || !project.assets) throw new BuildError("The project is missing game.yaml, flags.yaml or assets.yaml.");
  const used = usedAssetIds(project);
  const assets: AssetsFile = {
    ...project.assets.data,
    images: project.assets.data.images.filter((a) => used.images.has(a.id)),
    audio: project.assets.data.audio.filter((a) => used.audio.has(a.id)),
  };
  const { folders: _folders, ...flags } = project.flags.data;
  const game: QuestGame = {
    format: QUEST_FORMAT,
    formatVersion: QUEST_FORMAT_VERSION,
    game: project.game.data,
    flags: { ...flags, flags: flags.flags.map(({ folder: _folder, ...f }) => f) },
    assets,
    scenes: project.scenes.map((d) => d.data),
    items: project.items.map((d) => d.data),
    characters: project.characters.map((d) => d.data),
    dialogues: project.dialogues.map((d) => d.data),
  };
  return { game, files: [...new Set([...assets.images, ...assets.audio].map((a) => a.path))] };
}

/** A friendly file name for the built game, e.g. `the-lantern.quest`. */
export function questFileName(project: Project): string {
  const base = (project.game?.data.title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || project.game?.data.id || "game"}.${QUEST_EXTENSION}`;
}

/**
 * Builds the `.quest` bytes. Refuses a project with validation errors.
 * `readFile` returns an asset file's bytes (a pending import or the file on disk).
 */
export async function buildQuest(project: Project, readFile: (path: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const errors = validateProject(project).filter((p) => p.severity === "error");
  if (errors.length) throw new BuildError(`Fix ${errors.length === 1 ? "the error" : `the ${errors.length} errors`} in Problems before building the game.`);
  const { game, files } = compileGame(project);
  const entries: ZipEntry[] = [{ name: QUEST_GAME_ENTRY, data: new TextEncoder().encode(JSON.stringify(game)), compress: true }];
  for (const path of files) {
    let data: Uint8Array;
    try {
      data = project.pendingFiles[path] ?? (await readFile(path));
    } catch (e) {
      throw new BuildError(`Couldn't read ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
    entries.push({ name: path, data });
  }
  return writeZip(entries);
}

const DOCS = { scene: SceneFile, item: ItemFile, character: CharacterFile, dialogue: DialogueFile } as const;
const LISTS = { scene: "scenes", item: "items", character: "characters", dialogue: "dialogues" } as const;

function parsePart<T>(schema: z.ZodType<T>, raw: unknown, where: string): T {
  const migrated = migrate(raw);
  if (!migrated.ok) throw new QuestError("was built with a newer version of Questforge.");
  const r = schema.safeParse(migrated.value);
  if (!r.success) throw new QuestError(`is damaged (${where}: ${r.error.issues[0]?.message ?? "invalid"}).`);
  return r.data;
}

/**
 * Reads a `.quest` file into a Project the engine can play, and its files
 * (asset path → bytes). Docs get the paths they'd have in a project folder, so
 * problems read as usual. Throws QuestError if the file can't be played.
 */
export async function readQuest(bytes: Uint8Array): Promise<{ project: Project; files: Map<string, Uint8Array> }> {
  let files: Map<string, Uint8Array>;
  try {
    files = await readZip(bytes);
  } catch (e) {
    throw new QuestError(e instanceof ZipError ? `${e.message}.` : "isn't a Questforge game.");
  }
  const json = files.get(QUEST_GAME_ENTRY);
  if (!json) throw new QuestError("isn't a Questforge game (it has no game.json).");
  files.delete(QUEST_GAME_ENTRY);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new QuestError("is damaged (game.json can't be read).");
  }
  const head = QuestGame.safeParse(raw);
  if (!head.success) throw new QuestError("isn't a Questforge game.");
  if (head.data.formatVersion > QUEST_FORMAT_VERSION) throw new QuestError("was built with a newer version of Questforge.");
  const q = head.data;
  const project = emptyProject();
  project.game = { path: ROOT_FILES.game, data: parsePart(GameFile, q.game, "game") };
  project.flags = { path: ROOT_FILES.flags, data: parsePart(FlagsFile, q.flags, "flags") };
  project.assets = { path: ROOT_FILES.assets, data: parsePart(AssetsFile, q.assets, "assets") };
  for (const kind of Object.keys(DOCS) as AssetKind[]) {
    const list = q[LISTS[kind]];
    list.forEach((item, i) => {
      const data = parsePart(DOCS[kind] as z.ZodType<{ id: string }>, item, `${LISTS[kind]} ${i + 1}`);
      (project[LISTS[kind]] as { path: string; data: unknown }[]).push({ path: assetPath(kind, data.id, ""), data });
    });
  }
  project.files = [...files.keys()].sort();
  return { project, files };
}
