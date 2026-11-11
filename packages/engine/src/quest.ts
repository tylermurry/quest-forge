// Plays a built game: a `.quest` file becomes a ProjectBundle whose assets
// are served from blob URLs, then goes through `createGame` like any project.
import { readQuest } from "@questforge/schema";
import type { ProjectBundle } from "./game.ts";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  woff2: "font/woff2",
  woff: "font/woff",
};

/** The MIME type for an asset path, by its extension. */
export const assetType = (path: string) => TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

export interface QuestBundle extends ProjectBundle {
  /** Frees the asset URLs. Call once the game is destroyed. */
  dispose(): void;
}

/**
 * Reads a `.quest` file for `createGame`. Throws the schema's QuestError (with a
 * plain-English message to put after the file name, e.g. "isn't a Questforge game.")
 * when it can't be played; validation errors are left to `createGame` (ProjectErrors).
 */
export async function loadQuest(bytes: Uint8Array): Promise<QuestBundle> {
  const { project, files } = await readQuest(bytes);
  const urls = new Map<string, string>();
  for (const [path, data] of files) urls.set(path, URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: assetType(path) })));
  return {
    project,
    assetUrl: (path) => urls.get(path) ?? path,
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
