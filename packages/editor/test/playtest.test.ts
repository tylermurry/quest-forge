import { describe, expect, it } from "vitest";
import { Session } from "@questforge/engine";
import type { Project, SceneFile } from "@questforge/schema";
import { CommandRegistry, commandForKey, isPlainShortcut } from "../src/model/appCommands.ts";
import { hereSpawn } from "../src/model/playtest/playtest.ts";
import { playtestEditor } from "./support/playtest.ts";

// Playtest runs: Play, Play from here, Restart,
// Restart scene, Stop, and the validation gate.

const POND: [number, number] = [310, 320];
const editScene = (p: Project, id: string, f: (s: SceneFile) => SceneFile): Project => ({
  ...p,
  scenes: p.scenes.map((d) => (d.data.id === id ? { ...d, data: f(d.data) } : d)),
});
const pondLook = (text: string) => (s: SceneFile): SceneFile => ({
  ...s,
  hotspots: s.hotspots.map((h) => (h.id === "pond" ? { ...h, rules: h.rules.map((r) => (r.id === "rule_1" ? { ...r, do: [{ type: "narrate" as const, text }] } : r)) } : h)),
});

describe("Play and the validation gate", () => {
  it("Play starts at the game start", async () => {
    const { playtest, session, dispose } = await playtestEditor();
    expect(playtest.play()).toBe(true);
    expect(session().scene.id).toBe("garden");
    expect(session().world.player.pos).toEqual([200, 380]);
    dispose();
  });

  it("errors block Play: Problems opens with a notice and nothing runs", async () => {
    const { playtest, editor, ws, dispose } = await playtestEditor();
    editor.apply("Break", (p) => editScene(p, "garden", (s) => ({ ...s, hotspots: s.hotspots.map((h) => ({ ...h, rules: h.rules.map((r) => ({ ...r, do: r.do.map((a) => (a.type === "give_item" ? { ...a, item: "nope" } : a)) })) })) })));
    const before = ws.dockRequest;
    expect(playtest.play()).toBe(false);
    expect(playtest.playing).toBe(false);
    expect(ws.dockRequest).toBe(before + 1);
    expect(editor.notice?.kind).toBe("error");
    expect(editor.notice?.text).toMatch(/Problems/);
    dispose();
  });

  it("warnings don't block Play", async () => {
    const { playtest, editor, dispose } = await playtestEditor();
    editor.validateNow();
    expect(editor.problems.some((p) => p.severity === "warning")).toBe(true);
    expect(playtest.play()).toBe(true);
    dispose();
  });
});

describe("Play from here", () => {
  it("picks the selected spawn, else default, else the first", () => {
    const scene = { spawns: { a: { x: 1, y: 1, facing: "up" }, default: { x: 2, y: 2, facing: "up" } } } as unknown as SceneFile;
    expect(hereSpawn(scene, "a")).toBe("a");
    expect(hereSpawn(scene, null)).toBe("default");
    expect(hereSpawn(scene, "gone")).toBe("default");
    expect(hereSpawn({ spawns: { b: { x: 1, y: 1, facing: "up" } } } as unknown as SceneFile, null)).toBe("b");
  });

  it("starts in the active scene tab at the selected spawn, and is disabled without one", async () => {
    const { playtest, ws, session, dispose } = await playtestEditor();
    expect(playtest.hereTarget()).toBe(null);
    expect(playtest.playHere()).toBe(false);
    ws.open({ section: "scene", id: "garden" });
    ws.select({ kind: "sceneThing", scene: "garden", list: "spawns", key: "from_shed" });
    expect(playtest.playHere()).toBe(true);
    expect(session().scene.id).toBe("garden");
    expect(session().world.player.pos).toEqual([555, 370]);
    ws.open({ section: "scene", id: "shed" });
    expect(playtest.playHere()).toBe(true);
    expect(session().scene.id).toBe("shed");
    expect(session().entry.spawn).toBe("door");
    dispose();
  });
});

describe("Restart, Restart scene and Stop", () => {
  it("an edit made during play applies on Restart scene, keeping the entry state", async () => {
    const { playtest, editor, session, tap, dispose } = await playtestEditor();
    playtest.play();
    tap("hand", [155, 300]); // the flowerpot → stick
    expect(session().state.inventory).toEqual(["stick"]);
    // An edit while playing doesn't hot-apply.
    editor.apply("Edit text", (p) => editScene(p, "garden", pondLook("A brand new pond.")));
    expect(playtest.stale).toBe(true);
    tap("look", POND);
    expect(playtest.events.some((e) => e.type === "action" && e.action.type === "narrate" && e.action.text === "A brand new pond.")).toBe(false);
    // Restart scene: the edited project, back to the state at entry (no stick yet).
    expect(playtest.restartScene()).toBe(true);
    expect(playtest.stale).toBe(false);
    expect(session().state.inventory).toEqual([]);
    session().selectVerb("look");
    session().primaryClick(POND);
    expect(session().text?.text).toBe("A brand new pond.");
    dispose();
  });

  it("Restart scene re-reads the entry spawn from the edited project", async () => {
    const { playtest, editor, session, dispose } = await playtestEditor();
    playtest.play();
    editor.apply("Move spawn", (p) => editScene(p, "garden", (s) => ({ ...s, spawns: { ...s.spawns, default: { x: 250, y: 385, facing: "left" } } })));
    playtest.restartScene();
    expect(session().world.player.pos).toEqual([250, 385]);
    expect(session().world.player.facing).toBe("left");
    dispose();
  });

  it("Restart goes back to the run's original start, also from the in-game Restart button", async () => {
    const { playtest, ws, session, tap, dispose } = await playtestEditor();
    ws.open({ section: "scene", id: "shed" });
    playtest.playHere();
    // The door spawn stands in the west exit: step out, then back in.
    tap("walk", [300, 380]);
    tap("walk", [40, 385]);
    expect(session().scene.id).toBe("garden");
    playtest.restartScene();
    expect(session().scene.id).toBe("garden");
    playtest.restart();
    expect(session().scene.id).toBe("shed");
    tap("walk", [300, 380]);
    tap("walk", [40, 385]);
    expect(session().scene.id).toBe("garden");
    playtest.restartScene();
    const run = playtest.run;
    session().requestRestart();
    expect(playtest.run).not.toBe(run);
    expect(session().scene.id).toBe("shed");
    dispose();
  });

  it("Stop ends the run; a late attach from an old run is ignored", async () => {
    const { playtest, session, dispose } = await playtestEditor();
    playtest.play();
    const old = playtest.run!;
    const oldSession = session();
    playtest.restart();
    playtest.attach(old, oldSession);
    expect(playtest.session).not.toBe(oldSession);
    playtest.stop();
    expect(playtest.playing).toBe(false);
    expect(playtest.session).toBe(null);
    expect(playtest.restartScene()).toBe(false);
    dispose();
  });

  it("each run starts a fresh event log", async () => {
    const { playtest, tap, dispose } = await playtestEditor();
    playtest.play();
    tap("look", POND);
    expect(playtest.events.some((e) => e.type === "trigger" && e.trigger.type === "look")).toBe(true);
    playtest.restart();
    expect(playtest.events.some((e) => e.type === "trigger" && e.trigger.type === "look")).toBe(false);
    dispose();
  });
});

describe("Play commands", () => {
  it("F5, F6 and Shift+F5 are accelerators, not plain shortcuts", () => {
    expect(isPlainShortcut("F5")).toBe(false);
    expect(isPlainShortcut("Shift+F5")).toBe(false);
    const key = (k: string, shift = false) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: shift, altKey: false });
    expect(commandForKey(key("F5"), true, false)).toBe("play.start");
    expect(commandForKey(key("F6"), true, false)).toBe("play.here");
    expect(commandForKey(key("F5", true), true, false)).toBe("play.stop");
    // With the native menu, the menu's accelerators own them.
    expect(commandForKey(key("F5"), true, false, { plainOnly: true })).toBe(null);
  });

  it("plain shortcuts don't reach the editor while the game has focus; F-keys and Mod still do", () => {
    const key = (k: string, mod = false) => ({ key: k, metaKey: mod, ctrlKey: false, shiftKey: false, altKey: false });
    expect(commandForKey(key("v"), true, false)).toBe("scene.tool.select");
    expect(commandForKey(key("v"), true, false, { inGame: true })).toBe(null);
    expect(commandForKey(key("Backspace"), true, false, { inGame: true })).toBe(null);
    expect(commandForKey(key("F6"), true, false, { inGame: true })).toBe("play.here");
    expect(commandForKey(key("z", true), true, false, { inGame: true })).toBe("edit.undo");
  });

  it("the registry runs Play through its handlers", async () => {
    const { playtest, dispose } = await playtestEditor();
    const reg = new CommandRegistry();
    reg.register({ "play.start": { run: () => playtest.play() }, "play.stop": { run: () => playtest.stop(), enabled: () => playtest.playing } });
    expect(reg.isEnabled("play.stop")).toBe(false);
    reg.run("play.start");
    expect(playtest.session).toBeInstanceOf(Session);
    expect(reg.isEnabled("play.stop")).toBe(true);
    dispose();
  });
});
