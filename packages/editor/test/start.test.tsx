// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryFs } from "@questforge/schema";
import type { Platform } from "../src/platform/platform.ts";
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
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(await platform.disks.get("/games/Cave Story")!.list()).toContain("game.yaml");
    expect(saveRecent).toHaveBeenLastCalledWith([expect.objectContaining({ root: "/games/Cave Story", title: "Cave Story" })]);

    fireEvent.click(screen.getByRole("button", { name: "Close project" }));
    await waitFor(() => expect(screen.getByLabelText("Recent projects").textContent).toContain("Cave Story"));
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
