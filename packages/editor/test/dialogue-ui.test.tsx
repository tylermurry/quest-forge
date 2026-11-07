// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DialogueFile, MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// The dialogue tab (spec 11): the graph shows the file's nodes, clicking one edits it
// in the Inspector with the spec 10 controls, and Delete runs through the registry.

afterEach(cleanup);

async function mount() {
  const p = await m1Project();
  const chat = DialogueFile.parse({
    schemaVersion: 2,
    id: "chat",
    name: "Chat",
    nodes: [
      { id: "start", type: "start", pos: [0, 0], next: "hello" },
      { id: "hello", type: "line", pos: [300, 0], character: "gardener", text: "Hello there.", next: "menu" },
      { id: "menu", type: "choices", pos: [600, 0], options: [{ id: "bye", text: "Bye.", if: [], once: false, next: "end" }] },
      { id: "end", type: "end", pos: [900, 0] },
    ],
  });
  const fs = new MemoryFs();
  await saveProject(fs, { ...p, dialogues: [{ path: "dialogues/chat.dialogue.yaml", data: chat }], saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  const registry = new CommandRegistry();
  const platform = { assetUrl: (_r: string, path: string) => path } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={registry}>
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  fireEvent.doubleClick(screen.getByRole("treeitem", { name: "dialogue Chat" }).firstElementChild!);
  return { editor, registry };
}

const nodes = (ed: Editor) => ed.project.dialogues[0]!.data.nodes;
const inspector = () => screen.getByLabelText("Inspector");

describe("dialogue graph tab (spec 11)", () => {
  it("shows every node as a card with its ports", async () => {
    await mount();
    const graph = document.querySelector("[data-dialogue-graph=chat]") as HTMLElement;
    expect(within(graph).getByLabelText("Line node hello").textContent).toContain("Hello there.");
    expect(within(graph).getByLabelText("Choices node menu").textContent).toContain("Bye.");
    expect(within(graph).getByLabelText("Option Bye. port")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Auto-layout/ })).toBeTruthy();
  });

  it("clicking a node edits it in the Inspector, one undo step per change", async () => {
    const { editor } = await mount();
    const user = userEvent.setup();
    fireEvent.click(screen.getByLabelText("Choices node menu"));
    expect(within(inspector()).getByText("Choices node")).toBeTruthy();
    const text = within(inspector()).getByLabelText("Option 1 text");
    fireEvent.focus(text);
    fireEvent.change(text, { target: { value: "See you." } });
    fireEvent.blur(text);
    await user.click(within(inspector()).getByRole("switch", { name: "Option 1 once" }));
    await user.click(within(inspector()).getByRole("button", { name: /^Option$/ }));
    const menu = nodes(editor).find((n) => n.id === "menu");
    expect(menu).toMatchObject({ options: [{ id: "bye", text: "See you.", once: true }, { id: "option_1", text: "" }] });
    expect(editor.history.undoLabel).toBe("Add option");
    editor.undo();
    editor.undo();
    expect(nodes(editor).find((n) => n.id === "menu")).toMatchObject({ options: [{ text: "See you.", once: false }] });
  });

  it("a Line picks its speaker; the narrator has no animation field (D139)", async () => {
    const { editor } = await mount();
    fireEvent.click(screen.getByLabelText("Line node hello"));
    expect(within(inspector()).getByRole("combobox", { name: "Animation" })).toBeTruthy();
    act(() => void editor.apply("Narrator", (p) => ({ ...p, dialogues: p.dialogues.map((d) => ({ ...d, data: { ...d.data, nodes: d.data.nodes.map((n) => (n.id === "hello" && n.type === "line" ? { id: n.id, type: n.type, pos: n.pos, text: n.text, next: n.next } : n)) } })) })));
    expect(within(inspector()).queryByRole("combobox", { name: "Animation" })).toBe(null);
    expect(within(inspector()).getByRole("combobox", { name: "Speaker" }).textContent).toContain("Narrator");
  });

  it("Delete removes the selected node through the command registry; Start stays", async () => {
    const { editor, registry } = await mount();
    fireEvent.click(screen.getByLabelText("Line node hello"));
    expect(registry.isEnabled("edit.delete")).toBe(true);
    act(() => void registry.run("edit.delete"));
    expect(nodes(editor).map((n) => n.id)).toEqual(["start", "menu", "end"]);
    expect(nodes(editor)[0]).toMatchObject({ next: null });
    fireEvent.click(screen.getByLabelText("Start node start"));
    expect(registry.isEnabled("edit.delete")).toBe(false);
  });
});
