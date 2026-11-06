import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject, validateProject, type Project } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { afterEach } from "vitest";

/** The engine's M1/M2 fixture: the "open an existing project" case. Never write to it. */
export const M1 = join(import.meta.dirname, "../../../engine/fixtures/m1");

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A throwaway copy of the m1 fixture on disk. */
export async function m1Copy(): Promise<{ dir: string; fs: NodeFs }> {
  const dir = await mkdtemp(join(tmpdir(), "questforge-editor-"));
  temps.push(dir);
  await cp(M1, dir, { recursive: true });
  return { dir, fs: new NodeFs(dir) };
}

/** The m1 fixture, loaded read-only. */
export async function m1Project() {
  const { project, problems } = await loadProject(new NodeFs(M1));
  if (problems.length) throw new Error(`m1 fixture has problems: ${problems.map((p) => p.message).join("; ")}`);
  return project;
}

/** Blocking problems only: "valid" means nothing stops playtest or export (D38); warnings are checked on their own. */
export const errorsIn = (p: Project) => validateProject(p).filter((x) => x.severity === "error");
