// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { Actions } from "../src/model/actions.ts";
import { SECTIONS, sectionEntries } from "../src/model/browser.ts";
import { Editor } from "../src/model/editor.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { ProjectBrowser } from "../src/ui/ProjectBrowser.tsx";
import { useEditor } from "../src/ui/hooks.ts";
import { useSyncExternalStore } from "react";
import { DndContext, PointerSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { m1Project } from "./support/fixtures.ts";

afterEach(cleanup);

function Harness({ actions }: { actions: Actions }) {
  useEditor(actions.editor);
  useSyncExternalStore(actions.ws.subscribe, () => actions.ws.version);
  // The Workspace owns the drag context (rows also drop on scene canvases).
  return (
    <DndContext sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))} collisionDetection={pointerWithin}>
      <ProjectBrowser actions={actions} />
    </DndContext>
  );
}

async function mount() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const actions = new Actions(await Editor.open({ fs }), new WorkspaceState());
  render(<Harness actions={actions} />);
  return actions;
}

/** jsdom has no layout: give a row a box so dnd-kit can hit-test the pointer against it. */
function placeAt(el: Element, top: number) {
  const rect = { x: 0, y: top, top, left: 0, right: 200, bottom: top + 20, width: 200, height: 20, toJSON() {} };
  Object.defineProperty(el, "getBoundingClientRect", { value: () => rect, configurable: true });
}

/** Presses on one row, moves past the 4 px threshold, and releases over another. */
async function dragRow(from: Element, to: Element) {
  placeAt(from, 0);
  placeAt(to, 100);
  const opts = (y: number) => ({ bubbles: true, isPrimary: true, button: 0, buttons: 1, pointerId: 1, clientX: 10, clientY: y });
  await act(async () => void from.dispatchEvent(new PointerEvent("pointerdown", opts(10))));
  await act(async () => void document.dispatchEvent(new PointerEvent("pointermove", opts(20))));
  await act(async () => void document.dispatchEvent(new PointerEvent("pointermove", opts(110))));
  await act(async () => void document.dispatchEvent(new PointerEvent("pointerup", opts(110))));
}

describe("project browser UI", () => {
  it("shows the seven sections with counts", async () => {
    await mount();
    const tree = screen.getByRole("tree", { name: "Project" });
    expect(within(tree).getByRole("treeitem", { name: "Scenes" }).textContent).toContain("3");
    expect(within(tree).getByRole("treeitem", { name: "scene Garden" })).toBeTruthy();
  });

  it("creates a folder from the section menu and renames it inline", async () => {
    const a = await mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Actions for Scenes" }));
    await user.click(screen.getByRole("menuitem", { name: "New folder" }));
    expect(screen.getByRole("treeitem", { name: "Folder New folder" })).toBeTruthy();
    // A new folder starts in rename mode.
    let box = screen.getByLabelText("Folder name");
    expect(document.activeElement).toBe(box);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Actions for folder New folder" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename folder" }));
    box = screen.getByLabelText("Folder name");
    expect(document.activeElement).toBe(box);
    await user.clear(box);
    await user.type(box, "act1{Enter}");
    expect(screen.getByRole("treeitem", { name: "Folder act1" })).toBeTruthy();
    expect(a.editor.project.folders).toContain("scenes/act1");
  });

  it("drags a scene onto a folder (dnd-kit)", async () => {
    const a = await mount();
    act(() => void a.newFolder("scene", ""));
    await dragRow(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!, screen.getByRole("treeitem", { name: "Folder New folder" }).firstElementChild!);
    expect(sectionEntries(a.editor.project, "scene").find((e) => e.id === "garden")?.folder).toBe("New folder");
  });

  it("delete warns with the references and can be cancelled", async () => {
    const a = await mount();
    const user = userEvent.setup();
    const row = () => screen.getByRole("treeitem", { name: "item stick" }).firstElementChild!;
    await user.pointer({ keys: "[MouseRight]", target: row() });
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Used by 2 rules in 1 scene and the game settings.");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(a.editor.project.items.some((i) => i.data.id === "stick")).toBe(true);

    await user.pointer({ keys: "[MouseRight]", target: row() });
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete anyway" }));
    expect(a.editor.project.items.some((i) => i.data.id === "stick")).toBe(false);
    a.editor.validateNow();
    expect(a.editor.problems.filter((p) => p.code === "missing_reference")).toHaveLength(3);
  });

  it("Change ID shows how many references it updates", async () => {
    const a = await mount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Actions for item stick" }));
    await user.click(screen.getByRole("menuitem", { name: "Change ID…" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Also updates 3 references to it.");
    const input = within(dialog).getByLabelText("New ID");
    await user.clear(input);
    await user.type(input, "branch");
    await user.click(within(dialog).getByRole("button", { name: "Change ID" }));
    expect(a.editor.project.items.some((i) => i.data.id === "branch")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("search filters across sections", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "garden" } });
    const tree = screen.getByRole("tree");
    expect(within(tree).queryByRole("treeitem", { name: "Items" })).toBeNull();
    expect(within(tree).getByRole("treeitem", { name: "scene Garden" })).toBeTruthy();
    expect(within(tree).getByRole("treeitem", { name: "image garden_bg" })).toBeTruthy();
  });
});

describe("dragging across sections", () => {
  it("ignores a drop on another section", async () => {
    const a = await mount();
    await dragRow(screen.getByRole("treeitem", { name: "item stick" }).firstElementChild!, screen.getByRole("treeitem", { name: "Scenes" }).firstElementChild!);
    expect(a.editor.history.canUndo).toBe(false);
  });

  it("lists an imported font under Fonts", async () => {
    const a = await mount();
    expect(screen.getByRole("treeitem", { name: "Fonts" }).textContent).toContain("0");
    await act(async () => void a.importFiles("font", "", [{ name: "hand.woff2", bytes: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1]) }]));
    expect(screen.getByRole("treeitem", { name: "Fonts" }).textContent).toContain("1");
    expect(screen.getByRole("treeitem", { name: "font hand" })).toBeTruthy();
  });

  it("each top-level section header shows a decorative icon", async () => {
    await mount();
    for (const { title } of SECTIONS) {
      const icon = screen.getByRole("treeitem", { name: title }).querySelector("svg:not(button svg)");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.parentElement?.textContent).toContain(title);
    }
  });
});
