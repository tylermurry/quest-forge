// Importing files from the OS into assets/. The bytes wait in
// pendingFiles until the next save, so an import is one undoable step.
import { FONT_EXTENSIONS, SCHEMA_VERSION, SECTION_ROOTS, definedIds, type Project } from "@questforge/schema";
import { slugify, uniqueId } from "./commands.ts";
import type { Section } from "./browser.ts";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
const AUDIO_EXTENSIONS = ["mp3", "ogg", "wav"];
const isFontExtension = (ext: string) => (FONT_EXTENSIONS as readonly string[]).includes(ext);
const FALLBACK_ID = { image: "img", audio: "snd", font: "font" } as const;

export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}

export interface ImportResult {
  project: Project;
  imported: { section: "image" | "audio" | "font"; id: string; path: string }[];
  /** File names that weren't images, sounds or fonts, or whose bytes aren't the font format their extension claims. */
  refused: string[];
}

/** The first four bytes of a font file: `wOF2` for WOFF2, `wOFF` for WOFF. */
const FONT_MAGIC: Record<(typeof FONT_EXTENSIONS)[number], string> = { woff2: "wOF2", woff: "wOFF" };

/** True when `bytes` start with the signature of the font format that `ext` names. */
export function isFontFile(ext: string, bytes: Uint8Array): boolean {
  const magic = FONT_MAGIC[ext as keyof typeof FONT_MAGIC];
  return magic !== undefined && bytes.length >= 4 && magic.split("").every((c, i) => bytes[i] === c.charCodeAt(0));
}

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** A file name safe to put in a project folder: no separators or leading dots, lowercase extension. */
function safeFileName(name: string): string {
  const ext = extOf(name);
  const stem = name.slice(0, name.length - ext.length - 1).replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "").trim() || "file";
  return `${stem}.${ext}`;
}

/**
 * Adds files to assets.yaml (and pendingFiles). A drop on an Images, Audio or Fonts folder
 * goes into that folder; anywhere else goes to the section root of the file's type.
 */
export function importFiles(p: Project, files: ImportFile[], section: Section, folder: string): ImportResult {
  const imported: ImportResult["imported"] = [];
  const refused: string[] = [];
  const assets = p.assets ?? { path: "assets.yaml", data: { schemaVersion: SCHEMA_VERSION, images: [], audio: [] } };
  const fonts = [...(assets.data.fonts ?? [])];
  const data = { ...assets.data, images: [...assets.data.images], audio: [...assets.data.audio] };
  const pending = { ...p.pendingFiles };
  const takenPaths = new Set([...p.files, ...data.images.map((i) => i.path), ...data.audio.map((a) => a.path), ...fonts.map((a) => a.path), ...Object.keys(pending)]);
  const ids = { image: new Set(definedIds(p, "image")), audio: new Set(definedIds(p, "audio")), font: new Set(definedIds(p, "font")) };

  for (const file of files) {
    const ext = extOf(file.name);
    const kind = IMAGE_EXTENSIONS.includes(ext) ? "image" : AUDIO_EXTENSIONS.includes(ext) ? "audio" : isFontExtension(ext) ? "font" : null;
    if (!kind || (kind === "font" && !isFontFile(ext, file.bytes))) {
      refused.push(file.name);
      continue;
    }
    const dir = [SECTION_ROOTS[kind], section === kind ? folder : ""].filter(Boolean).join("/");
    const name = safeFileName(file.name);
    const stem = name.slice(0, -(ext.length + 1));
    let path = `${dir}/${name}`;
    for (let n = 2; takenPaths.has(path); n++) path = `${dir}/${stem}_${n}.${ext}`;
    takenPaths.add(path);
    const id = uniqueId(slugify(stem, FALLBACK_ID[kind]), ids[kind]);
    ids[kind].add(id);
    if (kind === "image") data.images.push({ id, path });
    else if (kind === "audio") data.audio.push({ id, path });
    else fonts.push({ id, path });
    pending[path] = file.bytes;
    imported.push({ section: kind, id, path });
  }
  if (!imported.length) return { project: p, imported, refused };
  // `fonts` is only written once a font exists, so other imports leave assets.yaml's shape alone.
  if (fonts.length) data.fonts = fonts;
  return { project: { ...p, assets: { ...assets, data }, pendingFiles: pending }, imported, refused };
}
