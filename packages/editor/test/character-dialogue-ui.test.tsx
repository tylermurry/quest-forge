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

// Styling > Dialogue Choices through the real Workspace: exactly two color controls and the preview.

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openChoices() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
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
  fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: "Character Dialogue" }));
  return editor;
}

const choices = (e: Editor) => e.project.game!.data.style?.dialogueChoices;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe("Character Dialogue", () => {
  it("sets one name color for every speaker, starting from pale gold, as one undo step", async () => {
    const editor = await openChoices();
    expect(field("Name color").value).toBe("#e8d8a8");
    fireEvent.change(field("Name color"), { target: { value: "#33cc66" } });
    expect(editor.project.game!.data.style?.speech).toEqual({ name: "#33cc66" });
    expect(field("Name color").value).toBe("#33cc66");
    editor.undo();
    expect(editor.project.game!.data.style?.speech).toBeUndefined();
  });

  it("opening the section switches the preview to Character Speech; Typography keeps the sample", async () => {
    await openChoices();
    const pressed = () => within(screen.getByRole("radiogroup", { name: "Sample" })).getByRole("radio", { checked: true }).textContent;
    expect(pressed()).toBe("Character Speech");
    fireEvent.click(screen.getByRole("radio", { name: "Dialogue Choice" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: "Typography" }));
    expect(pressed()).toBe("Dialogue Choice");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Game settings" })).getByRole("button", { name: "Inventory" }));
    expect(pressed()).toBe("Inventory");
  });

  it("shows Actual game size only while the canvas isn't 640×400", async () => {
    await openChoices();
    // jsdom lays nothing out, so the canvas shows at game size.
    expect(screen.queryByRole("button", { name: "Actual game size" })).toBeNull();
  });

  it("has the color controls and nothing else to set, and each change is its own undo step", async () => {
    const editor = await openChoices();
    const section = screen.getByRole("region", { name: "Character Dialogue" });
    // Two color fields (a picker swatch and a hex box each), the hover effect, and no other inputs.
    expect(within(section).getAllByRole("button", { name: /^Pick .* color$/ })).toHaveLength(2);
    expect(section.querySelectorAll("input")).toHaveLength(2);
    // No explanatory copy; Brighten is the effect shown from the start.
    expect(within(section).queryAllByRole("paragraph")).toHaveLength(0);
    expect(section.querySelectorAll("p")).toHaveLength(0);
    const effect = (name: string) => within(screen.getByRole("group", { name: "Hover effect" })).getByRole("button", { name });
    expect(effect("Brighten").getAttribute("aria-pressed")).toBe("true");
    expect(field("Separator color").value).toBe("#e8d8a8");
    expect(choices(editor)).toBeUndefined();
    fireEvent.click(effect("Darken"));
    expect(choices(editor)).toEqual({ effect: "darken" });
    expect(effect("Darken").getAttribute("aria-pressed")).toBe("true");
    expect(effect("Brighten").getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(field("Separator color"), { target: { value: "#ff0000" } });
    expect(choices(editor)).toEqual({ effect: "darken", separator: "#ff0000" });
    editor.undo();
    expect(choices(editor)).toEqual({ effect: "darken" });
  });

  it("shows a focusable preview that reacts to the pointer and the arrow keys without changing the project", async () => {
    const editor = await openChoices();
    fireEvent.click(screen.getByRole("radio", { name: "Dialogue Choice" }));
    const preview = screen.getByRole("img", { name: /Point at a choice/ });
    expect(preview.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(preview, { key: "ArrowDown" });
    fireEvent.mouseMove(preview, { clientX: 10, clientY: 10 });
    fireEvent.click(preview, { clientX: 10, clientY: 10 });
    expect(choices(editor)).toBeUndefined();
  });
});
