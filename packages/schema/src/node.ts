// Node-only helpers. Kept out of the main entry so the editor UI and engine
// bundles never import node:fs.
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { ProjectFs } from "./fs.ts";

/** A project folder on local disk (D12). */
export class NodeFs implements ProjectFs {
  constructor(readonly root: string) {}

  private abs(path: string) {
    if (path.split("/").includes("..")) throw new Error(`Path escapes the project: ${path}`);
    return join(this.root, ...path.split("/"));
  }

  async list() {
    const out: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) out.push(relative(this.root, full).split(sep).join("/"));
      }
    };
    await walk(this.root);
    return out.sort();
  }

  readText(path: string) {
    return readFile(this.abs(path), "utf8");
  }

  /** Write to a temp file then rename, so a crash mid-autosave never leaves a half-written file. */
  async writeText(path: string, content: string) {
    const target = this.abs(path);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, target);
  }

  async remove(path: string) {
    await rm(this.abs(path), { force: true });
  }
}
