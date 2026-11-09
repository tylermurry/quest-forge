import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFs } from "../src/node.ts";
import { loadProject, type Project } from "../src/project.ts";
import { BuildError, QuestError, QUEST_GAME_ENTRY, buildQuest, compileGame, questFileName, readQuest, usedAssetIds } from "../src/quest.ts";
import { validateProject } from "../src/validate.ts";
import { crc32, readZip, writeZip } from "../src/zip.ts";
import { FIXTURE } from "./helpers.ts";

const load = async () => (await loadProject(new NodeFs(FIXTURE))).project;
const disk = (path: string) => readFile(join(FIXTURE, path)).then((b) => new Uint8Array(b));

/** The mini fixture plus an image nothing uses and a flag in a browser folder. */
function withExtras(p: Project): Project {
  return {
    ...p,
    assets: { ...p.assets!, data: { ...p.assets!.data, images: [...p.assets!.data.images, { id: "unused_img", path: "assets/images/unused.png" }] } },
    flags: { ...p.flags!, data: { ...p.flags!.data, folders: ["misc"], flags: p.flags!.data.flags.map((f) => ({ ...f, folder: "misc" })) } },
    pendingFiles: { "assets/images/unused.png": new Uint8Array([1, 2, 3]) },
  };
}

describe("zip", () => {
  it("round-trips stored and deflated entries", async () => {
    const text = new TextEncoder().encode("hello ".repeat(500));
    const bin = new Uint8Array([0, 255, 7, 8, 9]);
    const zip = await writeZip([
      { name: "a.txt", data: text, compress: true },
      { name: "dir/b.bin", data: bin },
    ]);
    expect(zip.length).toBeLessThan(text.length);
    const back = await readZip(zip);
    expect([...back.keys()]).toEqual(["a.txt", "dir/b.bin"]);
    expect(back.get("a.txt")).toEqual(text);
    expect(back.get("dir/b.bin")).toEqual(bin);
  });

  it("knows the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("rejects bytes that aren't a zip, or a damaged one", async () => {
    await expect(readZip(new Uint8Array(40))).rejects.toThrow("isn't a zip archive");
    const zip = await writeZip([{ name: "x", data: new Uint8Array([1, 2, 3, 4]) }]);
    zip[31 + 1]! ^= 0xff; // the stored body, just after the 30-byte header and 1-byte name
    await expect(readZip(zip)).rejects.toThrow("checksum");
  });
});

describe("compileGame", () => {
  it("drops unused assets and editor-only folders", async () => {
    const { game, files } = compileGame(withExtras(await load()));
    const assets = game.assets as { images: { id: string }[] };
    expect(assets.images.map((a) => a.id)).not.toContain("unused_img");
    expect(files).not.toContain("assets/images/unused.png");
    const flags = game.flags as { folders?: unknown; flags: { folder?: unknown }[] };
    expect(flags.folders).toBeUndefined();
    expect(flags.flags.every((f) => f.folder === undefined)).toBe(true);
  });

  it("keeps every asset the game uses", async () => {
    const p = await load();
    const used = usedAssetIds(p);
    const { files } = compileGame(p);
    const paths = new Map(p.assets!.data.images.concat(p.assets!.data.audio).map((a) => [a.id, a.path]));
    for (const id of [...used.images, ...used.audio]) expect(files).toContain(paths.get(id));
  });
});

describe("buildQuest / readQuest", () => {
  it("builds a game the engine side reads back the same", async () => {
    const p = withExtras(await load());
    const bytes = await buildQuest(p, disk);
    const { project, files } = await readQuest(bytes);
    expect(validateProject(project).filter((x) => x.severity === "error")).toEqual([]);
    expect(project.game!.data).toEqual(p.game!.data);
    expect(project.scenes.map((s) => s.data)).toEqual(p.scenes.map((s) => s.data));
    expect(project.dialogues.map((s) => s.path)).toEqual(p.dialogues.map((d) => `dialogues/${d.data.id}.dialogue.yaml`));
    expect([...files.keys()].sort()).toEqual(compileGame(p).files.sort());
    for (const [path, data] of files) expect(data).toEqual(await disk(path));
    expect(files.has(QUEST_GAME_ENTRY)).toBe(false);
  });

  it("builds the same bytes every time", async () => {
    const p = await load();
    expect(await buildQuest(p, disk)).toEqual(await buildQuest(p, disk));
  });

  it("refuses a project with errors", async () => {
    const p = await load();
    const broken = { ...p, game: { ...p.game!, data: { ...p.game!.data, startScene: "nowhere" } } };
    await expect(buildQuest(broken, disk)).rejects.toThrow(BuildError);
  });

  it("says which asset file it couldn't read", async () => {
    const p = await load();
    await expect(buildQuest(p, async (path) => (path.endsWith(".png") ? Promise.reject(new Error("gone")) : disk(path)))).rejects.toThrow(/Couldn't read assets\/images\/.*\.png: gone/);
  });

  it("rejects files that aren't games", async () => {
    await expect(readQuest(new Uint8Array([1, 2, 3]))).rejects.toThrow(QuestError);
    const noGame = await writeZip([{ name: "x.txt", data: new Uint8Array([1]) }]);
    await expect(readQuest(noGame)).rejects.toThrow("no game.json");
    const newer = await writeZip([{ name: QUEST_GAME_ENTRY, data: new TextEncoder().encode(JSON.stringify({ format: "questforge-game", formatVersion: 99, game: {}, flags: {}, assets: {}, scenes: [], items: [], characters: [], dialogues: [] })) }]);
    await expect(readQuest(newer)).rejects.toThrow("newer version");
  });

  it("names the file after the game title", async () => {
    const p = await load();
    expect(questFileName({ ...p, game: { ...p.game!, data: { ...p.game!.data, title: "The Lantern: Part 1!" } } })).toBe("the-lantern-part-1.quest");
  });
});
