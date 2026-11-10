// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject, type SceneFile } from "@questforge/schema";
import { Editor } from "../src/model/editor.ts";
import { CommandRegistry } from "../src/model/appCommands.ts";
import type { Platform } from "../src/platform/platform.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { m1Project } from "./support/fixtures.ts";

afterEach(cleanup);

async function mount() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  const platform = { assetUrl: (_r: string, p: string) => p } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={new CommandRegistry()}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
  return editor;
}

const garden = (ed: Editor) => ed.project.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;

describe("scene Inspector", () => {
  it("edits depth lines from the Layers panel selection, one undo step per field", async () => {
    const editor = await mount();
    const guides = screen.getByRole("region", { name: "Guides layer" });
    fireEvent.click(within(guides).getByText("Far line"));
    const inspector = screen.getByLabelText("Inspector");
    const far = within(within(inspector).getByRole("region", { name: "Far line" })).getByLabelText("Scale");
    fireEvent.focus(far);
    fireEvent.change(far, { target: { value: "0." } });
    fireEvent.change(far, { target: { value: "0.5" } });
    fireEvent.blur(far);
    expect(garden(editor).depth.far.scale).toBe(0.5);
    expect(editor.history.undoLabel).toBe("Change depth scale");
    editor.undo();
    expect(garden(editor).depth.far.scale).toBe(0.35);
  });

  it("renames a hotspot and shows its problems", async () => {
    const editor = await mount();
    fireEvent.click(within(screen.getByRole("region", { name: "Hotspots layer" })).getByText(/^pond/));
    const inspector = screen.getByLabelText("Inspector");
    const name = within(inspector).getByLabelText("Name (shown to the player)");
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "lily pond" } });
    fireEvent.blur(name);
    expect(garden(editor).hotspots.find((h) => h.id === "pond")!.name).toBe("lily pond");
    // Make the pond's shape cross itself: the Inspector says so.
    act(
      () =>
        void editor.apply("break", (p) => ({
          ...p,
          scenes: p.scenes.map((s) =>
            s.data.id === "garden"
              ? {
                  ...s,
                  data: {
                    ...s.data,
                    hotspots: s.data.hotspots.map((h) =>
                      h.id === "pond"
                        ? {
                            ...h,
                            shape: [
                              [0, 0],
                              [10, 10],
                              [10, 0],
                              [0, 10],
                            ],
                          }
                        : h,
                    ),
                  },
                }
              : s,
          ),
        })),
    );
    act(() => editor.validateNow());
    expect(within(screen.getByLabelText("Inspector")).getByRole("list", { name: "Problems with this" }).textContent).toContain("crosses itself");
  });
});
