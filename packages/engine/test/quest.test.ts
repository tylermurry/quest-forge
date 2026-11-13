import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QuestError, buildQuest, compileGame, loadProject, validateProject } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { assetType, loadQuest } from "../src/quest.ts";

// A built game: the m1 fixture through Build Game, then played from the `.quest` bytes.

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

  it("serves a font the game uses as font/woff2 and frees its URL on dispose", async () => {
    const { project } = await built();
    const font = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]);
    const styled = {
      ...project,
      game: { ...project.game!, data: { ...project.game!.data, style: { typography: { font: "ye_olde" } } } },
      assets: { ...project.assets!, data: { ...project.assets!.data, fonts: [{ id: "ye_olde", path: "assets/fonts/ye-olde.woff2" }] } },
      pendingFiles: { "assets/fonts/ye-olde.woff2": font },
    };
    const bundle = await loadQuest(await buildQuest(styled, (p) => readFile(join(ROOT, p)).then((b) => new Uint8Array(b))));
    const url = bundle.assetUrl("assets/fonts/ye-olde.woff2");
    const res = await fetch(url);
    expect(res.headers.get("content-type")).toBe("font/woff2");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(font);
    bundle.dispose();
    await expect(fetch(url)).rejects.toThrow();
  });

  it("refuses a file that isn't a built game", async () => {
    await expect(loadQuest(new TextEncoder().encode("not a game"))).rejects.toThrow(QuestError);
  });

  it("knows asset types by extension", () => {
    expect(assetType("assets/images/a.PNG")).toBe("image/png");
    expect(assetType("assets/audio/x.mp3")).toBe("audio/mpeg");
    expect(assetType("assets/fonts/x.WOFF2")).toBe("font/woff2");
    expect(assetType("assets/fonts/x.woff")).toBe("font/woff");
    expect(assetType("assets/x")).toBe("application/octet-stream");
  });
});
