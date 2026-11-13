import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BuildError,
  ICON_IDS,
  buildQuest,
  collectReferences,
  compileGame,
  loadProject,
  planSave,
  readQuest,
  renameId,
  saveProject,
  serialize,
  validateProject,
  type GameStyle,
  type Project,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE, fixtureCopy } from "./helpers.ts";

// The creator's whole styling flow at the file level: a game with every style setting, a WebP frame and a WOFF2
// font, saved, reopened, renamed, built and read back. And a game with no style, which must stay as it was.

const load = async () => (await loadProject(new NodeFs(FIXTURE))).project;
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 5, 6, 7, 8]);
const WOFF = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 5, 6, 7, 8]);

/** One picture for each of the seven buttons, all already in the fixture's library. */
const ICONS = { walk: "coin_icon", look: "lantern_icon", hand: "matches_icon", talk: "lit_lantern_icon", item: "palm_img", inventory: "boulder_img", settings: "beach_bg" } as const;

const STYLE: GameStyle = {
  sharedFrame: { image: "frame_webp", insets: { left: 6, right: 6, top: 6, bottom: 6 }, scale: 20 },
  typography: { font: "title_font", size: 16, color: "#ffe9a8" },
  iconBar: { frame: { image: "bar_frame", insets: { left: 3, right: 3, top: 3, bottom: 3 } }, icons: { ...ICONS }, effect: "darken" },
  dialogueChoices: { effect: "brighten", separator: "#334455" },
  narration: { top: 90, width: 70 },
  speech: { name: "#aabbcc" },
};

/** The mini fixture plus a WebP frame, a PNG bar frame, a WOFF2 font, and one unused picture and font. */
async function styled(style: GameStyle = STYLE): Promise<Project> {
  const p = await load();
  return {
    ...p,
    game: { ...p.game!, data: { ...p.game!.data, style } },
    assets: {
      ...p.assets!,
      data: {
        ...p.assets!.data,
        images: [
          ...p.assets!.data.images,
          { id: "frame_webp", path: "assets/images/Styling/frame.webp" },
          { id: "bar_frame", path: "assets/images/Styling/bar.png" },
          { id: "unused_art", path: "assets/images/unused.png" },
        ],
        fonts: [
          { id: "title_font", path: "assets/fonts/title.woff2" },
          { id: "unused_font", path: "assets/fonts/unused.woff" },
        ],
      },
    },
    pendingFiles: {
      "assets/images/Styling/frame.webp": WEBP,
      "assets/images/Styling/bar.png": PNG,
      "assets/images/unused.png": PNG,
      "assets/fonts/title.woff2": WOFF2,
      "assets/fonts/unused.woff": WOFF,
    },
  };
}

const reader = (p: Project) => async (path: string) => p.pendingFiles[path] ?? new Uint8Array(await readFile(join(FIXTURE, path)));
const styleRefs = (p: Project) => collectReferences(p).filter((r) => r.location.path[0] === "style");
const STYLE_SPOTS: [string, string, string][] = [
  ["image", "frame_webp", "style.sharedFrame.image"],
  ["font", "title_font", "style.typography.font"],
  ["image", "bar_frame", "style.iconBar.frame.image"],
  ...ICON_IDS.map((icon): [string, string, string] => ["image", ICONS[icon], `style.iconBar.icons.${icon}`]),
];

describe("a fully styled game", () => {
  it("uses an image or font at each place the style names one, all seven icons included", async () => {
    const refs = styleRefs(await styled());
    expect(refs.map((r) => [r.kind, r.id, r.location.path.join(".")])).toEqual(expect.arrayContaining(STYLE_SPOTS));
    expect(refs).toHaveLength(STYLE_SPOTS.length);
    expect(new Set(refs.map((r) => r.location.file))).toEqual(new Set(["game.yaml"]));
  });

  it("is a problem-free project", async () => {
    expect(validateProject(await styled())).toEqual([]);
  });

  it("builds into a .quest holding the style unchanged, every picture and font it uses, and nothing it doesn't", async () => {
    const p = await styled();
    const { project, files } = await readQuest(await buildQuest(p, reader(p)));
    expect(project.game!.data.style).toEqual(STYLE);
    expect(serialize(project.game!.data)).toBe(serialize(p.game!.data));
    const have = new Set(files.keys());
    for (const path of ["assets/images/Styling/frame.webp", "assets/images/Styling/bar.png", "assets/fonts/title.woff2"]) expect(have.has(path), path).toBe(true);
    for (const id of Object.values(ICONS)) expect(have.has(p.assets!.data.images.find((i) => i.id === id)!.path), id).toBe(true);
    expect(have.has("assets/images/unused.png")).toBe(false);
    expect(have.has("assets/fonts/unused.woff")).toBe(false);
    expect(files.get("assets/images/Styling/frame.webp")).toEqual(WEBP);
    expect(files.get("assets/fonts/title.woff2")).toEqual(WOFF2);
    expect(project.assets!.data.fonts).toEqual([{ id: "title_font", path: "assets/fonts/title.woff2" }]);
    expect(project.assets!.data.images.map((i) => i.id)).not.toContain("unused_art");
    expect(validateProject(project).filter((x) => x.severity === "error")).toEqual([]);
  });

  it("builds the same bytes every time", async () => {
    const p = await styled();
    expect(await buildQuest(p, reader(p))).toEqual(await buildQuest(p, reader(p)));
  });

  it("is refused when the font's file can't be read, and says which one", async () => {
    // Saved earlier, so the font is not pending in memory; its file is gone from the folder.
    const { "assets/fonts/title.woff2": _gone, ...pendingFiles } = (await styled()).pendingFiles;
    const p = { ...(await styled()), pendingFiles };
    const missing = async (path: string) => (path.endsWith(".woff2") ? Promise.reject(new Error("gone")) : reader(p)(path));
    await expect(buildQuest(p, missing)).rejects.toThrow(BuildError);
    await expect(buildQuest(p, missing)).rejects.toThrow(/Couldn't read assets\/fonts\/title\.woff2: gone/);
  });

  it("saves, reopens and saves again with nothing changed: the style, the files and game.yaml are canonical", async () => {
    const { dir, fs } = await fixtureCopy();
    const { project: loaded } = await loadProject(fs);
    const base = await styled();
    const { project: saved } = await saveProject(fs, { ...loaded, game: base.game, assets: base.assets, pendingFiles: base.pendingFiles });
    const text = await readFile(join(dir, "game.yaml"), "utf8");

    const { project, problems } = await loadProject(fs);
    expect(problems).toEqual([]);
    expect(project.game!.data.style).toEqual(STYLE);
    expect(serialize(project.game!.data)).toBe(text);
    expect(project.files).toEqual(expect.arrayContaining(["assets/images/Styling/frame.webp", "assets/fonts/title.woff2", "assets/fonts/unused.woff"]));
    expect(new Uint8Array(await readFile(join(dir, "assets/images/Styling/frame.webp")))).toEqual(WEBP);
    expect(new Uint8Array(await readFile(join(dir, "assets/fonts/title.woff2")))).toEqual(WOFF2);
    // Nothing is left to write or move, whether the project is the one just saved or the one reopened.
    for (const p of [saved, project]) {
      const plan = planSave(p);
      expect([plan.writes, plan.binaryWrites, plan.moves, plan.deletes]).toEqual([[], [], [], []]);
    }
  });
});

describe("renaming what a style uses", () => {
  it("follows the frame, the bar's frame, each of the seven icons and the font, leaving the game problem-free", async () => {
    let p = await styled();
    p = renameId(p, "image", "frame_webp", "panel_frame");
    p = renameId(p, "image", "bar_frame", "bar_art");
    for (const icon of ICON_IDS) p = renameId(p, "image", ICONS[icon], `btn_${icon}`);
    p = renameId(p, "font", "title_font", "heading_font");
    const style = p.game!.data.style!;
    expect(style.sharedFrame!.image).toBe("panel_frame");
    expect(style.iconBar!.frame!.image).toBe("bar_art");
    expect(style.iconBar!.icons).toEqual(Object.fromEntries(ICON_IDS.map((icon) => [icon, `btn_${icon}`])));
    expect(style.typography!.font).toBe("heading_font");
    // Everything else in the style is as it was.
    expect(style.sharedFrame).toEqual({ ...STYLE.sharedFrame, image: "panel_frame" });
    expect(style.narration).toEqual(STYLE.narration);
    expect(style.dialogueChoices).toEqual(STYLE.dialogueChoices);
    expect(validateProject(p)).toEqual([]);
    expect(styleRefs(p)).toHaveLength(STYLE_SPOTS.length);
  });
});

describe("deleting what a style uses", () => {
  /** The project with one asset taken out of the library, as if the creator deleted it. */
  function without(p: Project, kind: "image" | "font", id: string): Project {
    const data = p.assets!.data;
    const assets = kind === "image" ? { ...data, images: data.images.filter((i) => i.id !== id) } : { ...data, fonts: data.fonts!.filter((f) => f.id !== id) };
    return { ...p, assets: { ...p.assets!, data: assets } };
  }

  it.each(STYLE_SPOTS)("tells the creator, in plain words and with a place to jump to, when %s %s is gone", async (kind, id, path) => {
    const problems = validateProject(without(await styled(), kind as "image" | "font", id)).filter((x) => x.location.path[0] === "style");
    expect(problems).toHaveLength(1);
    const [problem] = problems;
    expect(problem).toMatchObject({ severity: "error", code: "missing_reference", location: { file: "game.yaml" } });
    expect(problem!.location.path.join(".")).toBe(path);
    expect(problem!.message.startsWith(`uses ${kind} ${id}, which doesn't exist.`)).toBe(true);
    expect(problem!.breadcrumb).toMatch(/^Game settings › Styling › /);
  });

  it("stops a build until the style is fixed", async () => {
    const p = without(await styled(), "image", "frame_webp");
    await expect(buildQuest(p, reader(p))).rejects.toThrow(BuildError);
  });
});

describe("a game with no style", () => {
  it("builds with no style, no font and no style pictures, and reads back as it was", async () => {
    const p = await load();
    const { game, files } = compileGame(p);
    expect(JSON.stringify(game)).not.toContain('"style"');
    expect("fonts" in (game.assets as object)).toBe(false);
    expect(files.some((f) => f.startsWith("assets/fonts/"))).toBe(false);
    const { project } = await readQuest(await buildQuest(p, reader(p)));
    expect(project.game!.data).toEqual(p.game!.data);
    expect(project.game!.data.style).toBeUndefined();
    expect(serialize(project.game!.data)).toBe(await readFile(join(FIXTURE, "game.yaml"), "utf8"));
  });

  it("leaves an unused picture and font in the library out of the build", async () => {
    const p = await styled({});
    const { files } = compileGame(p);
    expect(files).not.toContain("assets/images/Styling/frame.webp");
    expect(files).not.toContain("assets/fonts/title.woff2");
  });
});
