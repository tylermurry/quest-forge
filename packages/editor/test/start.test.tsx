// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryFs } from "@questforge/schema";
import type { Platform } from "../src/platform/platform.ts";
import { setMaxScore } from "../src/model/game.ts";
import type { Editor } from "../src/model/editor.ts";
import { App } from "../src/ui/App.tsx";
import { PlatformContext } from "../src/ui/hooks.ts";

afterEach(cleanup);

/** A platform whose folders are MemoryFs instances. */
function memoryPlatform(): Platform & { disks: Map<string, MemoryFs> } {
  const disks = new Map<string, MemoryFs>();
  let recent: Awaited<ReturnType<Platform["loadRecent"]>> = [];
  return {
    disks,
    kind: "browser",
    openFolder: async () => null,
    chooseParent: async () => "/games",
    joinPath: (a, b) => `${a}/${b}`,
    async makeProjectFolder(root) {
      if (disks.has(root)) throw new Error("exists");
      disks.set(root, new MemoryFs());
    },
    exists: async (root) => disks.has(root),
    host: (root) => ({ fs: disks.get(root)! }),
    assetUrl: (_r, p) => p,
    loadRecent: async () => recent,
    saveRecent: async (l) => void (recent = l),
    listProjects: async () => [...disks.keys()],
    saveBuild: async () => null,
    displayPath: (r) => r,
  };
}

describe("start screen (spec 08)", () => {
  it("creates a blank project, opens it, and lists it as recent", async () => {
    const platform = memoryPlatform();
    const saveRecent = vi.spyOn(platform, "saveRecent");
    const view = render(
      <PlatformContext.Provider value={platform}>
        <App />
      </PlatformContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "From demo template" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Game title"), { target: { value: "Cave Story" } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank project" }));
    await waitFor(() => expect(screen.getByText("Cave Story")).toBeTruthy());
    expect(screen.queryByRole("status", { name: "Save status" })).toBeNull(); // nothing to save, nothing shown
    expect(await platform.disks.get("/games/Cave Story")!.list()).toContain("game.yaml");
    expect(saveRecent).toHaveBeenLastCalledWith([expect.objectContaining({ root: "/games/Cave Story", title: "Cave Story" })]);

    fireEvent.click(screen.getByRole("button", { name: "Back to project selector" }));
    await waitFor(() => expect(screen.getByLabelText("Recent projects").textContent).toContain("Cave Story"));
    view.unmount();
  });

  it("saves by hand and asks before leaving with unsaved changes (D145)", async () => {
    const platform = memoryPlatform();
    const view = render(
      <PlatformContext.Provider value={platform}>
        <App />
      </PlatformContext.Provider>,
    );
    fireEvent.change(screen.getByLabelText("Game title"), { target: { value: "Cave Story" } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank project" }));
    await waitFor(() => expect(screen.getByText("Cave Story")).toBeTruthy());
    const ed = (window as unknown as { editor: Editor }).editor;
    const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);

    ed.apply("Set max score", (p) => setMaxScore(p, 77));
    await waitFor(() => expect(screen.getByRole("status", { name: "Save status" }).textContent).toBe("Unsaved changes"));
    await new Promise((r) => setTimeout(r, 1300)); // longer than the old autosave delay
    expect(await platform.disks.get("/games/Cave Story")!.readText("game.yaml")).not.toContain("77");

    // Leaving asks first; staying keeps the project and the edit.
    fireEvent.click(screen.getByRole("button", { name: "Back to project selector" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByText("Go back without saving?")).toBeNull());
    expect(screen.getByText("Cave Story")).toBeTruthy();

    // Save writes it, and then leaving needs no question.
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(screen.queryByRole("status", { name: "Save status" })).toBeNull());
    expect(await platform.disks.get("/games/Cave Story")!.readText("game.yaml")).toContain("77");
    fireEvent.click(screen.getByRole("button", { name: "Back to project selector" }));
    await waitFor(() => expect(screen.getByLabelText("Recent projects")).toBeTruthy());

    // Unsaved again: going back anyway discards the edit.
    fireEvent.click(screen.getAllByText("Cave Story")[0]!);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeTruthy());
    (window as unknown as { editor: Editor }).editor.apply("Set max score", (p) => setMaxScore(p, 5));
    fireEvent.click(screen.getByRole("button", { name: "Back to project selector" }));
    fireEvent.click(await screen.findByRole("button", { name: "Go back without saving" }));
    await waitFor(() => expect(screen.getByLabelText("Recent projects")).toBeTruthy());
    expect(await platform.disks.get("/games/Cave Story")!.readText("game.yaml")).not.toContain("max_score: 5\n");
    view.unmount();
  });

  it("shows an error when the folder already exists", async () => {
    const platform = memoryPlatform();
    platform.disks.set("/games/Taken", new MemoryFs());
    render(
      <PlatformContext.Provider value={platform}>
        <App />
      </PlatformContext.Provider>,
    );
    fireEvent.change(screen.getByLabelText("Game title"), { target: { value: "Taken" } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank project" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Couldn't create the project"));
  });
});

describe("launching with a folder", () => {
  it("opens the project passed on the command line", async () => {
    const platform = memoryPlatform();
    const { createBlankProject } = await import("../src/model/template.ts");
    platform.disks.set("/games/Cli", new MemoryFs());
    await createBlankProject(platform.disks.get("/games/Cli")!, "From the CLI");
    platform.launchProject = async () => "/games/Cli";
    render(
      <PlatformContext.Provider value={platform}>
        <App />
      </PlatformContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText("From the CLI")).toBeTruthy());
  });
});
