// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject } from "@questforge/schema";
import { Actions } from "../src/model/actions.ts";
import { sectionEntries } from "../src/model/browser.ts";
import { Editor } from "../src/model/editor.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { ProjectBrowser } from "../src/ui/ProjectBrowser.tsx";
import { useEditor } from "../src/ui/hooks.ts";
import { useSyncExternalStore } from "react";
import { m1Project } from "./support/fixtures.ts";

afterEach(cleanup);

function Harness({ actions }: { actions: Actions }) {
  useEditor(actions.editor);
  useSyncExternalStore(actions.ws.subscribe, () => actions.ws.version);
  return <ProjectBrowser actions={actions} />;
}

async function mount() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const actions = new Actions(await Editor.open({ fs }), new WorkspaceState());
  render(<Harness actions={actions} />);
  return actions;
}

/** A DataTransfer stand-in jsdom lacks. */
function dataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (t: string, v: string) => data.set(t, v),
    getData: (t: string) => data.get(t) ?? "",
    get types() {
      return [...data.keys()];
    },
    files: [] as File[],
    effectAllowed: "move",
  };
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

  it("drags a scene onto a folder", async () => {
    const a = await mount();
    act(() => void a.newFolder("scene", ""));
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!, { dataTransfer: dt });
    const folder = screen.getByRole("treeitem", { name: "Folder New folder" }).firstElementChild!;
    fireEvent.dragOver(folder, { dataTransfer: dt });
    fireEvent.drop(folder, { dataTransfer: dt });
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
