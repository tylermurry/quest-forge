import { describe, expect, it } from "vitest";
import { MemoryFs, loadProject, resolveStyle, saveProject, type FrameInsets } from "@questforge/schema";
import { separatorRect, type Measure } from "@questforge/engine";
import { CommandError } from "../src/model/commands.ts";
import { Editor } from "../src/model/editor.ts";
import { dialogueChoicesOf, setChoiceEffect, setChoiceSeparator, setTypographySize } from "../src/model/style.ts";
import { layoutSample, type PanelSampleId } from "../src/model/stylePreview.ts";
import { m1Project } from "./support/fixtures.ts";

/** Lays a sample out with its borders drawn at their own size and narration where a new project puts it. */
const lay = (sample: PanelSampleId, i: FrameInsets, text: { size: number }, measure: Measure) =>
  layoutSample(sample, { insets: i, scale: Math.max(i.left, i.right, i.top, i.bottom) || 16 }, { top: 50, width: 60 }, text, measure);


// Styling > Dialogue Choices: the effect and separator commands, their undo steps, saving, and the preview's choices.

async function open() {
  const fs = new MemoryFs();
  await saveProject(fs, { ...(await m1Project()), saved: {}, files: [], savedFolders: [] });
  return { fs, editor: await Editor.open({ fs }, { autosave: false }) };
}

describe("dialogue choices commands", () => {
  it("the first edit makes the section, fills the separator from the legacy color and keeps the rest of the style", async () => {
    const p0 = await m1Project();
    expect(p0.game!.data.style).toBeUndefined();
    const p1 = setChoiceEffect(setTypographySize(p0, 14), "darken");
    expect(p1.game!.data.style).toEqual({ typography: { size: 14 }, dialogueChoices: { effect: "darken" } });
    expect(resolveStyle(p1.game!.data.style).dialogueChoices).toEqual({ effect: "darken", separator: "#e8d8a8" });
    expect(dialogueChoicesOf(setChoiceSeparator(p1, "#00FF00"))).toEqual({ effect: "darken", separator: "#00ff00" });
  });

  it("refuses an effect other than Brighten or Darken, and a separator that isn't a #rrggbb color", async () => {
    const p = await m1Project();
    expect(() => setChoiceEffect(p, "glow" as "brighten")).toThrow(CommandError);
    for (const c of ["red", "#fff", "#12345g", ""]) expect(() => setChoiceSeparator(p, c)).toThrow(CommandError);
  });
});

describe("dialogue choices through the editor", () => {
  it("each change is one undo step, dragging a picker merges, and it saves to game.yaml", async () => {
    const { fs, editor } = await open();
    const saved = () => editor.project.game!.data.style?.dialogueChoices;
    editor.apply("Set choice hover effect to Darken", (q) => setChoiceEffect(q, "darken"));
    editor.apply("Change choice separator color", (q) => setChoiceSeparator(q, "#111111"), "style:dialogueChoices:separator");
    editor.apply("Change choice separator color", (q) => setChoiceSeparator(q, "#333333"), "style:dialogueChoices:separator");
    expect(saved()).toEqual({ effect: "darken", separator: "#333333" });
    editor.undo();
    expect(saved()).toEqual({ effect: "darken" });
    editor.undo();
    expect(editor.project.game!.data.style).toBeUndefined();
    editor.redo();
    editor.redo();
    await editor.flush();
    expect((await loadProject(fs)).project.game!.data.style?.dialogueChoices).toEqual({ effect: "darken", separator: "#333333" });
  });
});

describe("preview of the choices", () => {
  const measure = (s: string) => s.length * 6;
  const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };

  it("has a prompt and 2 to 4 choice rows laid out as the engine's choice box, inside the panel", () => {
    const l = lay("choices", { left: 8, right: 8, top: 8, bottom: 8 }, { size: 16 }, measure);
    const choices = l.items.flatMap((it) => (it.kind === "choices" ? [it] : []));
    expect(choices).toHaveLength(1);
    const { box, options } = choices[0]!;
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(4);
    expect(box.rows).toHaveLength(options.length);
    expect(l.items.some((it) => it.kind === "text" && it.tone === "speaker")).toBe(true);
    const sep = separatorRect(box);
    expect(sep.y).toBeLessThan(box.rows[0]!.y);
    for (const r of [...box.rows, sep]) {
      expect(r.x).toBeGreaterThanOrEqual(l.inner.x);
      expect(r.x + r.w).toBeLessThanOrEqual(l.inner.x + l.inner.w);
      expect(r.y + r.h).toBeLessThanOrEqual(l.inner.y + l.inner.h);
    }
    for (const t of l.items) if (t.kind === "text") expect(t.y).toBeLessThan(sep.y);
  });

  it("puts the separator 8 pixels above and below, only when Dialogue Choices is configured, and pads each row", () => {
    const at = (styled: boolean) => {
      const l = layoutSample("choices", { insets: ZERO, scale: 16 }, { top: 50, width: 60 }, { size: 16 }, measure, styled);
      return l.items.flatMap((it) => (it.kind === "choices" ? [it.box] : []))[0]!;
    };
    const styled = at(true);
    expect(styled.rows[0]!.y - styled.panel.y).toBe(18);
    expect(at(false).rows[0]!.y - at(false).panel.y).toBe(8);
    expect(styled.rows[0]!.h).toBe(19 + 12);
  });

  it("spaces the name, the words and the separator line evenly", () => {
    const l = layoutSample("choices", { insets: ZERO, scale: 16 }, { top: 50, width: 60 }, { size: 16 }, measure, true);
    const [name, words] = l.items.filter((it) => it.kind === "text");
    const box = l.items.flatMap((it) => (it.kind === "choices" ? [it.box] : []))[0]!;
    const line = 19;
    const nameToWords = words!.y - (name!.y + line);
    const wordsToLine = separatorRect(box).y - (words!.y + line);
    expect(nameToWords).toBe(8);
    expect(wordsToLine).toBe(nameToWords);
  });

  it("grows with the typography size", () => {
    const small = lay("choices", ZERO, { size: 10 }, measure);
    const big = lay("choices", ZERO, { size: 20 }, measure);
    expect(big.frame.h).toBeGreaterThan(small.frame.h);
  });
});
