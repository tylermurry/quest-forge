import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, resolveStyle, saveProject } from "@questforge/schema";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { iconBarOf, setFrameImage, setFrameInsets, setIcon, setIconEffect } from "../src/model/style.ts";
import { m1Project } from "./support/fixtures.ts";

async function open() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  return { fs, editor: await Editor.open({ fs }, { autosave: false }) };
}
const bar = (e: Editor) => e.project.game!.data.style?.iconBar;

describe("icon bar commands", () => {
  it("setIcon picks one button's picture, replaces it, and clears back to the built-in icon", async () => {
    const p0 = await m1Project();
    const p1 = setIcon(setIcon(p0, "walk", "garden_bg"), "look", "palm_img");
    expect(iconBarOf(p1)).toEqual({ icons: { walk: "garden_bg", look: "palm_img" } });
    expect(iconBarOf(setIcon(p1, "walk", "palm_img"))?.icons).toEqual({ walk: "palm_img", look: "palm_img" });
    const p2 = setIcon(p1, "walk", undefined);
    expect(iconBarOf(p2)).toEqual({ icons: { look: "palm_img" } });
    // The last picture gone and nothing else set: no style at all, so the legacy look returns.
    expect(setIcon(p2, "look", undefined).game!.data.style).toBeUndefined();
  });

  it("every one of the seven buttons can be set, including the item icon", async () => {
    let p = await m1Project();
    for (const id of ["walk", "look", "hand", "talk", "item", "inventory", "settings"] as const) p = setIcon(p, id, "garden_bg");
    expect(Object.keys(iconBarOf(p)!.icons!)).toHaveLength(7);
    expect(resolveStyle(p.game!.data.style).iconBar.icons.item).toBe("garden_bg");
  });

  it("setIconEffect makes a styled bar (Brighten unless set) and keeps pictures and the frame", async () => {
    const p0 = await m1Project();
    expect(resolveStyle(p0.game!.data.style).iconBar.effect).toBe("none");
    const p1 = setIconEffect(setIcon(setFrameImage(p0, "iconBar", "palm_img"), "walk", "garden_bg"), "darken");
    expect(iconBarOf(p1)).toEqual({ frame: { image: "palm_img" }, icons: { walk: "garden_bg" }, effect: "darken" });
    expect(resolveStyle(setIcon(p0, "walk", "garden_bg").game!.data.style).iconBar.effect).toBe("brighten");
  });

  it("refuses an image that isn't in the library and an effect that isn't Brighten or Darken", async () => {
    const p0 = await m1Project();
    expect(() => setIcon(p0, "walk", "nope")).toThrow(CommandError);
    expect(() => setIconEffect(p0, "none" as never)).toThrow(CommandError);
  });

  it("leaves the shared frame and the bar's frame borders alone", async () => {
    const p0 = setFrameInsets(setFrameImage(setFrameImage(await m1Project(), "sharedFrame", "garden_bg"), "iconBar", "palm_img"), "iconBar", { left: 2, right: 2, top: 2, bottom: 2 });
    const p1 = setIconEffect(setIcon(p0, "talk", "garden_bg"), "darken");
    expect(p1.game!.data.style!.sharedFrame).toEqual({ image: "garden_bg" });
    expect(iconBarOf(p1)?.frame).toEqual({ image: "palm_img", insets: { left: 2, right: 2, top: 2, bottom: 2 } });
  });
});

describe("history and saving", () => {
  it("each pick and each effect change is one undo step", async () => {
    const { editor } = await open();
    editor.apply("Pick walk icon", (p) => setIcon(p, "walk", "garden_bg"));
    editor.apply("Pick look icon", (p) => setIcon(p, "look", "palm_img"));
    editor.apply("Change hover and active effect", (p) => setIconEffect(p, "darken"));
    expect(bar(editor)).toEqual({ icons: { walk: "garden_bg", look: "palm_img" }, effect: "darken" });
    editor.undo();
    expect(bar(editor)).toEqual({ icons: { walk: "garden_bg", look: "palm_img" } });
    editor.undo();
    expect(bar(editor)).toEqual({ icons: { walk: "garden_bg" } });
    editor.redo();
    expect(bar(editor)?.icons).toEqual({ walk: "garden_bg", look: "palm_img" });
  });

  it("persists the frame, pictures and effect across save and reopen, and clearing one keeps the image in the library", async () => {
    const { fs, editor } = await open();
    editor.apply("Frame", (p) => setFrameImage(p, "iconBar", "palm_img"));
    editor.apply("Borders", (p) => setFrameInsets(p, "iconBar", { left: 3, right: 3, top: 4, bottom: 4 }));
    editor.apply("Icon", (p) => setIcon(p, "settings", "garden_bg"));
    editor.apply("Effect", (p) => setIconEffect(p, "darken"));
    await editor.flush();
    const reopened = await Editor.open({ fs }, { autosave: false });
    expect(resolveStyle(reopened.project.game!.data.style).iconBar).toEqual({
      frame: { image: "palm_img", insets: { left: 3, right: 3, top: 4, bottom: 4 }, scale: 16 },
      icons: { settings: "garden_bg" },
      effect: "darken",
    });
    reopened.apply("Clear", (p) => setIcon(p, "settings", undefined));
    await reopened.flush();
    const again = (await loadProject(fs)).project;
    expect(again.game!.data.style?.iconBar?.icons).toBeUndefined();
    expect(again.assets!.data.images.some((i) => i.id === "garden_bg")).toBe(true);
  });
});
