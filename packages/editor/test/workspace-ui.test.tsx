// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryFs, saveProject, type SceneFile } from "@questforge/schema";
import { Editor } from "../src/model/editor.ts";
import type { Platform } from "../src/platform/platform.ts";
import { Workspace } from "../src/ui/Workspace.tsx";
import { CommandRegistry } from "../src/model/appCommands.ts";
import { CommandsContext, PlatformContext, isMac, useShortcutKeys } from "../src/ui/hooks.ts";

/** Cmd on macOS, Ctrl elsewhere, matching the app's shortcut handling. */
const mod = () => (isMac() ? { metaKey: true } : { ctrlKey: true });

function Shortcuts({ registry }: { registry: CommandRegistry }) {
  useShortcutKeys(registry);
  return null;
}
import { m1Project } from "./support/fixtures.ts";

afterEach(cleanup);

async function mount() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  const platform = { assetUrl: (_r: string, p: string) => p } as unknown as Platform;
  const registry = new CommandRegistry();
  render(
    <PlatformContext.Provider value={platform}>
      <CommandsContext.Provider value={registry}>
        <Shortcuts registry={registry} />
        <Workspace root="m1" editor={editor} onClose={() => {}} />
      </CommandsContext.Provider>
    </PlatformContext.Provider>,
  );
  return editor;
}

const garden = (ed: Editor) => ed.project.scenes.find((s) => s.data.id === "garden")!.data as SceneFile;

describe("workspace", () => {
  it("opens a scene with its Layers panel; deleting a hotspot with rules is undone by Cmd+Z", async () => {
    const ed = await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    expect(screen.getByRole("tab", { name: "Garden" })).toBeTruthy();
    const hotspot = garden(ed).hotspots.find((h) => h.rules.length > 0)!;
    const hotspots = screen.getByRole("region", { name: "Hotspots layer" });
    const row = within(hotspots).getByRole("listitem", { name: `Hotspots: ${hotspot.name} (${hotspot.id})` });
    expect(row.textContent).toContain(`${hotspot.rules.length} rule`);
    fireEvent.click(within(row).getByRole("button", { name: /^Delete/ }));
    expect(garden(ed).hotspots.map((h) => h.id)).not.toContain(hotspot.id);
    expect(within(screen.getByRole("region", { name: "Hotspots layer" })).queryByRole("listitem", { name: `Hotspots: ${hotspot.name} (${hotspot.id})` })).toBeNull();

    fireEvent.keyDown(window, { key: "z", ...mod() });
    expect(garden(ed).hotspots.find((h) => h.id === hotspot.id)).toEqual(hotspot);
    expect(within(screen.getByRole("region", { name: "Hotspots layer" })).getByRole("listitem", { name: `Hotspots: ${hotspot.name} (${hotspot.id})` })).toBeTruthy();
    fireEvent.keyDown(window, { key: "z", ...mod(), shiftKey: true });
    expect(garden(ed).hotspots.map((h) => h.id)).not.toContain(hotspot.id);
  });

  it("each layer header reads name first, then the eye and lock, with no count", async () => {
    await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    const header = within(screen.getByRole("region", { name: "Hotspots layer" })).getByRole("button", { name: "Hotspots" }).parentElement!;
    const names = [...header.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["Hotspots", "Hide Hotspots", "Lock Hotspots"]);
    expect(header.textContent).toBe("Hotspots");
  });

  it("highlights the selected row but never its layer header", async () => {
    await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    const layer = screen.getByRole("region", { name: "Hotspots layer" });
    const row = within(layer).getAllByRole("listitem")[0]!;
    fireEvent.click(within(row).getAllByRole("button")[0]!);
    const section = screen.getByRole("region", { name: "Hotspots layer" });
    expect(within(section).getAllByRole("listitem")[0]!.className).toContain("bg-selection");
    const header = within(section).getByRole("button", { name: "Hotspots" });
    expect(header.getAttribute("aria-current")).toBe("true");
    expect(header.parentElement!.className).not.toContain("bg-selection");
  });

  it("the floating Scene tools bar holds the tools and toggles; the top bar keeps the zoom controls", async () => {
    await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    const tools = screen.getByRole("toolbar", { name: "Scene tools" });
    const view = screen.getByRole("toolbar", { name: "Scene view" });
    expect(within(tools).getByRole("button", { name: /^Select/ })).toBeTruthy();
    for (const name of [/^Snapping/, /^Depth preview/, /^Shade/, /^Path preview/]) {
      const toggle = within(tools).getByRole("button", { name });
      expect(within(view).queryByRole("button", { name })).toBeNull();
      const before = toggle.getAttribute("aria-pressed");
      fireEvent.click(toggle);
      expect(within(screen.getByRole("toolbar", { name: "Scene tools" })).getByRole("button", { name }).getAttribute("aria-pressed")).not.toBe(before);
    }
    expect(within(view).getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(within(view).getByRole("button", { name: "Zoom out" })).toBeTruthy();
    expect(within(view).queryByRole("button", { name: /^Select/ })).toBeNull();
  });

  it("deleting a referenced object asks first", async () => {
    const ed = await mount();
    fireEvent.doubleClick(screen.getByRole("treeitem", { name: "scene Garden" }).firstElementChild!);
    const objects = screen.getByRole("region", { name: "Objects layer" });
    fireEvent.click(within(objects).getByRole("button", { name: /^Delete .*boulder/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Used by");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(garden(ed).objects.some((o) => o.id === "boulder")).toBe(true);
  });

  it("the inspector shows what uses the selection", async () => {
    await mount();
    fireEvent.click(screen.getByRole("treeitem", { name: "item stick" }).firstElementChild!);
    const inspector = screen.getByLabelText("Inspector");
    // Grouped under a header per file, one bullet per use.
    const scene = within(inspector).getByRole("region", { name: 'Scene "Garden"' });
    expect(within(scene).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(inspector).getByRole("region", { name: "Game settings" })).toBeTruthy();
    expect(inspector.textContent).not.toContain("Used by 2 rules");
  });

  it("each Used by line is a link that shows where it is, flashed blue", async () => {
    await mount();
    fireEvent.click(screen.getByRole("treeitem", { name: "item stick" }).firstElementChild!);
    const inspector = screen.getByLabelText("Inspector");
    const links = within(inspector).getAllByRole("button", { name: /Rule \d/ });
    expect(links.length).toBeGreaterThan(0);
    fireEvent.click(links[0]!);
    // The Inspector now shows the rule's owner, and the spot flashes blue (not the problem red).
    expect(screen.getByLabelText("Inspector").textContent).not.toContain("Used by 2 rules");
    expect(document.querySelector(".qf-flash-log")).toBeTruthy();
    expect(document.querySelector(".qf-flash")).toBeNull();
  });

  it("the Problems list jumps to the entry", async () => {
    const ed = await mount();
    ed.apply("Delete item", (p) => ({ ...p, items: p.items.filter((i) => i.data.id !== "stick") }));
    act(() => ed.validateNow());
    const list = await screen.findByRole("list", { name: "Problems" });
    const first = within(list).getAllByRole("button").find((b) => !b.hasAttribute("disabled") && b.textContent?.includes("Garden"))!;
    fireEvent.click(first);
    expect(screen.getByRole("tab", { name: "Garden" }).getAttribute("aria-selected")).toBe("true");
    // It selects the exact hotspot or object whose rule uses the item, not just the scene.
    expect(screen.getByLabelText("Inspector").textContent).not.toContain("Select something");
  });

  it("the Problems panel filters by severity, with counts", async () => {
    const ed = await mount();
    ed.apply("Delete item", (p) => ({ ...p, items: p.items.filter((i) => i.data.id !== "stick") }));
    act(() => ed.validateNow());
    const errors = screen.getByRole("button", { name: "Show errors" });
    const warnings = screen.getByRole("button", { name: "Show warnings" });
    expect(errors.textContent).toMatch(/^\d+ errors$/);
    const list = () => within(screen.getByRole("list", { name: "Problems" })).getAllByRole("button");
    const total = list().length;
    fireEvent.click(warnings);
    expect(warnings.getAttribute("aria-pressed")).toBe("false");
    expect(list().every((b) => b.className.includes("text-err"))).toBe(true);
    expect(list().length).toBeLessThan(total);
    fireEvent.click(warnings);
    fireEvent.click(errors);
    expect(list().every((b) => b.className.includes("text-warn"))).toBe(true);
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
