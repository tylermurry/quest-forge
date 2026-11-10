// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DialogueFile, MemoryFs, saveProject } from "@questforge/schema";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { addNode } from "../src/model/dialogue/commands.ts";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { CommandsContext, PlatformContext } from "../src/ui/hooks.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { m1Project } from "./support/fixtures.ts";

// The dialogue tab: the graph shows the file's nodes, clicking one edits it
// in the Inspector with the rule inspector's controls, and Delete runs through the registry.

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

describe("dialogue graph tab", () => {
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
    expect(menu).toMatchObject({
      options: [
        { id: "bye", text: "See you.", once: true },
        { id: "option_1", text: "" },
      ],
    });
    expect(editor.history.undoLabel).toBe("Add option");
    editor.undo();
    editor.undo();
    expect(nodes(editor).find((n) => n.id === "menu")).toMatchObject({ options: [{ text: "See you.", once: false }] });
  });

  it("selecting a node from the keyboard opens it in the Inspector like a click", async () => {
    await mount();
    const card = screen.getByLabelText("Choices node menu");
    const node = card.closest(".react-flow__node") as HTMLElement;
    expect(node.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(node, { key: "Enter", code: "Enter" });
    expect(within(inspector()).getByText("Choices node")).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Line node hello").closest(".react-flow__node")!, { key: " ", code: "Space" });
    expect(within(inspector()).getByText("Line node")).toBeTruthy();
  });

  it("a Line picks its speaker; the narrator has no animation field", async () => {
    const { editor } = await mount();
    fireEvent.click(screen.getByLabelText("Line node hello"));
    expect(within(inspector()).getByRole("combobox", { name: "Animation" })).toBeTruthy();
    act(
      () =>
        void editor.apply("Narrator", (p) => ({
          ...p,
          dialogues: p.dialogues.map((d) => ({
            ...d,
            data: {
              ...d.data,
              nodes: d.data.nodes.map((n) => (n.id === "hello" && n.type === "line" ? { id: n.id, type: n.type, pos: n.pos, text: n.text, next: n.next } : n)),
            },
          })),
        })),
    );
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

  // Drives a "Goes to" picker with the keyboard alone: focus it, open it, type to search, Enter to pick.
  async function goesTo(user: ReturnType<typeof userEvent.setup>, name: string, search: string) {
    const box = within(inspector()).getByRole("combobox", { name });
    act(() => box.focus());
    await user.keyboard("{Enter}");
    await user.keyboard(search);
    await user.keyboard("{Enter}");
  }
  const portOf = (ed: Editor, id: string) => nodes(ed).find((n) => n.id === id) as never as Record<string, unknown>;

  it("Goes to connects, changes and clears a Line's next port from the keyboard, one undo step each", async () => {
    const { editor } = await mount();
    const user = userEvent.setup();
    fireEvent.click(screen.getByLabelText("Line node hello"));
    expect(within(inspector()).getByRole("combobox", { name: "Next goes to" }).textContent).toContain("Choices menu");
    await goesTo(user, "Next goes to", "Nothing");
    expect(portOf(editor, "hello").next).toBe(null);
    expect(editor.history.undoLabel).toBe("Disconnect");
    await goesTo(user, "Next goes to", "End end");
    expect(portOf(editor, "hello").next).toBe("end");
    expect(editor.history.undoLabel).toBe("Connect");
    await goesTo(user, "Next goes to", "Choices menu");
    expect(portOf(editor, "hello").next).toBe("menu");
    editor.undo();
    expect(portOf(editor, "hello").next).toBe("end");
    editor.undo();
    expect(portOf(editor, "hello").next).toBe(null);
    editor.undo();
    expect(portOf(editor, "hello").next).toBe("menu");
  });

  it("Goes to lists other nodes only: not this node, not Start", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Line node hello"));
    const user = userEvent.setup();
    act(() => within(inspector()).getByRole("combobox", { name: "Next goes to" }).focus());
    await user.keyboard("{Enter}");
    const items = screen.getAllByRole("option").map((o) => o.textContent);
    expect(items).toContain("Choices menu");
    expect(items.some((t) => t?.includes("Line hello"))).toBe(false);
    expect(items.some((t) => t?.startsWith("Start"))).toBe(false);
  });

  it("Goes to creates a new node from a choice's port, to the right, connected, in one undo step", async () => {
    const { editor } = await mount();
    const user = userEvent.setup();
    fireEvent.click(screen.getByLabelText("Choices node menu"));
    await goesTo(user, "Option 1: Bye. goes to", "New line node");
    const menu = portOf(editor, "menu") as { pos: number[]; options: { next: string }[] };
    expect(menu.options[0]!.next).toBe("line_1");
    expect(nodes(editor).find((n) => n.id === "line_1")).toMatchObject({ type: "line", pos: [900, 0], next: null });
    expect(editor.history.undoLabel).toBe("Add Line node");
    editor.undo();
    expect(nodes(editor).some((n) => n.id === "line_1")).toBe(false);
    expect(portOf(editor, "menu")).toMatchObject({ options: [{ next: "end" }] });
  });

  it("Goes to connects and clears a choice's port", async () => {
    const { editor } = await mount();
    const user = userEvent.setup();
    fireEvent.click(screen.getByLabelText("Choices node menu"));
    await goesTo(user, "Option 1: Bye. goes to", "Line hello");
    expect(portOf(editor, "menu")).toMatchObject({ options: [{ next: "hello" }] });
    await goesTo(user, "Option 1: Bye. goes to", "Nothing");
    expect(portOf(editor, "menu")).toMatchObject({ options: [{ next: null }] });
  });

  it("Goes to wires both ports of a Branch, and a new node from the else port", async () => {
    const { editor } = await mount();
    const user = userEvent.setup();
    act(() => void editor.applyWith("Add branch", (p) => addNode(p, "chat", "branch", [300, 300])));
    const id = nodes(editor).find((n) => n.type === "branch")!.id;
    fireEvent.click(screen.getByLabelText(`Branch node ${id}`));
    await goesTo(user, "If true goes to", "End end");
    expect(portOf(editor, id).then).toBe("end");
    expect(editor.history.undoLabel).toBe("Connect");
    await goesTo(user, "If false goes to", "New end node");
    expect(portOf(editor, id).else).toBe("end_1");
    expect(nodes(editor).find((n) => n.id === "end_1")).toMatchObject({ type: "end", pos: [600, 440] });
    await goesTo(user, "If true goes to", "Nothing");
    expect(portOf(editor, id).then).toBe(null);
    expect(portOf(editor, id).else).toBe("end_1");
  });

  it("an End node has no Goes to fields", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("End node end"));
    expect(within(inspector()).queryByText("Goes to")).toBe(null);
  });
});
