import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, resolveStyle, saveProject } from "@questforge/schema";
import { separatorRect } from "@questforge/engine";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { dialogueChoicesOf, setChoiceHighlight, setChoiceSeparator, setTypographySize } from "../src/model/style.ts";
import { layoutSample } from "../src/model/stylePreview.ts";
import { m1Project } from "./support/fixtures.ts";

// Styling > Dialogue Choices: the two colour commands, their undo steps, saving, and the preview's choices.

async function open() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  return { fs, editor: await Editor.open({ fs }, { autosave: false }) };
}

describe("dialogue choices commands", () => {
  it("the first edit makes the section, fills the other colour from the legacy gold and keeps the rest of the style", async () => {
    const p0 = await m1Project();
    expect(p0.game!.data.style).toBeUndefined();
    const p1 = setChoiceHighlight(setTypographySize(p0, 14), "#2040A0");
    expect(p1.game!.data.style).toEqual({ typography: { size: 14 }, dialogueChoices: { highlight: "#2040a0" } });
    expect(resolveStyle(p1.game!.data.style).dialogueChoices).toEqual({ highlight: "#2040a0", separator: "#e8d8a8" });
    expect(dialogueChoicesOf(setChoiceSeparator(p1, "#00ff00"))).toEqual({ highlight: "#2040a0", separator: "#00ff00" });
  });

  it("refuses anything that isn't a #rrggbb colour", async () => {
    const p = await m1Project();
    for (const c of ["red", "#fff", "#12345g", ""]) {
      expect(() => setChoiceHighlight(p, c)).toThrow(CommandError);
      expect(() => setChoiceSeparator(p, c)).toThrow(CommandError);
    }
  });
});

describe("dialogue choices through the editor", () => {
  it("each colour is one undo step, dragging a picker merges, and it saves to game.yaml", async () => {
    const { fs, editor } = await open();
    const saved = () => editor.project.game!.data.style?.dialogueChoices;
    editor.apply("Change choice highlight colour", (q) => setChoiceHighlight(q, "#111111"), "style:dialogueChoices:highlight");
    editor.apply("Change choice highlight colour", (q) => setChoiceHighlight(q, "#222222"), "style:dialogueChoices:highlight");
    editor.history.breakMerge();
    editor.apply("Change choice separator colour", (q) => setChoiceSeparator(q, "#333333"), "style:dialogueChoices:separator");
    expect(saved()).toEqual({ highlight: "#222222", separator: "#333333" });
    editor.undo();
    expect(saved()).toEqual({ highlight: "#222222" });
    editor.undo();
    expect(editor.project.game!.data.style).toBeUndefined();
    editor.redo();
    editor.redo();
    await editor.flush();
    expect((await loadProject(fs)).project.game!.data.style?.dialogueChoices).toEqual({ highlight: "#222222", separator: "#333333" });
  });
});

describe("preview of the choices", () => {
  const measure = (s: string) => s.length * 6;
  const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };

  it("has a prompt and 2 to 4 choice rows laid out as the engine's choice box, inside the panel", () => {
    const l = layoutSample("choices", "fit", { left: 8, right: 8, top: 8, bottom: 8 }, { size: 16 }, measure);
    const choices = l.items.flatMap((it) => (it.kind === "choices" ? [it] : []));
    expect(choices).toHaveLength(1);
    const { box, options } = choices[0]!;
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(4);
    expect(box.rows).toHaveLength(options.length);
    expect(l.items.some((it) => it.kind === "text" && it.tone === "speech")).toBe(true);
    const sep = separatorRect(box);
    expect(sep.y).toBeLessThan(box.rows[0]!.y);
    for (const r of [...box.rows, sep]) {
      expect(r.x).toBeGreaterThanOrEqual(l.inner.x);
      expect(r.x + r.w).toBeLessThanOrEqual(l.inner.x + l.inner.w);
      expect(r.y + r.h).toBeLessThanOrEqual(l.inner.y + l.inner.h);
    }
    for (const t of l.items) if (t.kind === "text") expect(t.y).toBeLessThan(sep.y);
  });

  it("grows with the typography size", () => {
    const small = layoutSample("choices", "fit", ZERO, { size: 10 }, measure);
    const big = layoutSample("choices", "fit", ZERO, { size: 20 }, measure);
    expect(big.frame.h).toBeGreaterThan(small.frame.h);
  });
});
