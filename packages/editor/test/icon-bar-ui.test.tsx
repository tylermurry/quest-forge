// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// Styling > Icon Bar through the real Workspace: the frame, the seven pictures, the effect and the preview.

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

async function openIconBar() {
  const fs = new MemoryFs();
  const project = await m1Project();
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
  fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: "Icon Bar" }));
  return editor;
}

const bar = (e: Editor) => e.project.game!.data.style?.iconBar;

async function pick(combobox: string, image: RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: combobox }));
  fireEvent.click(await screen.findByRole("option", { name: image }));
}

describe("Icon Bar", () => {
  it("starts on the original look, with seven pickers and an effect that is not chosen yet", async () => {
    await openIconBar();
    expect(screen.getByRole("heading", { name: "Icon Bar" })).toBeTruthy();
    expect(screen.getByText(/bar keeps its original look/)).toBeTruthy();
    for (const name of ["Walk", "Look", "Hand", "Talk", "Item", "Inventory", "Settings"]) expect(screen.getByRole("combobox", { name: `${name} icon image` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Brighten" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Darken" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("picks the bar's frame with the same nine-slice editor, with borders of its own", async () => {
    const editor = await openIconBar();
    await pick("Frame image", /garden_bg/);
    const left = await screen.findByRole("slider", { name: "Left guide" });
    left.focus();
    fireEvent.keyDown(left, { key: "ArrowRight", shiftKey: true });
    expect(left.getAttribute("aria-valuenow")).toBe("10");
    expect(bar(editor)?.frame).toEqual({ image: "garden_bg", insets: { left: 10, right: 10, top: 10, bottom: 10 } });
    expect(editor.project.game!.data.style?.sharedFrame).toBeUndefined();
  });

  it("picks and clears a button's picture, each as one undo step", async () => {
    const editor = await openIconBar();
    await pick("Walk icon image", /garden_bg/);
    await pick("Item icon image", /palm_img/);
    expect(bar(editor)?.icons).toEqual({ walk: "garden_bg", item: "palm_img" });
    fireEvent.click(screen.getByRole("button", { name: "Use built-in Walk icon" }));
    expect(bar(editor)?.icons).toEqual({ item: "palm_img" });
    editor.undo();
    expect(bar(editor)?.icons).toEqual({ walk: "garden_bg", item: "palm_img" });
    editor.undo();
    expect(bar(editor)?.icons).toEqual({ walk: "garden_bg" });
  });

  it("switches the one effect between Brighten and Darken", async () => {
    const editor = await openIconBar();
    fireEvent.click(screen.getByRole("button", { name: "Darken" }));
    expect(bar(editor)).toEqual({ effect: "darken" });
    expect(screen.getByRole("button", { name: "Darken" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Brighten" }));
    expect(bar(editor)?.effect).toBe("brighten");
    expect(screen.getByRole("button", { name: "Brighten" }).getAttribute("aria-pressed")).toBe("true");
    editor.undo();
    expect(bar(editor)?.effect).toBe("darken");
  });

  it("opening Icon Bar shows the Icon Bar sample; a click selects a button and the arrow keys move the selection", async () => {
    await openIconBar();
    expect(screen.getByRole("radio", { name: "Icon Bar", checked: true })).toBeTruthy();
    const preview = screen.getByRole("img", { name: /Preview of the icon bar/ });
    expect(preview.getAttribute("aria-label")).toMatch(/walk button is selected/);
    preview.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400, right: 640, bottom: 400, x: 0, y: 0, toJSON() {} });
    // Look is the second button, at x 52–96.
    fireEvent.click(preview, { clientX: 70, clientY: 20 });
    expect(preview.getAttribute("aria-label")).toMatch(/look button is selected/);
    fireEvent.keyDown(preview, { key: "ArrowRight" });
    expect(preview.getAttribute("aria-label")).toMatch(/hand button is selected/);
    fireEvent.keyDown(preview, { key: "ArrowLeft" });
    fireEvent.keyDown(preview, { key: "ArrowLeft" });
    expect(preview.getAttribute("aria-label")).toMatch(/walk button is selected/);
  });
});
