// Node-only helpers. Kept out of the main entry so the editor UI and engine
// bundles never import node:fs.
import { mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { KEEP_FILE, type ProjectFs } from "./fs.ts";

/** A project folder on local disk. */
export class NodeFs implements ProjectFs {
  constructor(readonly root: string) {}

  private abs(path: string) {
    if (path.split("/").includes("..")) throw new Error(`Path escapes the project: ${path}`);
    return join(this.root, ...path.split("/"));
  }

  private async walk(onFile: (rel: string) => void, onDir: (rel: string) => void) {
    const go = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        const rel = relative(this.root, full).split(sep).join("/");
        if (entry.isDirectory()) {
          onDir(rel);
          await go(full);
        } else if (entry.isFile()) onFile(rel);
      }
    };
    await go(this.root);
  }

  async list() {
    const out: string[] = [];
    await this.walk(
      (f) => out.push(f),
      () => {},
    );
    return out.sort();
  }

  async listFolders() {
    const out: string[] = [];
    await this.walk(
      () => {},
      (d) => out.push(d),
    );
    return out.sort();
  }

  readText(path: string) {
    return readFile(this.abs(path), "utf8");
  }

  /** Write to a temp file then rename, so a crash mid-autosave never leaves a half-written file. */
  private async atomicWrite(path: string, content: string | Uint8Array) {
    const target = this.abs(path);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, content, typeof content === "string" ? "utf8" : undefined);
    await rename(tmp, target);
  }

  writeText(path: string, content: string) {
    return this.atomicWrite(path, content);
  }

  writeBytes(path: string, bytes: Uint8Array) {
    return this.atomicWrite(path, bytes);
  }

  async move(from: string, to: string) {
    const target = this.abs(to);
    await mkdir(dirname(target), { recursive: true });
    await rename(this.abs(from), target);
  }

  async remove(path: string) {
    await rm(this.abs(path), { force: true });
  }

  async makeFolder(path: string) {
    await mkdir(this.abs(path), { recursive: true });
  }

  async removeFolder(path: string) {
    const dir = this.abs(path);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // The folder is already gone (or not a folder), so there is nothing to remove.
      return;
    }
    if (entries.some((e) => e !== KEEP_FILE)) return;
    await rm(join(dir, KEEP_FILE), { force: true });
    await rmdir(dir);
  }

  async removeTree(path: string) {
    await rm(this.abs(path), { recursive: true, force: true });
  }
}
