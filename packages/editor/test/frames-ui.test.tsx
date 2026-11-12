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

// Styling > Frames through the real Workspace: the picker, the default look and the guides.

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

async function openFrames() {
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
  fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: "Frames" }));
  return editor;
}

const style = (e: Editor) => e.project.game!.data.style?.sharedFrame;

async function pickGardenBackground() {
  fireEvent.click(screen.getByRole("combobox", { name: "Frame image" }));
  fireEvent.click(await screen.findByRole("option", { name: /garden_bg/ }));
  return screen.findByRole("slider", { name: "Left guide" });
}

describe("Frames", () => {
  it("has no border boxes, legend, shape or zoom, and shows the guides of a picked image", async () => {
    const editor = await openFrames();
    expect(screen.getByRole("heading", { name: "Frames" })).toBeTruthy();
    expect(screen.queryByRole("slider", { name: "Left guide" })).toBeNull();
    // No border boxes, legend, shape or zoom controls.
    expect(screen.queryByLabelText("Left border (px)")).toBeNull();
    expect(screen.queryByLabelText("Legend")).toBeNull();
    expect(screen.queryByRole("group", { name: "Shape" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Zoom" })).toBeNull();
    await pickGardenBackground();
    expect(style(editor)).toEqual({ image: "garden_bg" });
    expect(screen.getAllByRole("slider", { name: /guide$/ })).toHaveLength(4);
  });

  it("Use default look adds the frame picture back and picks it, as one undo step", async () => {
    const editor = await openFrames();
    await pickGardenBackground();
    // Use default look adds Styling/frame.jpg and picks it, already cut; the other image stays in the library.
    fireEvent.click(screen.getByRole("button", { name: "Use default look" }));
    expect(style(editor)).toEqual({ image: "frame", insets: { left: 12, right: 12, top: 12, bottom: 12 } });
    expect(editor.project.assets!.data.images).toContainEqual({ id: "frame", path: "assets/images/Styling/frame.jpg" });
    expect(editor.project.assets!.data.images.some((i) => i.id === "garden_bg")).toBe(true);
    expect(screen.queryByRole("button", { name: "Use default look" })).toBeNull();
    editor.undo();
    expect(style(editor)).toEqual({ image: "garden_bg" });
  });

  it("the Border size slider and the guides move all four borders together", async () => {
    const editor = await openFrames();
    const left = await pickGardenBackground();
    const slider = screen.getByLabelText("Border size") as HTMLInputElement;
    // Scale sits right under it, in the Panel Frame part.
    const scale = screen.getByLabelText("Scale");
    expect(slider.compareDocumentPosition(scale) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 96×64 image: at most 31 px, so a pixel of centre always remains.
    expect(slider.max).toBe("31");
    fireEvent.change(slider, { target: { value: "8" } });
    fireEvent.change(slider, { target: { value: "14" } });
    expect(style(editor)?.insets).toEqual({ left: 14, right: 14, top: 14, bottom: 14 });
    // Fine tuning with the keys on any guide keeps them equal.
    left.focus();
    fireEvent.keyDown(left, { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Bottom guide" }), { key: "ArrowDown" });
    expect(style(editor)?.insets).toEqual({ left: 14, right: 14, top: 14, bottom: 14 });
    fireEvent.keyDown(left, { key: "ArrowRight", shiftKey: true });
    expect(style(editor)?.insets).toEqual({ left: 24, right: 24, top: 24, bottom: 24 });
    expect(slider.value).toBe("24");
    // The slider and the keys were one quick burst: one undo step.
    editor.undo();
    expect(style(editor)).toEqual({ image: "garden_bg" });
  });

  it("a guide drag moves every guide as it goes and is one undo step on release", async () => {
    const editor = await openFrames();
    const left = await pickGardenBackground();
    const box = screen.getByTestId("nine-slice-image");
    // 96 px image shown at 3×: 288 css px wide.
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 288, height: 192, right: 288, bottom: 192, x: 0, y: 0, toJSON() {} });
    const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", x: number) => fireEvent[type](left, { pointerId: 1, clientX: x, clientY: 10 });
    pointer("pointerDown", 0);
    pointer("pointerMove", 30);
    pointer("pointerMove", 60);
    expect(screen.getByRole("slider", { name: "Top guide" }).getAttribute("aria-valuenow")).toBe("20");
    expect(style(editor)).toEqual({ image: "garden_bg" });
    pointer("pointerUp", 60);
    expect(style(editor)?.insets).toEqual({ left: 20, right: 20, top: 20, bottom: 20 });
    editor.undo();
    expect(style(editor)).toEqual({ image: "garden_bg" });
  });
  it("Scale and the narration Top, Center and Width each save, one undo step per drag", async () => {
    const editor = await openFrames();
    const narration = () => editor.project.game!.data.style?.narration;
    const slider = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
    expect(slider("Scale").value).toBe("16");
    fireEvent.change(slider("Scale"), { target: { value: "20" } });
    fireEvent.change(slider("Scale"), { target: { value: "32" } });
    expect(style(editor)?.scale).toBe(32);
    editor.undo();
    expect(style(editor)?.scale).toBeUndefined();
    // Top, Center and Width are in the Position part.
    expect(screen.queryByLabelText("Top")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Position" }));
    expect(screen.queryByLabelText("Scale")).toBeNull();
    expect(slider("Top").value).toBe("50");
    expect(slider("Width").value).toBe("60");
    fireEvent.change(slider("Top"), { target: { value: "90" } });
    editor.history.breakMerge();
    fireEvent.change(slider("Width"), { target: { value: "75" } });
    expect(narration()).toEqual({ top: 90, width: 75 });
    // Center turns the Top slider off and keeps its value for later.
    fireEvent.click(screen.getByRole("checkbox", { name: "Center" }));
    expect(narration()).toEqual({ top: 90, width: 75, center: true });
    expect(slider("Top").disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Center" }));
    expect(narration()).toEqual({ top: 90, width: 75 });
    expect(slider("Top").disabled).toBe(false);
  });

  it("one preview above the settings offers every sample, opening on Short Narration; Narration is now Position", async () => {
    await openFrames();
    expect(screen.getAllByRole("radiogroup", { name: "Sample" })).toHaveLength(1);
    const samples = screen.getByRole("radiogroup", { name: "Sample" });
    expect(within(samples).getAllByRole("radio").map((b) => b.textContent)).toEqual(["Short Narration", "Long Narration", "Character Speech", "Dialogue Choice", "Inventory", "Icon Bar"]);
    expect(within(samples).getByRole("radio", { name: "Short Narration", checked: true })).toBeTruthy();
    // Panel Frame and Position are a toggle bar, Panel Frame first and on.
    const tabs = screen.getByRole("radiogroup", { name: "Frames sections" });
    expect(within(tabs).getAllByRole("radio").map((t) => t.textContent)).toEqual(["Panel Frame", "Position"]);
    expect(screen.getByRole("radio", { name: "Panel Frame", checked: true })).toBeTruthy();
    // Clicking the part that is on keeps it on: there is always one.
    fireEvent.click(screen.getByRole("radio", { name: "Panel Frame" }));
    expect(screen.getByRole("radio", { name: "Panel Frame", checked: true })).toBeTruthy();
    // On the heading's row, to leave the most height for the settings.
    expect(tabs.parentElement).toBe(screen.getByRole("heading", { name: "Frames" }).parentElement);
    expect(screen.queryByRole("radio", { name: "Narration" })).toBeNull();
    // The preview comes before the settings, in its own pane with a handle to resize it.
    const preview = screen.getByLabelText("Style preview");
    expect(preview.compareDocumentPosition(screen.getByRole("region", { name: "Frames" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.closest("[data-slot=resizable-panel-group]")!.querySelector("[data-slot=resizable-handle]")).toBeTruthy();
  });
});
