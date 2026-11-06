// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Copy, m1Project } from "./support/fixtures.ts";

// Play controls in the title bar and the playtest area (D133): only what applies
// shows, related actions sit behind split buttons, and the game replaces the scene editor.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom has no 2D canvas: a context that accepts every call keeps the game's frame loop quiet. */
function fakeCanvas() {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
}

async function mount(opts: { valid?: boolean } = {}) {
  let editor: Editor;
  if (opts.valid) {
    editor = await Editor.open({ fs: (await m1Copy()).fs });
  } else {
    // Saved to memory without its PNGs, so the project has "missing image file" errors.
    const fs = new MemoryFs();
    await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
    editor = await Editor.open({ fs });
  }
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

const nextFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));

describe("play controls (D133)", () => {
  it("shows Play while stopped, with From here (disabled without a scene) and presets behind the split", async () => {
    await mount();
    const controls = screen.getByRole("toolbar", { name: "Play controls" });
    expect(within(controls).getByRole("button", { name: "Play" })).toBeTruthy();
    expect(within(controls).queryByRole("button", { name: "Restart" })).toBeNull();
    expect(within(controls).queryByRole("button", { name: "Stop" })).toBeNull();
    // Radix dropdowns open from the keyboard in jsdom.
    within(controls).getByRole("button", { name: "More ways to play" }).focus();
    await userEvent.keyboard("{Enter}");
    const here = await screen.findByRole("menuitem", { name: /Play from here/ });
    expect(here.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/No presets yet/)).toBeTruthy();
  });

  it("Play with errors opens Problems and stays in the editor (D38)", async () => {
    const { registry, editor } = await mount();
    const notice = vi.spyOn(editor, "showNotice");
    act(() => void registry.run("play.start"));
    expect(screen.queryByLabelText("Running game")).toBeNull();
    expect(screen.getByRole("list", { name: "Problems" })).toBeTruthy();
    expect(notice.mock.calls[0]?.[0].text).toMatch(/Problems/);
  });

  it("Play replaces the editor with debug bar, state and log and hides the side panels; Stop restores them", async () => {
    fakeCanvas();
    const { registry } = await mount({ valid: true });
    expect(screen.getByLabelText("Project browser")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Problems panel" })).toBeTruthy();
    act(() => void registry.run("play.start"));
    await nextFrame();
    const layers = screen.getByRole("group", { name: "Debug layers" });
    const walkable = within(layers).getByRole("button", { name: "Walkable" });
    expect(walkable.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(walkable);
    await nextFrame();
    expect(walkable.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Running game")).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.getByLabelText("Event log")).toBeTruthy();
    // The scene editor and Problems are gone while playing; the side panels are collapsed.
    expect(screen.queryByRole("region", { name: "Problems panel" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Inspector" })?.closest("[data-panel]")?.getAttribute("data-collapsed") ?? "true").not.toBe("false");
    act(() => void registry.run("play.stop"));
    await nextFrame();
    expect(screen.queryByLabelText("Running game")).toBeNull();
    expect(screen.getByRole("region", { name: "Problems panel" })).toBeTruthy();
    const controls = screen.getByRole("toolbar", { name: "Play controls" });
    expect(within(controls).getByRole("button", { name: "Play" })).toBeTruthy();
  });
});
