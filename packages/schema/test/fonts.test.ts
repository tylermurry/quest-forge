import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AssetsFile,
  TRASH_DIR,
  buildQuest,
  collectReferences,
  compileGame,
  loadProject,
  planSave,
  readQuest,
  renameId,
  saveProject,
  serialize,
  usedAssetIds,
  validateProject,
  type GameStyle,
  type Project,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE, fixtureCopy } from "./helpers.ts";

const load = async () => (await loadProject(new NodeFs(FIXTURE))).project;
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]);
const WOFF = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 1, 2, 3]);

/** The mini fixture with two imported fonts (a WOFF2 and a WOFF); the game's text uses `used` if given. */
function withFonts(p: Project, used?: string): Project {
  const style: GameStyle | undefined = used ? { typography: { font: used } } : undefined;
  return {
    ...p,
    game: { ...p.game!, data: { ...p.game!.data, ...(style ? { style } : {}) } },
    assets: { ...p.assets!, data: { ...p.assets!.data, fonts: [{ id: "ye_olde", path: "assets/fonts/ye-olde.woff2" }, { id: "plain", path: "assets/fonts/plain.woff" }] } },
    pendingFiles: { "assets/fonts/ye-olde.woff2": WOFF2, "assets/fonts/plain.woff": WOFF },
  };
}
const disk = (p: Project) => async (path: string) => p.pendingFiles[path] ?? new Uint8Array(await readFile(join(FIXTURE, path)));

describe("font assets", () => {
  it("are optional, so a project with none keeps assets.yaml as it was", async () => {
    const p = await load();
    expect(p.assets!.data.fonts).toBeUndefined();
    expect(p.saved["assets.yaml"]).toBe(serialize(AssetsFile.parse(p.assets!.data)));
    expect(serialize(AssetsFile.parse(p.assets!.data))).not.toContain("fonts");
  });

  it("need a stable id and a path inside assets/", () => {
    const ok = { schemaVersion: 3, images: [], audio: [], fonts: [{ id: "ye_olde", path: "assets/fonts/a.woff2" }] };
    expect(AssetsFile.safeParse(ok).success).toBe(true);
    expect(AssetsFile.safeParse({ ...ok, fonts: [{ id: "Bad Id", path: "assets/fonts/a.woff2" }] }).success).toBe(false);
    expect(AssetsFile.safeParse({ ...ok, fonts: [{ id: "a", path: "../a.woff2" }] }).success).toBe(false);
  });

  it("count as used by Typography, and a missing one is a problem", async () => {
    const p = withFonts(await load(), "ye_olde");
    expect(collectReferences(p).filter((r) => r.kind === "font")).toMatchObject([{ id: "ye_olde", fileKind: "game", location: { file: "game.yaml", path: ["style", "typography", "font"] } }]);
    expect(validateProject(p)).toEqual([]);

    const dangling = withFonts(await load(), "ye_oldee");
    const problems = validateProject(dangling).filter((x) => x.location.file === "game.yaml");
    expect(problems.map((x) => [x.code, x.breadcrumb, x.message])).toEqual([
      ["missing_reference", "Game settings › Styling › Typography", "uses font ye_oldee, which doesn't exist. Did you mean ye_olde?"],
    ]);
  });

  it("do not accept an image's ID", async () => {
    const p = withFonts(await load(), "palm_img");
    expect(validateProject(p).map((x) => x.message)).toEqual(["uses font palm_img, which doesn't exist."]);
  });

  it("reject a second font with the same ID", async () => {
    const p = withFonts(await load());
    const dup = { ...p, assets: { ...p.assets!, data: { ...p.assets!.data, fonts: [...p.assets!.data.fonts!, { id: "plain", path: "assets/fonts/other.woff" }] } } };
    expect(validateProject(dup).map((x) => x.code)).toEqual(["duplicate_id"]);
  });
});

describe("font assets in a .quest file", () => {
  it("bundles the font the game uses and leaves out the one it doesn't", async () => {
    const p = withFonts(await load(), "ye_olde");
    expect(usedAssetIds(p).fonts).toEqual(new Set(["ye_olde"]));
    const { game, files } = compileGame(p);
    expect((game.assets as AssetsFile).fonts).toEqual([{ id: "ye_olde", path: "assets/fonts/ye-olde.woff2" }]);
    expect(files).toContain("assets/fonts/ye-olde.woff2");
    expect(files).not.toContain("assets/fonts/plain.woff");

    const read = await readQuest(await buildQuest(p, disk(p)));
    expect(read.files.get("assets/fonts/ye-olde.woff2")).toEqual(WOFF2);
    expect(read.files.has("assets/fonts/plain.woff")).toBe(false);
    expect(read.project.assets!.data.fonts).toEqual([{ id: "ye_olde", path: "assets/fonts/ye-olde.woff2" }]);
    expect(validateProject(read.project).filter((x) => x.severity === "error")).toEqual([]);
  });

  it("bundles no font when the game uses none, and a project without fonts builds as before", async () => {
    const p = withFonts(await load());
    expect(compileGame(p).files.some((f) => f.startsWith("assets/fonts/"))).toBe(false);
    expect("fonts" in (compileGame(p).game.assets as object)).toBe(false);
    expect("fonts" in (compileGame(await load()).game.assets as object)).toBe(false);
  });
});

describe("font assets: rename, save, delete, undo", () => {
  it("renaming a font's ID updates the style that uses it", async () => {
    const p = renameId(withFonts(await load(), "ye_olde"), "font", "ye_olde", "gothic");
    expect(p.assets!.data.fonts!.map((f) => f.id)).toEqual(["gothic", "plain"]);
    expect(p.game!.data.style!.typography!.font).toBe("gothic");
    expect(validateProject(p)).toEqual([]);
    expect(() => renameId(p, "font", "gothic", "plain")).toThrow(/already exists/);
  });

  it("writes an imported font on save and moves it with its path", async () => {
    const { dir, fs } = await fixtureCopy();
    const { project: loaded } = await loadProject(fs);
    const imported = withFonts(loaded, "ye_olde");
    expect(planSave(imported).binaryWrites.map((w) => w.path).sort()).toEqual(["assets/fonts/plain.woff", "assets/fonts/ye-olde.woff2"]);
    let { project } = await saveProject(fs, imported);
    expect(new Uint8Array(await readFile(join(dir, "assets/fonts/ye-olde.woff2")))).toEqual(WOFF2);

    const moved: Project = { ...project, assets: { ...project.assets!, data: { ...project.assets!.data, fonts: project.assets!.data.fonts!.map((f) => (f.id === "plain" ? { ...f, path: "assets/fonts/old/plain.woff" } : f)) } } };
    expect(planSave(moved).moves).toEqual([{ from: "assets/fonts/plain.woff", to: "assets/fonts/old/plain.woff" }]);
    ({ project } = await saveProject(fs, moved));
    expect(project.files).toContain("assets/fonts/old/plain.woff");
  });

  it("sends a deleted font to the trash, and undo brings it back", async () => {
    const { dir, fs } = await fixtureCopy();
    const { project: base } = await loadProject(fs);
    const { project: loaded } = await saveProject(fs, withFonts(base));
    const deleted: Project = { ...loaded, assets: { ...loaded.assets!, data: { ...loaded.assets!.data, fonts: loaded.assets!.data.fonts!.filter((f) => f.id !== "plain") } } };
    let { project } = await saveProject(fs, deleted);
    expect(project.trash).toEqual(["assets/fonts/plain.woff"]);
    expect(new Uint8Array(await readFile(join(dir, TRASH_DIR, "assets/fonts/plain.woff")))).toEqual(WOFF);

    const undone = { ...project, assets: loaded.assets };
    expect(planSave(undone).moves).toEqual([{ from: `${TRASH_DIR}/assets/fonts/plain.woff`, to: "assets/fonts/plain.woff" }]);
    ({ project } = await saveProject(fs, undone));
    expect(project.files).toContain("assets/fonts/plain.woff");
    expect(project.trash).toEqual([]);
  });
});
