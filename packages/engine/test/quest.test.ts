import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QuestError, buildQuest, compileGame, loadProject, validateProject } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { assetType, loadQuest } from "../src/quest.ts";

// A built game (D153): the m1 fixture through Build Game, then played from the `.quest` bytes.

const ROOT = join(import.meta.dirname, "../fixtures/m1");

async function built() {
  const { project } = await loadProject(new NodeFs(ROOT));
  const bytes = await buildQuest(project, (p) => readFile(join(ROOT, p)).then((b) => new Uint8Array(b)));
  return { project, bytes };
}

describe("loadQuest", () => {
  it("serves every asset of the built game from its own URL", async () => {
    const { project, bytes } = await built();
    const bundle = await loadQuest(bytes);
    expect(validateProject(bundle.project).filter((p) => p.severity === "error")).toEqual([]);
    for (const path of compileGame(project).files) {
      const url = bundle.assetUrl(path);
      expect(url).toMatch(/^blob:/);
      const res = await fetch(url);
      expect(res.headers.get("content-type")).toBe(assetType(path));
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(await readFile(join(ROOT, path))));
    }
    bundle.dispose();
  });

  it("refuses a file that isn't a built game", async () => {
    await expect(loadQuest(new TextEncoder().encode("not a game"))).rejects.toThrow(QuestError);
  });

  it("knows asset types by extension", () => {
    expect(assetType("assets/images/a.PNG")).toBe("image/png");
    expect(assetType("assets/audio/x.mp3")).toBe("audio/mpeg");
    expect(assetType("assets/x")).toBe("application/octet-stream");
  });
});
