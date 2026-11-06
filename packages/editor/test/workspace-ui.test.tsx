// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject, type SceneFile } from "@questforge/schema";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { PlatformContext } from "../src/ui/hooks.ts";
import { m1Project } from "./support/fixtures.ts";

afterEach(cleanup);

async function mount() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  const platform = { assetUrl: (_r: string, p: string) => p } as unknown as Platform;
  render(
    <PlatformContext.Provider value={platform}>
      <Workspace root="m1" editor={editor} onClose={() => {}} />
    </PlatformContext.Provider>,
  );
  return editor;
}

const garden = (ed: Editor) => ed.project.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;

describe("workspace (D89)", () => {
  it("opens a scene outline; deleting a hotspot with rules is undone by Cmd+Z (spec 08 acceptance)", async () => {
    const ed = await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    expect(screen.getByRole("tab", { name: "Garden" })).toBeTruthy();
    const hotspot = garden(ed).hotspots.find((h) => h.rules.length > 0)!;
    const hotspots = screen.getByRole("region", { name: "Hotspots" });
    const row = within(hotspots).getByRole("listitem", { name: `Hotspots: ${hotspot.name} (${hotspot.id})` });
    expect(row.textContent).toContain(`${hotspot.rules.length} rule`);
    fireEvent.click(within(row).getByRole("button", { name: /^Delete/ }));
    expect(garden(ed).hotspots.map((h) => h.id)).not.toContain(hotspot.id);
    expect(within(screen.getByRole("region", { name: "Hotspots" })).queryByRole("listitem", { name: `Hotspots: ${hotspot.name} (${hotspot.id})` })).toBeNull();

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(garden(ed).hotspots.find((h) => h.id === hotspot.id)).toEqual(hotspot);
    expect(within(screen.getByRole("region", { name: "Hotspots" })).getByRole("listitem", { name: `Hotspots: ${hotspot.name} (${hotspot.id})` })).toBeTruthy();
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(garden(ed).hotspots.map((h) => h.id)).not.toContain(hotspot.id);
  });

  it("deleting a referenced object asks first", async () => {
    const ed = await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    const objects = screen.getByRole("region", { name: "Objects" });
    fireEvent.click(within(objects).getByRole("button", { name: /^Delete .*boulder/ }));
    expect(screen.getByRole("dialog").textContent).toContain("Used by");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(garden(ed).objects.some((o) => o.id === "boulder")).toBe(true);
  });

  it("the inspector shows what uses the selection", async () => {
    await mount();
    fireEvent.click(screen.getByRole("treeitem", { name: "item stick" }).firstElementChild!);
    const inspector = screen.getByLabelText("Inspector");
    expect(inspector.textContent).toContain("Used by 2 rules in 1 scene and the game settings");
  });

  it("the Problems list jumps to the entry", async () => {
    const ed = await mount();
    ed.apply("Delete item", (p) => ({ ...p, items: p.items.filter((i) => i.data.id !== "stick") }));
    const list = await screen.findByRole("list", { name: "Problems" });
    const first = within(list).getAllByRole("button").find((b) => !b.hasAttribute("disabled") && b.textContent?.includes("Garden"))!;
    fireEvent.click(first);
    expect(screen.getByRole("tab", { name: "Garden" }).getAttribute("aria-selected")).toBe("true");
  });

  it("item details edit as one undo step per field", async () => {
    const ed = await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "item stick" }).firstElementChild!);
    const box = screen.getByLabelText("Description");
    fireEvent.focus(box);
    for (const v of ["A", "A s", "A stick."]) fireEvent.change(box, { target: { value: v } });
    fireEvent.blur(box);
    expect(ed.project.items.find((i) => i.data.id === "stick")?.data.description).toBe("A stick.");
    ed.undo();
    expect(ed.project.items.find((i) => i.data.id === "stick")?.data.description).not.toBe("A");
  });
});
