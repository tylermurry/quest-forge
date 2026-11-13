// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject, type Project } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { builtInFrameBytes } from "../src/model/builtInFrame.ts";
import { Editor } from "../src/model/editor.ts";
import { RESETTABLE_SECTIONS, resetStylingSection, setChoiceEffect, setFrameScale, setIconEffect, setNarrationTop, setSpeechNameColor, setTypographyColor } from "../src/model/style.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// Reset to Default on every Styling section with settings, through the real Workspace.

/** jsdom doesn't decode images: every image "loads" as 96×64. */
class FakeImage {
  naturalWidth = 96;
  naturalHeight = 64;
  onload: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every section changed from what a new project starts with. */
const customise = (p: Project) => setIconEffect(setSpeechNameColor(setChoiceEffect(setTypographyColor(setNarrationTop(setFrameScale(p, 24), 80), "#ffcc00"), "darken"), "#00ff00"), "darken");

async function openSection(section: string, prepare: (p: Project) => Project = customise) {
  const fs = new MemoryFs();
  const project = prepare(await m1Project());
  await saveProject(fs, { ...project, saved: {}, files: [], savedFolders: [] });
  for (const i of project.assets!.data.images) await fs.writeBytes(i.path, new Uint8Array([0]));
  const editor = await Editor.open({ fs }, { autosave: false });
  const platform = { assetUrl: (_r: string, path: string) => path } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={new CommandRegistry()}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  fireEvent.click(screen.getByRole("treeitem", { name: "Game" }).firstElementChild!);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: section }));
  return editor;
}

const style = (e: Editor) => e.project.game!.data.style;
const resetButton = (section: string) => screen.getByRole("button", { name: `Reset to Default (${section})` }) as HTMLButtonElement;

/** What a section holds once reset: the new-project value for each of the style sections it owns. */
const AFTER = {
  Frames: { sharedFrame: { image: "frame", insets: { left: 12, right: 12, top: 12, bottom: 12 } }, narration: undefined },
  Typography: { typography: { size: 14 } },
  "Character Dialogue": { speech: undefined, dialogueChoices: undefined },
  "Icon Bar": { iconBar: undefined },
} as const;

describe.each(Object.keys(AFTER) as (keyof typeof AFTER)[])("Reset to Default in %s", (section) => {
  it("asks first, naming the section; Cancel changes nothing", async () => {
    const editor = await openSection(section);
    const before = editor.project;
    expect(resetButton(section).disabled).toBe(false);
    fireEvent.click(resetButton(section));
    const dialog = await screen.findByRole("alertdialog", { name: `Reset ${section} to default?` });
    expect(dialog.textContent).toMatch(/images and fonts stay in their libraries/);
    expect(dialog.textContent).toMatch(/You can undo this/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(editor.project).toBe(before);
    expect(editor.history.canUndo).toBe(false);
  });

  it("Reset changes only this section as one undo step; Undo restores it and Redo applies it again", async () => {
    const editor = await openSection(section);
    const before = style(editor)!;
    fireEvent.click(resetButton(section));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    const after = style(editor) ?? {};
    for (const [key, value] of Object.entries(AFTER[section])) expect(after[key as keyof typeof after], key).toEqual(value);
    for (const [key, value] of Object.entries(before)) if (!(key in AFTER[section])) expect(after[key as keyof typeof after], key).toEqual(value);
    expect(editor.history.undoLabel).toBe(`Reset ${section} to default`);
    expect(editor.hasUnsavedChanges).toBe(true);
    // Nothing is left to reset, so the button is off.
    expect(resetButton(section).disabled).toBe(true);
    editor.undo();
    expect(style(editor)).toEqual(before);
    expect(editor.history.canUndo).toBe(false);
    editor.redo();
    expect(style(editor)).toEqual(after);
  });
});

describe("Reset to Default when there is nothing to reset", () => {
  it("is disabled in every section while all of them have the new-project look, and a click does nothing", async () => {
    const editor = await openSection("Frames", (p) => RESETTABLE_SECTIONS.reduce((q, section) => resetStylingSection(q, section, builtInFrameBytes()), p));
    for (const [section, title] of [["frames", "Frames"], ["typography", "Typography"], ["characterDialogue", "Character Dialogue"], ["iconBar", "Icon Bar"]] as const) {
      fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: title }));
      expect(resetButton(title).disabled, section).toBe(true);
      fireEvent.click(resetButton(title));
      expect(screen.queryByRole("alertdialog")).toBeNull();
    }
    expect(editor.history.canUndo).toBe(false);
  });

  it("Inventory has no settings, so no Reset", async () => {
    await openSection("Inventory");
    expect(screen.queryByRole("button", { name: /Reset to Default/ })).toBeNull();
  });
});
