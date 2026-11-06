// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import { locate } from "../src/model/locate.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
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
  return editor;
}

describe("the Game item (spec 10)", () => {
  it("opens game rules, default responses and the score from the browser", async () => {
    const editor = await mount();
    fireEvent.click(within(screen.getByRole("treeitem", { name: "Game" })).getByText("Game"));
    const inspector = screen.getByLabelText("Inspector");
    expect(within(inspector).getByRole("heading", { name: "M1 Engine Fixture" })).toBeTruthy();
    // The combine rule reads as a sentence: When Combine [stick] with [string].
    const card = within(inspector).getByRole("listitem", { name: "Rule 1" });
    expect(within(card).getByRole("combobox", { name: "Other item" }).textContent).toBe("string");
    expect(within(card).getAllByRole("combobox", { name: "Item" })[0]!.textContent).toBe("stick");
    expect(within(inspector).getByText(/add up to 25/)).toBeTruthy();
    const look = within(inspector).getByLabelText("Look at something with no rule");
    fireEvent.focus(look);
    fireEvent.change(look, { target: { value: "Nothing special." } });
    fireEvent.blur(look);
    expect(editor.project.game!.data.defaultResponses.look).toBe("Nothing special.");
    expect(editor.history.undoLabel).toBe("Change default response");
  });

  it("jump-to a game problem selects the Game item", async () => {
    const editor = await mount();
    act(() => void editor.apply("Raise max score", (p) => ({ ...p, game: { ...p.game!, data: { ...p.game!.data, maxScore: 99 } } })));
    act(() => editor.validateNow());
    const problem = editor.problems.find((x) => x.code === "award_total_mismatch")!;
    const list = screen.getByRole("list", { name: "Problems" });
    fireEvent.click(within(list).getByText(/awards add up to 25/));
    expect(locate(editor.project, problem.location)!.target).toEqual({ kind: "game" });
    expect(screen.getByRole("treeitem", { name: "Game" }).getAttribute("aria-selected")).toBe("true");
  });
});
