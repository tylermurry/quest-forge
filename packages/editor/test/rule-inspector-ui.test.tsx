// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject, type SceneFile } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
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
  fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
  return editor;
}

const garden = (ed: Editor) => ed.project.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;
const hotspot = (ed: Editor, id: string) => garden(ed).hotspots.find((h) => h.id === id)!;
const selectHotspot = (name: RegExp) => fireEvent.click(within(screen.getByRole("region", { name: "Hotspots layer" })).getByText(name));
const inspector = () => screen.getByLabelText("Inspector");

describe("rule inspector (spec 10)", () => {
  it("a quick field types one plain rule as one undo step, and clearing it deletes the rule", async () => {
    const editor = await mount();
    selectHotspot(/^pond/);
    const talk = within(inspector()).getByLabelText("Talk text");
    fireEvent.focus(talk);
    for (const v of ["N", "No", "No answer."]) fireEvent.change(talk, { target: { value: v } });
    fireEvent.blur(talk);
    expect(hotspot(editor, "pond").rules.at(-1)).toEqual({ id: "rule_5", when: { type: "talk" }, if: [], do: [{ type: "narrate", text: "No answer." }], once: false });
    expect(within(inspector()).getAllByRole("listitem", { name: /^Rule \d+$/ })).toHaveLength(5);
    editor.undo();
    expect(hotspot(editor, "pond").rules).toHaveLength(4);
  });

  it("shows rule cards as sentences; Add rule, Once and the action menu each make one undo step", async () => {
    const editor = await mount();
    const user = userEvent.setup();
    selectHotspot(/^pond/);
    const cards = within(inspector()).getAllByRole("listitem", { name: /^Rule \d+$/ });
    expect(cards).toHaveLength(4);
    // "When [Use ▾] with [fishing rod ▾]"
    expect(within(cards[1]!).getAllByRole("combobox", { name: "Item" })[0]!.textContent).toContain("fishing rod");
    await user.click(within(inspector()).getByRole("button", { name: "Add rule" }));
    expect(editor.history.undoLabel).toBe("Add rule");
    // Added above the quick fields' plain rules (D118).
    expect(hotspot(editor, "pond").rules.map((r) => r.id)).toEqual(["rule_5", "rule_1", "rule_2", "rule_3", "rule_4"]);
    const first = within(inspector()).getAllByRole("listitem", { name: /^Rule \d+$/ })[0]!;
    await user.click(within(first).getByRole("switch", { name: "Once" }));
    expect(hotspot(editor, "pond").rules[0]!.once).toBe(true);
    const addAction = within(first).getByRole("button", { name: "Action" });
    // (The real pane opens it on pointer down; in jsdom the keyboard is reliable.)
    addAction.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("menuitem", { name: "Narrate" }));
    expect(hotspot(editor, "pond").rules[0]!.do).toEqual([{ type: "narrate", text: "" }]);
    // Empty text is an error, shown on the card (D119).
    act(() => editor.validateNow());
    const card = within(inspector()).getAllByRole("listitem", { name: /^Rule \d+$/ })[0]!;
    expect(within(card).getByRole("list", { name: "Problems with this part" }).textContent).toContain("narrates nothing");
    const text = within(card).getByLabelText("Narration");
    fireEvent.focus(text);
    fireEvent.change(text, { target: { value: "Splash!" } });
    fireEvent.blur(text);
    act(() => editor.validateNow());
    expect(within(card).queryByRole("list", { name: "Problems with this part" })).toBeNull();
  });

  it("a quick field whose rule was edited by hand says which rule sets it", async () => {
    await mount();
    fireEvent.click(within(screen.getByRole("region", { name: "Objects layer" })).getByText(/^gardener/));
    expect(within(inspector()).getByRole("button", { name: "Set by rule 6" })).toBeTruthy();
  });

  it("a deleted item shows in red on the rules that use it", async () => {
    const editor = await mount();
    act(() => void editor.apply("Delete item", (p) => ({ ...p, items: p.items.filter((i) => i.data.id !== "rod") })));
    act(() => editor.validateNow());
    selectHotspot(/^pond/);
    const cards = within(inspector()).getAllByRole("listitem", { name: /^Rule \d+$/ });
    for (const i of [1, 2]) {
      const trigger = within(cards[i]!).getAllByRole("combobox", { name: "Item" })[0]!;
      expect(trigger.getAttribute("aria-invalid")).toBe("true");
      expect(trigger.textContent).toContain("rod (missing)");
    }
    // Other items in the same rule stay normal.
    expect(within(cards[1]!).getAllByRole("combobox", { name: "Item" })[1]!.getAttribute("aria-invalid")).toBeNull();
    expect(within(cards[0]!).queryByRole("combobox", { name: "Item" })).toBeNull();
  });

  it("selecting the scene shows its own rules", async () => {
    await mount();
    expect(within(inspector()).getByRole("region", { name: "Rules" })).toBeTruthy();
    expect(within(inspector()).queryByRole("region", { name: "Quick fields" })).toBeNull();
  });
});
