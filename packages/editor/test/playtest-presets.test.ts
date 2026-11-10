import { describe, expect, it } from "vitest";
import { cloneState } from "@questforge/engine";
import { MemoryFs, renameId, type Project } from "@questforge/schema";
import { PRESETS_FILE, PresetStore, readPresets, readState, sanitizeState } from "../src/model/playtest/presets.ts";
import { applyStateEdit } from "../src/model/playtest/state.ts";
import { m1Project } from "./support/fixtures.ts";
import { playtestEditor } from "./support/playtest.ts";

// State presets: saved per project in .editor/presets.json;
// stale IDs are dropped with a notice, never a crash.

const GARDENER: [number, number] = [560, 312];

describe("playtest acceptance: a late puzzle from a preset", () => {
  it("saves 'Before gardener', then starts from it and solves the gated puzzle in under 5 seconds", async () => {
    const { playtest, editor, fs, session, tap, dispose } = await playtestEditor();
    await playtest.presets.attach(fs);
    // Get to the late puzzle the quick way: play, then set up the state live.
    playtest.play();
    applyStateEdit(session(), { kind: "giveItem", item: "rod" });
    applyStateEdit(session(), { kind: "giveItem", item: "fish" });
    applyStateEdit(session(), { kind: "grantAward", award: "found_stick", points: 5 });
    applyStateEdit(session(), { kind: "grantAward", award: "caught_fish", points: 5 });
    applyStateEdit(session(), { kind: "setVisited", scene: "shed", visited: true });
    expect(await playtest.savePreset("Before gardener")).toBe(true);
    playtest.stop();
    expect(JSON.parse(await fs.readText(PRESETS_FILE)).presets[0].name).toBe("Before gardener");

    // Later (a new editor on the same folder): start from the preset.
    const started = performance.now();
    const again = new PresetStore();
    await again.attach(fs);
    expect(again.list.map((p) => p.name)).toEqual(["Before gardener"]);
    await playtest.presets.attach(fs);
    expect(playtest.playPreset("Before gardener")).toBe(true);
    expect(session().state.inventory).toEqual(["rod", "fish"]);
    tap("talk", GARDENER);
    expect(session().state.flags.path_open).toBe(true);
    expect(session().world.isObjectVisible("boulder")).toBe(false);
    expect(session().state.awards).toEqual({ found_stick: 5, caught_fish: 5, fed_gardener: 10 });
    expect(performance.now() - started).toBeLessThan(5000);
    expect(editor.notice).toBe(null);
    dispose();
  });
});

describe("presets file", () => {
  it("saves, replaces by name and removes", async () => {
    const fs = new MemoryFs();
    const p = await m1Project();
    const store = new PresetStore();
    await store.attach(fs);
    const { playtest, session, dispose } = await playtestEditor(p);
    playtest.play();
    await store.save("Start", session().state);
    applyStateEdit(session(), { kind: "giveItem", item: "fish" });
    await store.save("  Start ", session().state);
    await store.save("Other", session().state);
    expect(store.list.map((x) => x.name)).toEqual(["Start", "Other"]);
    expect(store.find("Start")!.state.inventory).toEqual(["fish"]);
    // A copy: later play doesn't change the preset.
    applyStateEdit(session(), { kind: "giveItem", item: "rod" });
    expect(store.find("Start")!.state.inventory).toEqual(["fish"]);
    await store.remove("Other");
    expect(readPresets(await fs.readText(PRESETS_FILE)).map((x) => x.name)).toEqual(["Start"]);
    dispose();
  });

  it("a failed write shows a plain-English notice and keeps the preset in memory", async () => {
    class ReadOnlyFs extends MemoryFs {
      override async writeText(): Promise<void> {
        throw new Error("EACCES");
      }
    }
    const { playtest, editor, dispose } = await playtestEditor();
    await playtest.presets.attach(new ReadOnlyFs());
    playtest.play();
    expect(editor.notice).toBe(null);
    expect(await playtest.savePreset("Doomed")).toBe(true);
    expect(editor.notice?.kind).toBe("error");
    expect(editor.notice?.text).toMatch(/Couldn't save your playtest presets/);
    expect(playtest.presets.find("Doomed")).toBeDefined();
    dispose();
  });

  it("a missing or broken file, or a broken entry, is skipped", () => {
    expect(readPresets(null)).toEqual([]);
    expect(readPresets("{not json")).toEqual([]);
    expect(
      readPresets(
        JSON.stringify({ presets: [{ name: "x" }, { name: "", state: { scene: "a" } }, 7, { name: "ok", state: { scene: "garden", inventory: ["a", 3] } }] }),
      ).map((x) => x.name),
    ).toEqual(["ok"]);
    const s = readState({ scene: "garden", inventory: ["a", 3], player: { x: "1" } })!;
    expect(s.inventory).toEqual(["a"]);
    expect(s.player).toEqual({ x: 0, y: 0, facing: "down" });
    expect(s.flags).toEqual({});
  });
});

describe("stale IDs", () => {
  const playing = async () => {
    const t = await playtestEditor();
    t.playtest.play();
    return t;
  };

  it("drops IDs the project no longer has, adds new flags at their initial value", async () => {
    const { session, editor, dispose } = await playing();
    const saved = cloneState(session().state);
    saved.inventory = ["rod", "gold_key"];
    saved.flags = { path_open: true, old_flag: true };
    saved.counters = { gone: 3 };
    saved.awards = { caught_fish: 5, old_award: 3 };
    saved.visited = ["garden", "cave"];
    saved.objects = { "garden/boulder": false, "garden/gone": true, "cave/x": true };
    saved.characters = { "garden/gardener": { x: 1, y: 2, facing: "up" }, "garden/ghost": { x: 1, y: 2, facing: "up" } };
    saved.fired = ["garden/hotspot:pond/rule_2", "cave/scene/rule_1", "game/rule_1"];
    saved.music = "old_song";
    const { state, dropped } = sanitizeState(editor.project, saved);
    expect(state.inventory).toEqual(["rod"]);
    expect(state.flags).toEqual({ path_open: true });
    expect(state.counters).toEqual({});
    expect(state.awards).toEqual({ caught_fish: 5 });
    expect(state.visited).toEqual(["garden"]);
    expect(state.objects).toEqual({ "garden/boulder": false });
    expect(state.characters).toEqual({ "garden/gardener": { x: 1, y: 2, facing: "up" } });
    expect(state.fired).toEqual(["garden/hotspot:pond/rule_2", "game/rule_1"]);
    expect(state.music).toBe(null);
    expect(dropped).toEqual([
      "item gold_key",
      "flag old_flag",
      "counter gone",
      "award old_award",
      "visited scene cave",
      "object garden/gone",
      "object cave/x",
      "character position garden/ghost",
      "music old_song",
    ]);
    // The original is untouched.
    expect(saved.inventory).toEqual(["rod", "gold_key"]);
    dispose();
  });

  it("a preset whose scene is gone starts at the game start", async () => {
    const { session, editor, dispose } = await playing();
    const saved = { ...cloneState(session().state), scene: "cave", player: { x: 5, y: 5, facing: "up" as const } };
    const { state, dropped } = sanitizeState(editor.project, saved);
    expect(state.scene).toBe("garden");
    expect(state.player).toEqual({ x: 200, y: 380, facing: "up" });
    expect(dropped[0]).toMatch(/^scene cave/);
    dispose();
  });

  it("starting a preset after an item was renamed away plays without it, with a notice", async () => {
    const { playtest, editor, fs, session, dispose } = await playtestEditor();
    await playtest.presets.attach(fs);
    playtest.play();
    applyStateEdit(session(), { kind: "giveItem", item: "fish" });
    applyStateEdit(session(), { kind: "giveItem", item: "rod" });
    await playtest.savePreset("Before cave");
    playtest.stop();
    editor.apply("Change ID", (p: Project) => renameId(p, "item", "fish", "trout"));
    expect(playtest.playPreset("Before cave")).toBe(true);
    expect(session().state.inventory).toEqual(["rod"]);
    expect(editor.notice?.text).toBe('Preset "Before cave" started without item fish, which no longer exists in the project.');
    dispose();
  });
});
