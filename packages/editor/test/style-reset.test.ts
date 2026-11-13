import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, saveProject, type GameStyle, type Project } from "@questforge/schema";
import { builtInFrameBytes } from "../src/model/builtInFrame.ts";
import { Editor } from "../src/model/editor.ts";
import { blankProject } from "../src/model/template.ts";
import {
  BUILT_IN_FRAME,
  RESETTABLE_SECTIONS,
  applyBuiltInFrame,
  isStylingSectionDefault,
  resetStylingSection,
  setChoiceEffect,
  setChoiceSeparator,
  setFrameImage,
  setFrameScale,
  setIcon,
  setIconEffect,
  setNarrationCenter,
  setNarrationTop,
  setSpeechNameColor,
  setTypographyColor,
  setTypographyFont,
  type ResettableSection,
} from "../src/model/style.ts";
import { m1Project } from "./support/fixtures.ts";

const bytes = builtInFrameBytes();
const reset = (p: Project, s: ResettableSection) => resetStylingSection(p, s, bytes);
const styleOf = (p: Project): GameStyle | undefined => p.game!.data.style;

/** m1 (garden_bg, palm_img, plus a font) with every Styling section customised. */
async function customised(): Promise<Project> {
  const p = await m1Project();
  const withFont = { ...p, assets: { ...p.assets!, data: { ...p.assets!.data, fonts: [{ id: "title_font", path: "assets/fonts/title_font.woff2" }] } } };
  let q = applyBuiltInFrame(withFont, bytes);
  q = setFrameImage(q, "sharedFrame", "garden_bg");
  q = setFrameScale(q, 24);
  q = setNarrationCenter(setNarrationTop(q, 80), true);
  q = setTypographyColor(setTypographyFont(q, "title_font"), "#ffcc00");
  q = setSpeechNameColor(q, "#00ff00");
  q = setChoiceSeparator(setChoiceEffect(q, "darken"), "#112233");
  q = setIconEffect(setIcon(q, "walk", "palm_img"), "darken");
  return q;
}

/** The style sections each Styling section owns. */
const OWNS: Record<ResettableSection, (keyof GameStyle)[]> = {
  frames: ["sharedFrame", "narration"],
  typography: ["typography"],
  characterDialogue: ["speech", "dialogueChoices"],
  iconBar: ["iconBar"],
};

describe("Reset to Default: what each section goes back to", () => {
  for (const section of RESETTABLE_SECTIONS) {
    it(`${section} gets what a new project has and leaves every other section, image and font alone`, async () => {
      const before = await customised();
      const after = reset(before, section);
      const fresh = styleOf(blankProject("Fresh"))!;
      const style = styleOf(after) ?? {};
      for (const key of OWNS[section]) expect(style[key], key).toEqual(fresh[key]);
      const others = (Object.keys(styleOf(before)!) as (keyof GameStyle)[]).filter((k) => !OWNS[section].includes(k));
      for (const key of others) expect(style[key], key).toEqual(styleOf(before)![key]);
      expect(after.assets!.data.fonts).toEqual(before.assets!.data.fonts);
      expect(after.assets!.data.images).toEqual(expect.arrayContaining(before.assets!.data.images));
      expect(after.pendingFiles).toMatchObject(before.pendingFiles);
      // Nothing outside the style changes: no game mechanics, no other file.
      expect({ ...after.game!.data, style: undefined }).toEqual({ ...before.game!.data, style: undefined });
      expect(after.scenes).toEqual(before.scenes);
      expect(after.characters).toEqual(before.characters);
    });
  }

  it("frames: the built-in picture with its borders and no scale, no narration placement", async () => {
    const after = reset(await customised(), "frames");
    const style = styleOf(after)!;
    const image = after.assets!.data.images.find((i) => i.path === BUILT_IN_FRAME.path)!;
    expect(style.sharedFrame).toEqual({ image: image.id, insets: BUILT_IN_FRAME.insets });
    expect(style.narration).toBeUndefined();
  });

  it("typography, character dialogue and icon bar match the new-project values", async () => {
    const before = await customised();
    expect(styleOf(reset(before, "typography"))!.typography).toEqual({ size: 14 });
    const dialogue = styleOf(reset(before, "characterDialogue"))!;
    expect(dialogue.dialogueChoices).toEqual({ effect: "brighten" });
    expect(dialogue.speech).toBeUndefined();
    expect(styleOf(reset(before, "iconBar"))!.iconBar).toBeUndefined();
  });

  it("all four resets on a customised project give exactly the style of a new project", async () => {
    const after = RESETTABLE_SECTIONS.reduce(reset, await customised());
    expect(styleOf(after)).toEqual(styleOf(blankProject("Fresh")));
  });

  it("drops the style key when a reset leaves nothing to say", async () => {
    const onlyBar = setIconEffect(await m1Project(), "darken");
    expect(styleOf(onlyBar)).toEqual({ iconBar: { effect: "darken" } });
    expect("style" in reset(onlyBar, "iconBar").game!.data).toBe(false);
  });

  it("a project saved before styling existed gets the new-project look for the section, and nothing else", async () => {
    const legacy = await m1Project();
    expect(styleOf(legacy)).toBeUndefined();
    expect(styleOf(reset(legacy, "typography"))).toEqual({ typography: { size: 14 } });
    expect(styleOf(reset(legacy, "characterDialogue"))).toEqual({ dialogueChoices: { effect: "brighten" } });
    const framed = reset(legacy, "frames");
    expect(Object.keys(styleOf(framed)!)).toEqual(["sharedFrame"]);
    expect(framed.assets!.data.images.map((i) => i.id)).toEqual([...legacy.assets!.data.images.map((i) => i.id), "frame"]);
    expect(framed.pendingFiles[BUILT_IN_FRAME.path]).toBe(bytes);
    expect(reset(legacy, "iconBar")).toEqual(legacy);
  });

  it("frames: reuses the built-in picture when it is in the library, and never removes an image", async () => {
    const before = await customised();
    const count = before.assets!.data.images.length;
    const once = reset(before, "frames");
    expect(once.assets!.data.images).toHaveLength(count);
    expect(reset(once, "frames")).toEqual(once);
  });
});

describe("Reset to Default: nothing to reset", () => {
  it("every section of a new project is at its defaults", () => {
    const fresh = blankProject("Fresh");
    for (const section of RESETTABLE_SECTIONS) expect(isStylingSectionDefault(fresh, section), section).toBe(true);
  });

  it("a project with no style is at default only for the icon bar", async () => {
    const legacy = await m1Project();
    expect(RESETTABLE_SECTIONS.filter((s) => isStylingSectionDefault(legacy, s))).toEqual(["iconBar"]);
  });

  it("any change to a section makes that section, and only that one, customised", () => {
    const fresh = blankProject("Fresh");
    const edits: [ResettableSection, Project][] = [
      ["frames", setFrameScale(fresh, 24)],
      ["frames", setNarrationTop(fresh, 80)],
      ["typography", setTypographyColor(fresh, "#ffcc00")],
      ["characterDialogue", setSpeechNameColor(fresh, "#00ff00")],
      ["characterDialogue", setChoiceEffect(fresh, "darken")],
      ["iconBar", setIconEffect(fresh, "darken")],
    ];
    for (const [section, edited] of edits) {
      for (const s of RESETTABLE_SECTIONS) expect(isStylingSectionDefault(edited, s), `${section} edit, ${s}`).toBe(s !== section);
    }
  });

  it("is at default again right after its reset, and resetting twice changes nothing more", async () => {
    for (const section of RESETTABLE_SECTIONS) {
      const once = reset(await customised(), section);
      expect(isStylingSectionDefault(once, section), section).toBe(true);
      expect(reset(once, section)).toEqual(once);
    }
  });
});

describe("Reset to Default in the editor", () => {
  async function open() {
    const fs = new MemoryFs();
    const p = await customised();
    await saveProject(fs, { ...p, saved: {}, files: [], savedFolders: [] });
    await fs.writeBytes("assets/fonts/title_font.woff2", new Uint8Array([0]));
    return { fs, editor: await Editor.open({ fs }, { autosave: false }) };
  }

  it("is one labelled undo step; undo restores the section and redo applies the reset again", async () => {
    const { editor } = await open();
    const before = styleOf(editor.project);
    editor.apply("Reset Typography to default", (q) => reset(q, "typography"));
    expect(editor.history.undoLabel).toBe("Reset Typography to default");
    expect(styleOf(editor.project)!.typography).toEqual({ size: 14 });
    expect(editor.hasUnsavedChanges).toBe(true);
    editor.undo();
    expect(styleOf(editor.project)).toEqual(before);
    editor.redo();
    expect(styleOf(editor.project)!.typography).toEqual({ size: 14 });
    editor.undo();
    expect(editor.history.canUndo).toBe(false);
  });

  it("saves and reopens with the reset kept and every image and font file still on disk", async () => {
    const { fs, editor } = await open();
    const filesBefore = (await fs.list()).sort();
    for (const section of RESETTABLE_SECTIONS) editor.apply(`Reset ${section} to default`, (q) => reset(q, section));
    await editor.flush();
    expect(editor.hasUnsavedChanges).toBe(false);
    const { project, problems } = await loadProject(fs);
    expect(problems).toEqual([]);
    expect(styleOf(project)).toEqual(styleOf(blankProject("Fresh")));
    // Nothing is deleted; the built-in picture may be added.
    expect((await fs.list()).sort()).toEqual(expect.arrayContaining(filesBefore));
    expect(project.assets!.data.fonts).toEqual([{ id: "title_font", path: "assets/fonts/title_font.woff2" }]);
    for (const section of RESETTABLE_SECTIONS) expect(isStylingSectionDefault(project, section), section).toBe(true);
  });
});
