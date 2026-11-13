// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import { SAMPLES } from "../src/model/stylePreview.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// Game Settings > Styling through the real Workspace: one preview above all five sections, showing the sample that
// belongs to the section being edited, and every sample one click away.

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openStyling() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs }, { autosave: false });
  const platform = { assetUrl: (_r: string, p: string) => p } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={new CommandRegistry()}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  fireEvent.click(screen.getByRole("treeitem", { name: "Game" }).firstElementChild!);
  return editor;
}

const section = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name }));
const samples = () => screen.getByRole("radiogroup", { name: "Sample" });
const showing = () => within(samples()).getByRole("radio", { checked: true }).textContent;

describe("the Styling preview", () => {
  it("is the one preview for all five sections, with no Inspector beside it", async () => {
    await openStyling();
    for (const name of ["Frames", "Typography", "Character Dialogue", "Inventory", "Icon Bar"]) {
      section(name);
      expect(screen.getAllByLabelText("Style preview"), name).toHaveLength(1);
      expect(screen.getAllByRole("radiogroup", { name: "Sample" }), name).toHaveLength(1);
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
    expect(screen.queryByLabelText("Inspector")).toBeNull();
  });

  it("switches to each section's own sample, and Typography keeps whichever is showing", async () => {
    await openStyling();
    section("Frames");
    expect(showing()).toBe("Short Narration");
    section("Character Dialogue");
    expect(showing()).toBe("Character Speech");
    section("Inventory");
    expect(showing()).toBe("Inventory");
    section("Typography");
    expect(showing()).toBe("Inventory");
    section("Icon Bar");
    expect(showing()).toBe("Icon Bar");
    section("Typography");
    expect(showing()).toBe("Icon Bar");
  });

  it("shows every sample on request, in any section, and stays on the chosen one", async () => {
    await openStyling();
    for (const name of ["Frames", "Typography", "Character Dialogue", "Inventory", "Icon Bar"]) {
      section(name);
      for (const { label } of SAMPLES) {
        fireEvent.click(within(samples()).getByRole("radio", { name: label }));
        expect(showing(), `${name}: ${label}`).toBe(label);
      }
    }
  });
});
