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

// Styling > Shared Frames through the real Workspace: the picker, the guides and the number boxes.

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

async function openSharedFrames() {
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
  fireEvent.doubleClick(screen.getByRole("treeitem", { name: "Game" }).firstElementChild!);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Styling" }));
  return editor;
}

const style = (e: Editor) => e.project.game!.data.style?.sharedFrame;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

async function pickGardenBackground() {
  fireEvent.click(screen.getByRole("combobox", { name: "Frame image" }));
  fireEvent.click(await screen.findByRole("option", { name: /garden_bg/ }));
  return screen.findByRole("slider", { name: "Left guide" });
}

describe("Shared Frames", () => {
  it("starts on the built-in look, then picks an image from the library and shows its guides", async () => {
    const editor = await openSharedFrames();
    expect(screen.getByRole("heading", { name: "Shared Frames" })).toBeTruthy();
    expect(screen.getByText(/panels use the built-in look/)).toBeTruthy();
    expect(screen.queryByRole("slider", { name: "Left guide" })).toBeNull();
    await pickGardenBackground();
    expect(style(editor)).toEqual({ image: "garden_bg" });
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(within(screen.getByLabelText("Legend")).getByText("Corners")).toBeTruthy();
    // Back to the built-in look; the image stays in the library.
    fireEvent.click(screen.getByRole("button", { name: "Use built-in look" }));
    expect(style(editor)).toBeUndefined();
    expect(editor.project.assets!.data.images.some((i) => i.id === "garden_bg")).toBe(true);
  });

  it("arrow keys move a focused guide and the number box follows; typing in a box moves the guide", async () => {
    const editor = await openSharedFrames();
    const left = await pickGardenBackground();
    left.focus();
    fireEvent.keyDown(left, { key: "ArrowRight" });
    fireEvent.keyDown(left, { key: "ArrowRight", shiftKey: true });
    expect(left.getAttribute("aria-valuenow")).toBe("11");
    expect(field("Left border (px)").value).toBe("11");
    expect(style(editor)?.insets).toEqual({ left: 11, right: 0, top: 0, bottom: 0 });
    fireEvent.change(field("Top border (px)"), { target: { value: "7" } });
    expect(screen.getByRole("slider", { name: "Top guide" }).getAttribute("aria-valuenow")).toBe("7");
    // Out of range typing is marked and not applied.
    fireEvent.change(field("Right border (px)"), { target: { value: "500" } });
    expect(field("Right border (px)").getAttribute("aria-invalid")).toBe("true");
    expect(style(editor)?.insets?.right).toBe(0);
    // Keys merge into one undo step per quick burst, and undo restores the previous borders.
    editor.undo();
    expect(style(editor)).toEqual({ image: "garden_bg", insets: { left: 11, right: 0, top: 0, bottom: 0 } });
  });

  it("a drag previews as it moves and is one undo step on release", async () => {
    const editor = await openSharedFrames();
    const left = await pickGardenBackground();
    const box = screen.getByTestId("nine-slice-image");
    // 96 px image shown at 3×: 288 css px wide.
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 288, height: 192, right: 288, bottom: 192, x: 0, y: 0, toJSON() {} });
    const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", x: number) => {
      const e = fireEvent[type](left, { pointerId: 1, clientX: x, clientY: 10 });
      return e;
    };
    pointer("pointerDown", 0);
    pointer("pointerMove", 30);
    pointer("pointerMove", 60);
    expect(field("Left border (px)").value).toBe("20");
    expect(style(editor)).toEqual({ image: "garden_bg" });
    pointer("pointerUp", 60);
    expect(style(editor)?.insets?.left).toBe(20);
    editor.undo();
    expect(style(editor)).toEqual({ image: "garden_bg" });
  });

  it("warns at once when the borders leave no centre, and explains the empty middle", async () => {
    await openSharedFrames();
    await pickGardenBackground();
    fireEvent.change(field("Left border (px)"), { target: { value: "48" } });
    fireEvent.change(field("Right border (px)"), { target: { value: "48" } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/leave no centre/);
    expect(alert.textContent).toMatch(/leaves the middle of the panel empty/);
  });
});
