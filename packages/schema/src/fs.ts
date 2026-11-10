/**
 * The only file access the project layer uses. Paths are project-relative
 * with `/` separators. The Node adapter lives in `@questforge/schema/node`; the
 * Tauri adapter and the dev-page HTTP adapter live in the editor.
 */
export interface ProjectFs {
  /** Every file in the project, recursively, skipping dot-files and dot-folders (e.g. `.editor/`, `.git/`). */
  list(): Promise<string[]>;
  /** Every folder in the project, recursively, skipping dot-folders. */
  listFolders(): Promise<string[]>;
  readText(path: string): Promise<string>;
  /** Writes the file, creating parent folders. */
  writeText(path: string, content: string): Promise<void>;
  /** Writes a binary file (an imported image or sound), creating parent folders. */
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Moves a file, creating the destination's parent folders and replacing any file there. */
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Creates a folder and its parents. */
  makeFolder(path: string): Promise<void>;
  /** Removes a folder only if nothing but a `.keep` file is left in it. */
  removeFolder(path: string): Promise<void>;
  /** Deletes a folder and everything in it. Only used for `.editor/trash`. */
  removeTree(path: string): Promise<void>;
}

/** Placeholder that keeps an empty folder in git. */
export const KEEP_FILE = ".keep";

export const isHidden = (path: string) => path.split("/").some((seg) => seg.startsWith("."));

const parents = (path: string) => {
  const segs = path.split("/");
  return segs.slice(1).map((_, i) => segs.slice(0, i + 1).join("/"));
};

/** In-memory filesystem for tests and previews. */
export class MemoryFs implements ProjectFs {
  readonly files: Map<string, string>;
  readonly bytes = new Map<string, Uint8Array>();
  /** Folders created explicitly; folders holding files exist implicitly. */
  readonly folders = new Set<string>();
  constructor(files: Record<string, string> = {}) {
    this.files = new Map(Object.entries(files));
  }
  private has(path: string) {
    return this.files.has(path) || this.bytes.has(path);
  }
  async list() {
    return [...this.files.keys(), ...this.bytes.keys()].filter((p) => !isHidden(p)).sort();
  }
  async listFolders() {
    const all = new Set(this.folders);
    for (const p of [...this.files.keys(), ...this.bytes.keys()]) for (const d of parents(p)) all.add(d);
    for (const d of [...all]) for (const parent of parents(`${d}/x`)) all.add(parent);
    return [...all].filter((d) => !isHidden(d)).sort();
  }
  async readText(path: string) {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`No such file: ${path}`);
    return text;
  }
  async writeText(path: string, content: string) {
    this.bytes.delete(path);
    this.files.set(path, content);
  }
  async writeBytes(path: string, bytes: Uint8Array) {
    this.files.delete(path);
    this.bytes.set(path, bytes);
  }
  async move(from: string, to: string) {
    if (!this.has(from)) throw new Error(`No such file: ${from}`);
    const text = this.files.get(from);
    const bin = this.bytes.get(from);
    this.files.delete(from);
    this.bytes.delete(from);
    this.files.delete(to);
    this.bytes.delete(to);
    if (text !== undefined) this.files.set(to, text);
    if (bin !== undefined) this.bytes.set(to, bin);
  }
  async remove(path: string) {
    this.files.delete(path);
    this.bytes.delete(path);
  }
  async makeFolder(path: string) {
    this.folders.add(path);
  }
  async removeFolder(path: string) {
    const inside = (p: string) => p.startsWith(`${path}/`);
    const contents = [...this.files.keys(), ...this.bytes.keys(), ...this.folders].filter(inside);
    if (contents.some((p) => p !== `${path}/${KEEP_FILE}`)) return;
    this.files.delete(`${path}/${KEEP_FILE}`);
    this.folders.delete(path);
  }
  async removeTree(path: string) {
    const inside = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const map of [this.files, this.bytes]) for (const k of [...map.keys()]) if (inside(k)) map.delete(k);
    for (const d of [...this.folders]) if (inside(d)) this.folders.delete(d);
  }
}
