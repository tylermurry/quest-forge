import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { NodeFs } from "../src/node.ts";

export const FIXTURE = join(import.meta.dirname, "fixtures/mini");

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A throwaway copy of the fixture project (including dot-folders). */
export async function fixtureCopy(): Promise<{ dir: string; fs: NodeFs }> {
  const dir = await mkdtemp(join(tmpdir(), "questforge-"));
  temps.push(dir);
  await cp(FIXTURE, dir, { recursive: true });
  return { dir, fs: new NodeFs(dir) };
}

/** Every file under `dir` (dot-folders included) mapped to its bytes. */
export async function snapshot(dir: string): Promise<Record<string, string>> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const out: Record<string, string> = {};
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = join(e.parentPath, e.name);
    out[full.slice(dir.length + 1).split("\\").join("/")] = (await readFile(full)).toString("base64");
  }
  return out;
}
