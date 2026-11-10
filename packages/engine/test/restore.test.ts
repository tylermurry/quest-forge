import { describe, expect, it } from "vitest";
import { awardCatalog, readState, sanitizeState } from "../src/restore.ts";
import { initialState } from "../src/state.ts";
import type { Project } from "@questforge/schema";
import { rule, testProject } from "./support/project.ts";

// restore.ts is also exercised by the save-slot tests (saves.test.ts) and the editor's preset tests.
// This file covers what those do not: dialogue memory, new flags, awards, and odd stored shapes.

const SHOP = {
  id: "shop",
  nodes: [
    { id: "start", type: "start", pos: [0, 0], next: "menu" },
    { id: "menu", type: "choices", pos: [0, 0], options: [{ id: "ask", text: "Ask", if: [], once: true, next: null }] },
  ],
};

const fresh = (p: Project) => initialState(p.flags!.data, "yard", { x: 100, y: 380, facing: "up" });

describe("readState", () => {
  it("rejects anything that is not a state with a scene", () => {
    expect(readState(null)).toBeNull();
    expect(readState([])).toBeNull();
    expect(readState({ scene: 3 })).toBeNull();
  });

  it("fills missing fields and repairs bad positions and facings", () => {
    const s = readState({
      scene: "yard",
      player: { x: 5, y: NaN, facing: "sideways" },
      characters: { "yard/gardener": { x: 1, y: 2, facing: "up" }, "yard/bad": 7 },
      music: 4,
      fired: ["a", 1],
    })!;
    expect(s.player).toEqual({ x: 5, y: 0, facing: "down" });
    expect(s.characters).toEqual({ "yard/gardener": { x: 1, y: 2, facing: "up" } });
    expect(s.music).toBeNull();
    expect(s.fired).toEqual(["a"]);
    expect(s.dialogueChoices).toEqual([]);
    expect(s.counters).toEqual({});
  });
});

describe("sanitizeState", () => {
  it("adds flags and counters the saved state predates, at their initial values", () => {
    const p = testProject();
    const saved = fresh(p);
    delete saved.flags.open;
    delete saved.counters.n;
    const { state, dropped } = sanitizeState(p, saved);
    expect(state.flags.open).toBe(false);
    expect(state.counters.n).toBe(0);
    expect(dropped).toEqual([]);
  });

  it("keeps fired keys and once-only choices of dialogues that exist, drops the rest", () => {
    const p = testProject({ dialogues: [SHOP] });
    const saved = fresh(p);
    saved.fired = ["dialogue:shop/rule_1", "dialogue:gone/rule_1", "game/rule_9", "attic/scene/rule_1"];
    saved.dialogueChoices = ["shop/menu/ask", "shop/menu/old", "gone/menu/ask"];
    const { state, dropped } = sanitizeState(p, saved);
    expect(state.fired).toEqual(["dialogue:shop/rule_1", "game/rule_9"]);
    expect(state.dialogueChoices).toEqual(["shop/menu/ask"]);
    expect(dropped).toEqual(["dialogue choice shop/menu/old", "dialogue choice gone/menu/ask"]);
  });

  it("drops an object whose scene exists but whose object does not", () => {
    const p = testProject();
    const saved = fresh(p);
    saved.objects = { "yard/rock": false, "yard/nothing": true };
    const { state, dropped } = sanitizeState(p, saved);
    expect(state.objects).toEqual({ "yard/rock": false });
    expect(dropped).toEqual(["object yard/nothing"]);
  });
});

describe("awardCatalog", () => {
  it("lists each award once, with the points of the first action that gives it", () => {
    const p = testProject({
      yard: {
        rules: [
          rule({ type: "scene_enter" }, [
            { type: "award_points", award: "a", points: 3 },
            { type: "award_points", award: "a", points: 9 },
            { type: "award_points", award: "b", points: 1 },
          ]),
        ],
      },
    });
    expect(awardCatalog(p)).toEqual([
      { id: "a", points: 3 },
      { id: "b", points: 1 },
    ]);
  });
});
