// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { Editor } from "../src/model/editor.ts";
import { CommandRegistry } from "../src/model/appCommands.ts";
import type { Platform } from "../src/platform/platform.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { m1Project } from "./support/fixtures.ts";

// The image tab: slicing fields and the origin, through the real Workspace.

/** jsdom doesn't decode images: every image "loads" as 128×144, the m1 hero sheet's 4 × 3 cells of 32×48. */
class FakeImage {
  naturalWidth = 128;
  naturalHeight = 144;
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

async function openHeroSheet() {
  const fs = new MemoryFs();
  const p = await m1Project();
  await saveProject(fs, { ...p, saved: {}, files: [], savedFolders: [] });
  for (const i of p.assets!.data.images) await fs.writeBytes(i.path, new Uint8Array([0]));
  const editor = await Editor.open({ fs });
  const platform = { assetUrl: (_r: string, path: string) => path } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={new CommandRegistry()}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "hero_sheet" } });
  fireEvent.doubleClick((await screen.findByRole("treeitem", { name: "image hero_sheet" })).firstElementChild!);
  await screen.findByLabelText("Sheet summary");
  return editor;
}

const hero = (ed: Editor) => ed.project.assets!.data.images.find((i) => i.id === "hero_sheet")!;

describe("image tab", () => {
  it("opens from the browser and shows the sheet", async () => {
    await openHeroSheet();
    expect(screen.getByLabelText("Sheet summary").textContent).toBe("4 × 3 = 12 frames of 32×48 px");
    expect(screen.getByLabelText("Spritesheet")).toBeTruthy();
    expect(screen.getByLabelText("Frame preview")).toBeTruthy();
  });

  it("slices by frame size, one undo step per field", async () => {
    const editor = await openHeroSheet();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Frame size" }));
    const width = screen.getByLabelText("Frame width");
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: "1" } });
    fireEvent.change(width, { target: { value: "16" } });
    fireEvent.blur(width);
    expect(hero(editor).sheet).toEqual({ columns: 8, rows: 3, cellWidth: 16, cellHeight: 48 });
    expect(hero(editor).origin).toEqual([16, 47]);
    expect(screen.getByLabelText("Sheet summary").textContent).toBe("8 × 3 = 24 frames of 16×48 px");
    editor.undo();
    expect(hero(editor).sheet!.columns).toBe(4);
  });

  it("makes the image a single frame and sets the origin from the fields", async () => {
    const editor = await openHeroSheet();
    const x = screen.getByLabelText("Origin x");
    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: "20" } });
    fireEvent.blur(x);
    expect(hero(editor).origin).toEqual([20, 47]);
    fireEvent.click(screen.getByRole("button", { name: "Bottom-centre" }));
    expect(hero(editor).origin).toBeUndefined();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Single image" }));
    expect(hero(editor).sheet).toBeUndefined();
    expect(editor.history.undoLabel).toBe("Make single image");
  });
});
