// Importing files from the OS into assets/ (spec 08, D88). The bytes wait in
// pendingFiles until the next save, so an import is one undoable step.
import { SECTION_ROOTS, definedIds, type Project } from "@questforge/schema";
import { slugify, uniqueId } from "./commands.ts";
import type { Section } from "./browser.ts";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
export const AUDIO_EXTENSIONS = ["mp3", "ogg", "wav"];

export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}

export interface ImportResult {
  project: Project;
  imported: { section: "image" | "audio"; id: string; path: string }[];
  /** File names that weren't images or sounds. */
  refused: string[];
}

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** A file name safe to put in a project folder: no separators or leading dots, lowercase extension. */
function safeFileName(name: string): string {
  const ext = extOf(name);
  const stem = name.slice(0, name.length - ext.length - 1).replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "").trim() || "file";
  return `${stem}.${ext}`;
}

/**
 * Adds files to assets.yaml (and pendingFiles). A drop on an Images or Audio folder
 * goes into that folder; anywhere else goes to the section root of the file's type.
 */
export function importFiles(p: Project, files: ImportFile[], section: Section, folder: string): ImportResult {
  const imported: ImportResult["imported"] = [];
  const refused: string[] = [];
  const assets = p.assets ?? { path: "assets.yaml", data: { schemaVersion: 1 as const, images: [], audio: [] } };
  const data = { ...assets.data, images: [...assets.data.images], audio: [...assets.data.audio] };
  const pending = { ...p.pendingFiles };
  const takenPaths = new Set([...p.files, ...data.images.map((i) => i.path), ...data.audio.map((a) => a.path), ...Object.keys(pending)]);
  const ids = { image: new Set(definedIds(p, "image")), audio: new Set(definedIds(p, "audio")) };

  for (const file of files) {
    const ext = extOf(file.name);
    const kind = IMAGE_EXTENSIONS.includes(ext) ? "image" : AUDIO_EXTENSIONS.includes(ext) ? "audio" : null;
    if (!kind) {
      refused.push(file.name);
      continue;
    }
    const dir = [SECTION_ROOTS[kind], section === kind ? folder : ""].filter(Boolean).join("/");
    const name = safeFileName(file.name);
    const stem = name.slice(0, -(ext.length + 1));
    let path = `${dir}/${name}`;
    for (let n = 2; takenPaths.has(path); n++) path = `${dir}/${stem}_${n}.${ext}`;
    takenPaths.add(path);
    const id = uniqueId(slugify(stem, kind === "image" ? "img" : "snd"), ids[kind]);
    ids[kind].add(id);
    if (kind === "image") data.images.push({ id, path });
    else data.audio.push({ id, path });
    pending[path] = file.bytes;
    imported.push({ section: kind, id, path });
  }
  if (!imported.length) return { project: p, imported, refused };
  return { project: { ...p, assets: { ...assets, data }, pendingFiles: pending }, imported, refused };
}
