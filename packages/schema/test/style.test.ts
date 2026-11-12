import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHOR_DEFAULTS,
  GameFile,
  GameStyle,
  LEGACY_STYLE,
  MemoryFs,
  buildQuest,
  collectReferences,
  compileGame,
  findReferences,
  frameInsetProblems,
  loadProject,
  planSave,
  readQuest,
  renameId,
  resolveStyle,
  saveProject,
  serialize,
  validateProject,
  type GameStyle as Style,
  type Project,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE } from "./helpers.ts";

const load = async () => (await loadProject(new NodeFs(FIXTURE))).project;
const disk = (path: string) => readFile(join(FIXTURE, path)).then((b) => new Uint8Array(b));

/** The mini fixture with a style set on its game, using images the fixture already has. */
async function styled(style: Style): Promise<Project> {
  const p = await load();
  return { ...p, game: { ...p.game!, data: { ...p.game!.data, style } } };
}

const FULL: Style = {
  sharedFrame: { image: "palm_img", insets: { left: 4, right: 4, top: 6, bottom: 6 }, scale: 24 },
  typography: { family: "serif", size: 14, color: "#ffeecc" },
  iconBar: {
    frame: { image: "boulder_img", insets: { left: 2, right: 2, top: 2, bottom: 2 } },
    icons: { walk: "coin_icon", settings: "lantern_icon" },
    effect: "darken",
  },
  dialogueChoices: { highlight: "#112233", separator: "#445566" },
  narration: { top: 120, center: true, width: 75 },
  speech: { name: "#aabbcc" },
};

describe("GameStyle schema", () => {
  it("accepts a full style, empty sections and an empty style", () => {
    expect(GameStyle.safeParse(FULL).success).toBe(true);
    expect(GameStyle.safeParse({ sharedFrame: {}, typography: {}, iconBar: {}, dialogueChoices: {} }).success).toBe(true);
    expect(GameStyle.safeParse({}).success).toBe(true);
  });

  it.each([
    ["a colour without the hash", { typography: { color: "ffffff" } }],
    ["a colour in short form", { dialogueChoices: { highlight: "#fff" } }],
    ["a negative inset", { sharedFrame: { insets: { left: -1, right: 0, top: 0, bottom: 0 } } }],
    ["a fractional inset", { sharedFrame: { insets: { left: 1.5, right: 0, top: 0, bottom: 0 } } }],
    ["a missing inset side", { sharedFrame: { insets: { left: 1, right: 0, top: 0 } } }],
    ["a size that is too small", { typography: { size: 2 } }],
    ["an unknown family", { typography: { family: "comic-sans" } }],
    ["a family and a font together", { typography: { family: "serif", font: "my_font" } }],
    ["an unknown effect", { iconBar: { effect: "glow" } }],
    ["an unknown icon", { iconBar: { icons: { run: "coin_icon" } } }],
    ["an image that is not an ID", { sharedFrame: { image: "assets/a.png" } }],
    ["an unknown key", { typography: { weight: "bold" } }],
  ])("rejects %s", (_name, style) => {
    expect(GameStyle.safeParse(style).success).toBe(false);
  });
});

describe("resolveStyle", () => {
  it("gives today's engine values for a legacy (absent) style", () => {
    const s = resolveStyle(undefined);
    expect(s).toEqual(LEGACY_STYLE);
    expect(s.typography).toMatchObject({ family: "monospace", size: 10, lineHeight: 12, color: "#ffffff" });
    expect(s.dialogueChoices).toEqual({ highlight: "#c89a3c", separator: "#e8d8a8" });
    expect(s.iconBar.effect).toBe("none");
    expect(s.sharedFrame.image).toBeUndefined();
  });

  it("treats a style with absent sections as legacy for those sections", () => {
    expect(resolveStyle({})).toEqual(LEGACY_STYLE);
  });

  it("fills a configured typography section with the author defaults", () => {
    const t = resolveStyle({ typography: {} }).typography;
    expect(t).toEqual({ family: "monospace", font: undefined, size: 16, lineHeight: 19, color: "#ffffff" });
    expect(t.size).toBe(AUTHOR_DEFAULTS.typography.size);
  });

  it("keeps explicit typography values and a custom font replaces the family", () => {
    expect(resolveStyle({ typography: { size: 20, color: "#123456", family: "serif" } }).typography).toMatchObject({ family: "serif", size: 20, lineHeight: 24, color: "#123456" });
    expect(resolveStyle({ typography: { font: "my_font" } }).typography).toMatchObject({ family: undefined, font: "my_font" });
  });

  it("resolves the frames, with zero insets when none are given", () => {
    expect(resolveStyle({ sharedFrame: { image: "a" } }).sharedFrame).toEqual({ image: "a", insets: { left: 0, right: 0, top: 0, bottom: 0 }, scale: 16 });
    expect(resolveStyle(FULL).sharedFrame).toEqual({ image: "palm_img", insets: { left: 4, right: 4, top: 6, bottom: 6 }, scale: 24 });
  });

  it("places narration 50 px from the top and 60% wide unless set; center wins over top", () => {
    expect(resolveStyle(undefined).narration).toEqual({ top: 50, width: 60 });
    expect(resolveStyle({ narration: { width: 80 } }).narration).toEqual({ top: 50, width: 80 });
    expect(resolveStyle(FULL).narration).toEqual({ top: "center", width: 75 });
    expect(GameStyle.safeParse({ narration: { width: 10 } }).success).toBe(false);
    expect(GameStyle.safeParse({ narration: { center: false } }).success).toBe(false);
    expect(GameStyle.safeParse({ sharedFrame: { scale: 65 } }).success).toBe(false);
  });

  it("draws every speaker's name in one colour: pale gold, or the one picked", () => {
    expect(resolveStyle(undefined).speech).toEqual({ name: "#e8d8a8" });
    expect(resolveStyle(FULL).speech).toEqual({ name: "#aabbcc" });
  });

  it("brightens by default once the icon bar is configured, and keeps the icons", () => {
    expect(resolveStyle({ iconBar: {} }).iconBar).toMatchObject({ effect: "brighten", icons: {} });
    const bar = resolveStyle(FULL).iconBar;
    expect(bar).toMatchObject({ effect: "darken", icons: { walk: "coin_icon", settings: "lantern_icon" } });
    expect(bar.frame.image).toBe("boulder_img");
  });

  it("resolves dialogue choice colours per field", () => {
    expect(resolveStyle({ dialogueChoices: { highlight: "#000000" } }).dialogueChoices).toEqual({ highlight: "#000000", separator: "#e8d8a8" });
    expect(resolveStyle(FULL).dialogueChoices).toEqual({ highlight: "#112233", separator: "#445566" });
  });
});

describe("frameInsetProblems", () => {
  it("accepts insets that leave a centre", () => {
    expect(frameInsetProblems({ left: 4, right: 4, top: 4, bottom: 4 }, 9, 9)).toEqual([]);
  });

  it("names the axis that has no centre left", () => {
    const h = frameInsetProblems({ left: 8, right: 8, top: 1, bottom: 1 }, 16, 32);
    expect(h).toEqual([{ axis: "horizontal", message: expect.stringContaining("16 px wide") }]);
    const both = frameInsetProblems({ left: 8, right: 8, top: 16, bottom: 16 }, 16, 32);
    expect(both.map((p) => p.axis)).toEqual(["horizontal", "vertical"]);
  });
});

describe("saving and loading a style", () => {
  it("leaves a project with no style byte-identical, with no style key written", async () => {
    const p = await load();
    expect(p.game!.data.style).toBeUndefined();
    const text = serialize(p.game!.data);
    expect(text).not.toContain("style");
    expect(text).toBe(await readFile(join(FIXTURE, "game.yaml"), "utf8"));
    expect(planSave(p).writes).toEqual([]);
  });

  it("round-trips a style through save and reopen, omitting absent keys", async () => {
    const fs = new MemoryFs();
    const base = await styled({ typography: { size: 12 }, sharedFrame: { image: "palm_img" } });
    await saveProject(fs, { ...base, saved: {} });
    const text = fs.files.get("game.yaml")!;
    expect(text).toMatch(/style:\n {2}sharedFrame:\n {4}image: palm_img\n {2}typography:\n {4}size: 12\n/);
    expect(text).not.toContain("iconBar");
    const reopened = (await loadProject(fs)).project;
    expect(reopened.game!.data.style).toEqual({ sharedFrame: { image: "palm_img" }, typography: { size: 12 } });
    expect(serialize(reopened.game!.data)).toBe(text);
  });

  it("builds and reads back one style unchanged", async () => {
    const p = await styled(FULL);
    const { project } = await readQuest(await buildQuest(p, disk));
    expect(project.game!.data.style).toEqual(FULL);
    expect(GameFile.safeParse(project.game!.data).success).toBe(true);
  });
});

describe("style references", () => {
  it("counts every image the style uses, with its exact spot", async () => {
    const refs = collectReferences(await styled(FULL)).filter((r) => r.location.path[0] === "style");
    expect(refs.map((r) => [r.kind, r.id, r.location.file, r.location.path.join(".")])).toEqual([
      ["image", "palm_img", "game.yaml", "style.sharedFrame.image"],
      ["image", "boulder_img", "game.yaml", "style.iconBar.frame.image"],
      ["image", "coin_icon", "game.yaml", "style.iconBar.icons.walk"],
      ["image", "lantern_icon", "game.yaml", "style.iconBar.icons.settings"],
    ]);
    // Deleting an image the style uses is flagged like any other usage.
    expect(findReferences(await styled(FULL), "image", "boulder_img").some((r) => r.fileKind === "game")).toBe(true);
  });

  it("renaming an image updates the style", async () => {
    const renamed = renameId(await styled(FULL), "image", "palm_img", "palm_frame");
    expect(renamed.game!.data.style?.sharedFrame?.image).toBe("palm_frame");
    expect(renamed.game!.data.style?.iconBar?.frame?.image).toBe("boulder_img");
    const bar = renameId(renamed, "image", "coin_icon", "walk_icon");
    expect(bar.game!.data.style?.iconBar?.icons?.walk).toBe("walk_icon");
    expect(planSave(bar).writes.some((w) => w.path === "game.yaml")).toBe(true);
  });

  it("includes style images in a build, and leaves unused ones out", async () => {
    const p = await styled({ sharedFrame: { image: "unused_frame" } });
    const withUnused = { ...p, assets: { ...p.assets!, data: { ...p.assets!.data, images: [...p.assets!.data.images, { id: "unused_frame", path: "assets/images/unused_frame.png" }, { id: "unused_other", path: "assets/images/unused_other.png" }] } }, pendingFiles: { "assets/images/unused_frame.png": new Uint8Array([1]), "assets/images/unused_other.png": new Uint8Array([2]) } };
    const { files } = compileGame(withUnused);
    expect(files).toContain("assets/images/unused_frame.png");
    expect(files).not.toContain("assets/images/unused_other.png");
  });
});

describe("style validation", () => {
  it("reports an image that doesn't exist, with the file and the spot", async () => {
    const problems = validateProject(await styled({ iconBar: { icons: { look: "no_such_image" } }, sharedFrame: { image: "palm_imgg" } }));
    const mine = problems.filter((p) => p.location.file === "game.yaml");
    expect(mine.map((p) => [p.severity, p.code, p.breadcrumb, p.location.path.join("."), p.message])).toEqual([
      ["error", "missing_reference", "Game settings › Styling › Shared frame", "style.sharedFrame.image", "uses image palm_imgg, which doesn't exist. Did you mean palm_img?"],
      ["error", "missing_reference", "Game settings › Styling › Icon bar", "style.iconBar.icons.look", "uses image no_such_image, which doesn't exist."],
    ]);
  });

  it("does not take a sound ID for an image", async () => {
    const p = await load();
    const sound = p.assets!.data.audio[0]!.id;
    const problems = validateProject(await styled({ sharedFrame: { image: sound } })).filter((x) => x.location.file === "game.yaml");
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toContain(`image ${sound}`);
  });

  it("reports a bad colour or inset when the file loads, naming game.yaml and the spot", async () => {
    const yaml = (await readFile(join(FIXTURE, "game.yaml"), "utf8")) + "style:\n  typography:\n    color: red\n  sharedFrame:\n    insets:\n      left: -2\n      right: 0\n      top: 0\n      bottom: 0\n";
    const files: Record<string, string> = {};
    const { readdir } = await import("node:fs/promises");
    for (const e of await readdir(FIXTURE, { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || e.name.endsWith(".png") || e.name.endsWith(".ogg")) continue;
      const full = join(e.parentPath, e.name);
      files[full.slice(FIXTURE.length + 1)] = await readFile(full, "utf8");
    }
    const { problems } = await loadProject(new MemoryFs({ ...files, "game.yaml": yaml }));
    const mine = problems.filter((p) => p.location.file === "game.yaml");
    expect(mine.map((p) => [p.code, p.breadcrumb, p.location.path.join(".")])).toEqual([
      ["invalid_data", "Game settings › Styling › Shared frame", "style.sharedFrame.insets.left"],
      ["invalid_data", "Game settings › Styling › Typography", "style.typography.color"],
    ]);
    expect(mine[1]!.message).toContain("must be a color like #ffcc00");
  });
});
