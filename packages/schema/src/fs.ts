/**
 * The only file access the project layer uses (D56). Paths are project-relative
 * with `/` separators. The Node adapter lives in `@questforge/schema/node`; the
 * Tauri adapter arrives with the editor shell (M3).
 */
export interface ProjectFs {
  /** Every file in the project, recursively, skipping dot-files and dot-folders (e.g. `.editor/`, `.git/`). */
  list(): Promise<string[]>;
  readText(path: string): Promise<string>;
  /** Writes the file, creating parent folders. */
  writeText(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const isHidden = (path: string) => path.split("/").some((seg) => seg.startsWith("."));

/** In-memory filesystem for tests and previews. */
export class MemoryFs implements ProjectFs {
  readonly files: Map<string, string>;
  constructor(files: Record<string, string> = {}) {
    this.files = new Map(Object.entries(files));
  }
  async list() {
    return [...this.files.keys()].filter((p) => !isHidden(p)).sort();
  }
  async readText(path: string) {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`No such file: ${path}`);
    return text;
  }
  async writeText(path: string, content: string) {
    this.files.set(path, content);
  }
  async remove(path: string) {
    this.files.delete(path);
  }
}
