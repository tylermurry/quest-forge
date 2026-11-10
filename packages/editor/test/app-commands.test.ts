import { describe, expect, it, vi } from "vitest";
import { COMMANDS, CommandRegistry, accelerator, commandForKey, isPlainShortcut, matchesShortcut, type CommandSpec } from "../src/model/appCommands.ts";

const key = (k: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key: k,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe("app commands", () => {
  it("matches Mod shortcuts as Cmd on macOS and Ctrl elsewhere", () => {
    expect(matchesShortcut("Mod+Z", key("z", { meta: true }), true)).toBe(true);
    expect(matchesShortcut("Mod+Z", key("z", { ctrl: true }), true)).toBe(false);
    expect(matchesShortcut("Mod+Z", key("z", { ctrl: true }), false)).toBe(true);
    expect(matchesShortcut("Mod+Shift+Z", key("Z", { meta: true, shift: true }), true)).toBe(true);
    expect(matchesShortcut("Mod+Z", key("z", { meta: true, shift: true }), true)).toBe(false);
  });

  it("leaves undo to a focused text field, but not other commands", () => {
    expect(commandForKey(key("z", { meta: true }), true, false)).toBe("edit.undo");
    expect(commandForKey(key("z", { meta: true }), true, true)).toBeNull();
    expect(commandForKey(key("1", { meta: true }), true, true)).toBe("view.browser");
    expect(commandForKey(key("y", { ctrl: true }), false, false)).toBe("edit.redo");
    expect(commandForKey(key("q"), true, false)).toBeNull();
  });

  it("runs only registered, enabled handlers and unregisters exactly its own", () => {
    const r = new CommandRegistry();
    const undo = vi.fn();
    let can = false;
    const off = r.register({ "edit.undo": { run: undo, enabled: () => can, label: () => "Undo Move scene" } });
    expect(r.run("edit.undo")).toBe(false);
    can = true;
    expect(r.run("edit.undo")).toBe(true);
    expect(undo).toHaveBeenCalledOnce();
    expect(r.label("edit.undo")).toBe("Undo Move scene");
    expect(r.label("edit.redo")).toBe("Redo");
    const replacement = vi.fn();
    r.register({ "edit.undo": { run: replacement } });
    off(); // the old registration must not remove the new one
    expect(r.run("edit.undo")).toBe(true);
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("gives every command a unique shortcut and a Tauri accelerator", () => {
    const shortcuts = (COMMANDS as readonly CommandSpec[]).flatMap((c) => (c.shortcut ? [c.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(accelerator("Mod+Shift+Z")).toBe("CmdOrCtrl+Shift+Z");
    expect(accelerator("Mod+=")).toBe("CmdOrCtrl+Equal");
  });

  it("runs plain shortcuts (tools, Delete) outside text fields only, in both hosts", () => {
    expect(commandForKey(key("p"), true, false)).toBe("scene.tool.polygon");
    expect(commandForKey(key("p"), true, true)).toBeNull();
    expect(commandForKey(key("Backspace"), true, false)).toBe("edit.delete");
    expect(commandForKey(key("Delete"), false, false)).toBe("edit.delete");
    expect(commandForKey(key("Backspace"), true, true)).toBeNull();
    expect(commandForKey(key("Enter"), true, false)).toBe("scene.finish");
    // With a native menu only plain shortcuts are left to the page.
    expect(commandForKey(key("z", { meta: true }), true, false, { plainOnly: true })).toBeNull();
    expect(commandForKey(key("v"), true, false, { plainOnly: true })).toBe("scene.tool.select");
    expect(isPlainShortcut("Mod+0")).toBe(false);
  });

  it("Ctrl+\\ hides all panels with the Control key on every platform", () => {
    expect(commandForKey(key("\\", { ctrl: true }), true, false)).toBe("view.panels");
    expect(commandForKey(key("\\", { ctrl: true }), false, false)).toBe("view.panels");
    expect(commandForKey(key("\\", { meta: true }), true, false)).toBeNull();
    // Not plain: it works in text fields and the native menu owns it in the app.
    expect(isPlainShortcut("Ctrl+\\")).toBe(false);
    expect(commandForKey(key("\\", { ctrl: true }), true, true)).toBe("view.panels");
    expect(accelerator("Ctrl+\\")).toBe("Control+Backslash");
  });
});
