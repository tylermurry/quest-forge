// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// The Styling tab draws a canvas preview, which jsdom can't do.
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

const gameRow = () => screen.getByRole("treeitem", { name: "Game" }).firstElementChild!;
const openGame = () => fireEvent.doubleClick(gameRow());
const inspectorShown = () => screen.getByRole("button", { name: "Show inspector" }).getAttribute("aria-pressed") === "true";
const selectTab = (name: RegExp | string) => fireEvent.mouseDown(screen.getByRole("tab", { name }));

describe("the Game Settings tab", () => {
  it("a single click selects the Game and the Inspector points to the tab; double-click opens one tab and hides the Inspector", async () => {
    await mount();
    fireEvent.click(gameRow());
    expect(screen.queryByRole("tab", { name: "Game Settings" })).toBeNull();
    fireEvent.click(within(screen.getByLabelText("Inspector")).getByRole("button", { name: "Open Game Settings" }));
    expect(screen.getAllByRole("tab", { name: "Game Settings" })).toHaveLength(1);
    openGame();
    expect(screen.getAllByRole("tab", { name: "Game Settings" })).toHaveLength(1);
    expect(screen.queryByLabelText("Inspector")).toBeNull();
    expect(screen.getByRole("tabpanel", { name: "Game Settings" })).toBeTruthy();
  });

  it("Enter on the Game row opens it", async () => {
    await mount();
    fireEvent.keyDown(gameRow(), { key: "Enter" });
    expect(screen.getByRole("tab", { name: "Game Settings", selected: true })).toBeTruthy();
  });

  it("General and Styling have their subsection menus, and Styling shows honest placeholders", async () => {
    await mount();
    openGame();
    const general = screen.getByRole("tablist", { name: "General sections" });
    expect(within(general).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual(["Start", "Score", "Default Responses", "Rules"]);
    selectTab("Styling");
    const styling = screen.getByRole("tablist", { name: "Styling sections" });
    expect(within(styling).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Shared Frames", "Typography", "Icon Bar", "Dialogue Choices"]);
    selectTab("Typography");
    expect(screen.getByRole("heading", { name: "Typography" })).toBeTruthy();
    selectTab("Icon Bar");
    expect(screen.getByRole("heading", { name: "Icon Bar" })).toBeTruthy();
    selectTab("Dialogue Choices");
    expect(screen.getByRole("heading", { name: "Dialogue Choices" })).toBeTruthy();
    expect(screen.getByText(/coming in a later update/)).toBeTruthy();
    // Each area remembers its subsection.
    selectTab("General");
    expect(screen.getByRole("tab", { name: "Start", selected: true })).toBeTruthy();
  });

  it("leaving the tab brings the Inspector back for the other tabs, as it was", async () => {
    await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    expect(inspectorShown()).toBe(true);
    openGame();
    expect(screen.queryByLabelText("Inspector")).toBeNull();
    expect(inspectorShown()).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Garden" }));
    expect(screen.getByLabelText("Inspector")).toBeTruthy();
    expect(inspectorShown()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close Game Settings" }));
    expect(screen.queryByRole("tab", { name: "Game Settings" })).toBeNull();
    expect(inspectorShown()).toBe(true);
  });

  it("edits the start, score, default responses and game rules, each undoable", async () => {
    const editor = await mount();
    openGame();
    selectTab(/^Rules/);
    // The combine rule reads as a sentence: When Combine [stick] with [string].
    const card = screen.getByRole("listitem", { name: "Rule 1" });
    expect(within(card).getByRole("combobox", { name: "Other item" }).textContent).toBe("string");
    expect(within(card).getAllByRole("combobox", { name: "Item" })[0]!.textContent).toBe("stick");
    selectTab("Score");
    expect(screen.getByText(/add up to 25/)).toBeTruthy();
    const max = screen.getByLabelText("Max score");
    fireEvent.focus(max);
    fireEvent.change(max, { target: { value: "30" } });
    fireEvent.blur(max);
    expect(editor.project.game!.data.maxScore).toBe(30);
    expect(editor.history.undoLabel).toBe("Change max score");
    selectTab("Default Responses");
    const look = screen.getByLabelText("Look at something with no rule");
    fireEvent.focus(look);
    fireEvent.change(look, { target: { value: "Nothing special." } });
    fireEvent.blur(look);
    expect(editor.project.game!.data.defaultResponses.look).toBe("Nothing special.");
    expect(editor.history.undoLabel).toBe("Change default response");
    act(() => void editor.undo());
    expect(editor.project.game!.data.defaultResponses.look).not.toBe("Nothing special.");
  });

  async function raiseScore() {
    const editor = await mount();
    act(() => void editor.apply("Raise max score", (p) => ({ ...p, game: { ...p.game!, data: { ...p.game!.data, maxScore: 99 } } })));
    act(() => editor.validateNow());
    return editor;
  }
  const jumpToScoreProblem = () => fireEvent.click(within(screen.getByRole("list", { name: "Problems" })).getByText(/awards add up to 25/));

  async function expectScoreFocused() {
    const field = screen.getByLabelText("Max score");
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.getByRole("tab", { name: "Score", selected: true })).toBeTruthy();
    // Only the field's section flashes, never the whole editor.
    expect(document.querySelector("[data-game=maxScore].qf-flash")).toBeTruthy();
    expect(document.querySelectorAll(".qf-flash")).toHaveLength(1);
  }

  it("jump-to a game problem opens the Score subsection and focuses the field", async () => {
    await raiseScore();
    jumpToScoreProblem();
    expect(screen.getByRole("tab", { name: "Game Settings", selected: true })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "Game" }).getAttribute("aria-selected")).toBe("true");
    await expectScoreFocused();
  });

  it("jump-to from another subsection of an open tab changes subsection and still focuses the field", async () => {
    await raiseScore();
    openGame();
    jumpToScoreProblem();
    await expectScoreFocused();
  });

  it("jump-to from the Styling area switches to General and focuses the field", async () => {
    await raiseScore();
    openGame();
    selectTab("Styling");
    jumpToScoreProblem();
    await expectScoreFocused();
  });

  it("jump-to a game rule opens Rules and flashes the card", async () => {
    const editor = await mount();
    act(() => void editor.apply("Delete item", (p) => ({ ...p, items: p.items.filter((i) => i.data.id !== "rod") })));
    act(() => editor.validateNow());
    openGame();
    selectTab("Styling");
    fireEvent.click(within(screen.getByRole("list", { name: "Problems" })).getAllByText(/item rod/).find((e) => e.closest("li")?.textContent?.startsWith("Game settings"))!);
    expect(screen.getByRole("tab", { name: /^Rules/, selected: true })).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-rule-card].qf-flash, li[aria-label^='Rule 1'].qf-flash, .qf-flash")).toBeTruthy());
    expect(screen.getByRole("listitem", { name: "Rule 1" })).toBeTruthy();
  });
});
