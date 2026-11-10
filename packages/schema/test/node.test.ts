import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeFs } from "../src/node.ts";

let dir: string;
let fs: NodeFs;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "questforge-node-fs-"));
  fs = new NodeFs(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("NodeFs.removeFolder", () => {
  it("does nothing when the folder is already gone", async () => {
    await expect(fs.removeFolder("scenes/missing")).resolves.toBeUndefined();
  });

  it("removes an empty folder", async () => {
    await mkdir(join(dir, "scenes", "empty"), { recursive: true });
    await fs.removeFolder("scenes/empty");
    expect(await fs.listFolders()).not.toContain("scenes/empty");
  });

  it("leaves a folder that still has files", async () => {
    await mkdir(join(dir, "scenes", "full"), { recursive: true });
    await writeFile(join(dir, "scenes", "full", "a.scene.yaml"), "x");
    await fs.removeFolder("scenes/full");
    expect(await fs.listFolders()).toContain("scenes/full");
  });

  it("surfaces an unexpected error instead of ignoring it (here: the path is a file, not a folder)", async () => {
    await writeFile(join(dir, "game.yaml"), "x");
    await expect(fs.removeFolder("game.yaml")).rejects.toMatchObject({ code: "ENOTDIR" });
  });
});
