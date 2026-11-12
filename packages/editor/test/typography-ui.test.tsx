// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// Styling > Typography through the real Workspace: the font picker, the size box and the colour.

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

async function openTypography() {
  const fs = new MemoryFs();
  const p = await m1Project();
  const project = { ...p, assets: { ...p.assets!, data: { ...p.assets!.data, fonts: [{ id: "title_font", path: "assets/fonts/title_font.woff2" }] } } };
  await saveProject(fs, { ...project, saved: {}, files: [], savedFolders: [] });
  for (const i of project.assets.data.images) await fs.writeBytes(i.path, new Uint8Array([0]));
  await fs.writeBytes("assets/fonts/title_font.woff2", new Uint8Array([0]));
  const editor = await Editor.open({ fs }, { autosave: false });
  const platform = { assetUrl: (_r: string, path: string) => path } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={new CommandRegistry()}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  fireEvent.doubleClick(screen.getByRole("treeitem", { name: "Game" }).firstElementChild!);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Styling" }));
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Typography" }));
  return editor;
}

const typo = (e: Editor) => e.project.game!.data.style?.typography;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe("Typography", () => {
  it("starts uncustomised, then the size box and colour make the section, each undoable", async () => {
    const editor = await openTypography();
    expect(screen.getByRole("heading", { name: "Typography" })).toBeTruthy();
    expect(screen.getByText(/Not customised yet/)).toBeTruthy();
    expect(field("Text size (pixels)").value).toBe("16");
    expect(typo(editor)).toBeUndefined();
    fireEvent.change(field("Text size (pixels)"), { target: { value: "24" } });
    expect(typo(editor)).toEqual({ size: 24 });
    expect(screen.queryByText(/Not customised yet/)).toBeNull();
    fireEvent.change(field("Text size (pixels)"), { target: { value: "3" } });
    expect(field("Text size (pixels)").getAttribute("aria-invalid")).toBe("true");
    expect(typo(editor)).toEqual({ size: 24 });
    fireEvent.change(field("Text colour"), { target: { value: "#ff8800" } });
    expect(typo(editor)).toEqual({ size: 24, color: "#ff8800" });
    editor.undo();
    expect(typo(editor)).toEqual({ size: 24 });
  });

  it("picks a built-in family or an imported font; a font that can't load says so and keeps text readable", async () => {
    const editor = await openTypography();
    fireEvent.click(screen.getByRole("combobox", { name: "Font" }));
    fireEvent.click(await screen.findByRole("option", { name: "Serif (built in)" }));
    expect(typo(editor)).toEqual({ family: "serif" });
    fireEvent.click(screen.getByRole("combobox", { name: "Font" }));
    fireEvent.click(await screen.findByRole("option", { name: "title_font (imported)" }));
    expect(typo(editor)).toEqual({ font: "title_font" });
    // jsdom has no FontFace, which is the same as a font file that can't be decoded.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/title_font couldn't be loaded/);
    expect(alert.textContent).toMatch(/built-in font is shown/);
  });
});
