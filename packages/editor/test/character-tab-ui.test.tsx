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

// The character tab (spec 05, D39): slot grid and slot editor, through the real Workspace.

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

async function openHero() {
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
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "hero" } });
  fireEvent.doubleClick((await screen.findByRole("treeitem", { name: "character Hero" })).firstElementChild!);
  await screen.findByLabelText("Animation slots");
  return editor;
}

const anims = (ed: Editor) => ed.project.characters.find((c) => c.data.id === "hero")!.data.animations;

describe("character tab", () => {
  it("labels each slot with what the engine plays", async () => {
    await openHero();
    expect(screen.getByLabelText("Slot walk_left").textContent).toBe("Mirrors walk_right");
    expect(screen.getByLabelText("Slot talk_down").textContent).toBe("Empty: uses idle_down");
  });

  it("fills an empty slot from a sheet row, one undo step", async () => {
    const editor = await openHero();
    fireEvent.click(screen.getByLabelText("Slot talk_down"));
    fireEvent.click(await screen.findByRole("button", { name: "Row 2" }));
    expect(anims(editor).talk_down).toEqual({ image: "hero_sheet", frames: [4, 5, 6, 7], fps: 8, loop: true });
    expect(screen.getByLabelText("Slot talk_down").textContent).toBe("4 frames · 8 fps");
    editor.undo();
    expect(anims(editor).talk_down).toBeUndefined();
  });
});
