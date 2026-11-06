import { describe, expect, it, vi } from "vitest";
import { COMMANDS, CommandRegistry, accelerator, commandForKey, matchesShortcut } from "../src/model/appCommands.ts";

const key = (k: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key: k,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe("app commands (D92)", () => {
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
    const shortcuts = COMMANDS.map((c) => c.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(accelerator("Mod+Shift+Z")).toBe("CmdOrCtrl+Shift+Z");
  });
});
