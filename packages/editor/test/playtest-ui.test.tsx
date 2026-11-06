// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// The Dock's Playtest tab (D127): toolbar, debug toggles and the D38 gate.

afterEach(cleanup);

async function mount() {
  // Saved to memory without its PNGs, so the project has "missing image file" errors.
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  const registry = new CommandRegistry();
  const platform = { assetUrl: (_r: string, p: string) => p } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={registry}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  return { editor, registry };
}

describe("Playtest tab", () => {
  it("shows how to start, and the debug layers toggle", async () => {
    await mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Playtest" }));
    expect(screen.getByText(/to start from the beginning/)).toBeTruthy();
    const layers = screen.getByRole("group", { name: "Debug layers" });
    const walkable = within(layers).getByRole("button", { name: "Walkable" });
    expect(walkable.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(walkable);
    // The panel re-renders on the next frame.
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(walkable.getAttribute("aria-pressed")).toBe("true");
    // No scene tab is open: Play from here is disabled (D132).
    expect((screen.getByRole("button", { name: "Play from here (F6)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Play with errors opens Problems instead (D38)", async () => {
    const { registry } = await mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Playtest" }));
    expect(screen.getByRole("tab", { name: "Playtest" }).getAttribute("aria-selected")).toBe("true");
    act(() => void registry.run("play.start"));
    expect(screen.getByRole("tab", { name: /^Problems/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("list", { name: "Problems" })).toBeTruthy();
  });
});
