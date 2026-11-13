import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQuest } from "@questforge/engine";
import { ICON_IDS, loadProject, planSave, resolveStyle, type GameStyle } from "@questforge/schema";
import { GameBuilder } from "../src/model/build.ts";
import { deleteEntry, describeReferences, entryReferences, summarizeReferences } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { importFiles } from "../src/model/importing.ts";
import { locate } from "../src/model/locate.ts";
import {
  setChoiceEffect,
  setChoiceSeparator,
  setFrameImage,
  setFrameInsets,
  setFrameScale,
  setIcon,
  setIconEffect,
  setNarrationTop,
  setNarrationWidth,
  setSpeechNameColor,
  setTypographyColor,
  setTypographyFont,
  setTypographySize,
} from "../src/model/style.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { m1Copy } from "./support/fixtures.ts";

// What a creator does, from the first imported picture to a built game, without a window: import a PNG, a WebP and a
// WOFF2 font, style everything, save, reopen, delete a picture the style uses, and build.

const bytes = (...b: number[]) => new Uint8Array(b);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 1);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 2);
const WOFF2 = bytes(0x77, 0x4f, 0x46, 0x32, 3);
const INSETS = { left: 5, right: 5, top: 5, bottom: 5 };

/** An editor on a copy of m1 with every picture and the font imported, but nothing styled yet. */
async function imported() {
  const { dir, fs } = await m1Copy();
  const editor = await Editor.open({ fs }, { autosave: false });
  const files = [
    { name: "Frame Art.png", bytes: PNG },
    { name: "Bar Art.webp", bytes: WEBP },
    ...ICON_IDS.map((icon) => ({ name: `btn ${icon}.png`, bytes: PNG })),
    { name: "Ye Olde.woff2", bytes: WOFF2 },
  ];
  editor.apply("Import", (p) => importFiles(p, files, "image", "").project);
  return { dir, fs, editor };
}

/** Every Styling setting, in the order the Styling pages offer them. */
function styleEverything(editor: Editor): GameStyle {
  editor.apply("Pick the frame", (p) => setFrameImage(p, "sharedFrame", "frame_art"));
  editor.apply("Set the borders", (p) => setFrameInsets(p, "sharedFrame", INSETS));
  editor.apply("Set the scale", (p) => setFrameScale(p, 20));
  editor.apply("Place narration", (p) => setNarrationWidth(setNarrationTop(p, 90), 70));
  editor.apply("Pick the font", (p) => setTypographyColor(setTypographySize(setTypographyFont(p, "ye_olde"), 16), "#ffe9a8"));
  editor.apply("Colour the names", (p) => setSpeechNameColor(p, "#aabbcc"));
  editor.apply("Choices", (p) => setChoiceSeparator(setChoiceEffect(p, "darken"), "#334455"));
  editor.apply("Bar frame", (p) => setFrameInsets(setFrameImage(p, "iconBar", "bar_art"), "iconBar", { left: 2, right: 2, top: 2, bottom: 2 }));
  editor.apply("Buttons", (p) => ICON_IDS.reduce((q, icon) => setIcon(q, icon, `btn_${icon}`), p));
  editor.apply("Bar effect", (p) => setIconEffect(p, "darken"));
  return editor.project.game!.data.style!;
}

describe("styling a game from import to Build Game", () => {
  it("imports a PNG, a WebP and a WOFF2 font into the library under their file names", async () => {
    const { editor } = await imported();
    const a = editor.project.assets!.data;
    expect(a.images.filter((i) => /frame_art|bar_art|btn_/.test(i.id)).map((i) => i.path.split(".").pop())).toEqual(["png", "webp", ...ICON_IDS.map(() => "png")]);
    expect(a.fonts).toEqual([{ id: "ye_olde", path: "assets/fonts/Ye Olde.woff2" }]);
    expect(editor.problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  it("saves one game-wide style and reopens it unchanged, with every file on disk and nothing left to save", async () => {
    const { dir, fs, editor } = await imported();
    const style = styleEverything(editor);
    expect(Object.keys(style).sort()).toEqual(["dialogueChoices", "iconBar", "narration", "sharedFrame", "speech", "typography"]);
    editor.validateNow();
    expect(editor.problems.filter((p) => p.severity === "error")).toEqual([]);
    await editor.flush();
    expect(editor.hasUnsavedChanges).toBe(false);
    for (const path of ["assets/images/Frame Art.png", "assets/images/Bar Art.webp", "assets/fonts/Ye Olde.woff2"]) {
      expect((await readFile(join(dir, path))).length, path).toBeGreaterThan(0);
    }

    const { project, problems } = await loadProject(fs);
    expect(problems).toEqual([]);
    expect(project.game!.data.style).toEqual(style);
    const plan = planSave(project);
    expect([plan.writes, plan.binaryWrites, plan.moves, plan.deletes]).toEqual([[], [], [], []]);
    // Undo walks back through each step the creator took, and the style is gone with the first.
    for (let i = 0; i < 11; i++) editor.undo();
    expect(editor.project.game!.data.style).toBeUndefined();
  });

  it("builds a .quest that plays with the same style the editor has, its pictures and its font", async () => {
    const { dir, editor } = await imported();
    const style = styleEverything(editor);
    const built: Uint8Array[] = [];
    const builder = new GameBuilder(editor, new WorkspaceState(), {
      readFile: (p) => readFile(join(dir, p)).then((b) => new Uint8Array(b)),
      saveBuild: async (_name, data) => (built.push(data), "/builds/game.quest"),
    });
    await expect(builder.build()).resolves.toEqual({ kind: "built", where: "/builds/game.quest" });

    const bundle = await loadQuest(built[0]!);
    expect(bundle.project.game!.data.style).toEqual(style);
    expect(resolveStyle(bundle.project.game!.data.style)).toEqual(resolveStyle(editor.project.game!.data.style));
    const served = async (path: string) => new Uint8Array(await (await fetch(bundle.assetUrl(path))).arrayBuffer());
    expect(await served("assets/images/Frame Art.png")).toEqual(PNG);
    expect(await served("assets/images/Bar Art.webp")).toEqual(WEBP);
    expect(await served("assets/fonts/Ye Olde.woff2")).toEqual(WOFF2);
    expect((await fetch(bundle.assetUrl("assets/fonts/Ye Olde.woff2"))).headers.get("content-type")).toBe("font/woff2");
    bundle.dispose();
    editor.dispose();
  });
});

describe("deleting a picture or font the style uses", () => {
  const SPOTS = [
    ["image", "frame_art", "sharedFrame"],
    ["image", "bar_art", "iconBar"],
    ["image", "btn_look", "iconBar"],
    ["font", "ye_olde", "typography"],
  ] as const;

  it.each(SPOTS)("warns that %s %s is in use, and after deleting it says so in Problems with a place to jump to", async (section, id, where) => {
    const { editor } = await imported();
    styleEverything(editor);
    const p = editor.project;
    const refs = entryReferences(p, section, id);
    expect(summarizeReferences(refs)).toBe("Used by 1 setting in the game settings");
    expect(describeReferences(p, refs)).toEqual([expect.stringMatching(/^Game settings › Styling/)]);

    editor.apply("Delete", (q) => deleteEntry(q, section, id));
    editor.validateNow();
    const mine = editor.problems.filter((x) => x.location.path[0] === "style");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.message).toContain(`uses ${section} ${id}, which doesn't exist.`);
    expect(mine[0]!.location.path[1]).toBe(where);
    expect(locate(editor.project, mine[0]!.location)).toMatchObject({ target: { kind: "game" } });
    // Undo brings the asset back and the problem goes.
    editor.undo();
    editor.validateNow();
    expect(editor.problems.filter((x) => x.severity === "error")).toEqual([]);
  });
});
