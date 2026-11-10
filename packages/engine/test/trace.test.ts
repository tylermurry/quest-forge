import { describe, expect, it } from "vitest";
import { Session } from "../src/session.ts";
import { cloneState } from "../src/state.ts";
import type { TraceEvent } from "../src/trace.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// The playtest trace sink and starting from a given state.

type Over = Parameters<typeof testProject>[0];
const traced = (over?: Over) => {
  const events: TraceEvent[] = [];
  const s = new Session(testProject(over), testImages, {}, undefined, { trace: (e) => events.push(e) });
  return { s, events };
};
const arrive = (s: Session) => {
  for (let i = 0; i < 1200 && s.world.walking; i++) s.tick(1 / 60);
  s.tick(1 / 60);
};
const POT: [number, number] = [320, 320];
const door = (rules: unknown[]) => ({
  yard: { hotspots: [{ id: "pot", name: "door", shape: [[300, 300], [340, 300], [340, 340], [300, 340]], walkTo: { x: 320, y: 360, facing: "up" }, rules }] },
});

describe("trace sink", () => {
  it("reports every rule's verdict up to the match", () => {
    const rules = [
      rule({ type: "look" }, [narrate("A door.")]),
      rule({ type: "use_item", item: "stick" }, [narrate("Poke.")]),
      rule({ type: "use_item", item: "key" }, [narrate("Unlocked.")], [{ type: "flag_is", flag: "open", value: true }]),
      rule({ type: "use_item", item: "key" }, [narrate("Once.")], [], true),
      rule({ type: "use_item", item: "key" }, [narrate("Click.")], [{ type: "first_time" }, { type: "counter", counter: "n", op: "gt", value: 5 }]),
    ];
    const { s, events } = traced(door(rules));
    s.state.inventory.push("key");
    s.state.fired.push(`yard/hotspot:pot/${rules[3]!.id}`);
    s.selectItem("key");
    s.primaryClick(POT);
    arrive(s);
    const verdicts = events.filter((e) => e.type === "rule").map((e) => [e.index, e.verdict]);
    expect(verdicts).toEqual([
      [0, { kind: "wrong_trigger" }],
      [1, { kind: "wrong_trigger" }],
      [2, { kind: "condition_failed", index: 0, condition: { type: "flag_is", flag: "open", value: true } }],
      [3, { kind: "once_fired" }],
      [4, { kind: "condition_failed", index: 1, condition: { type: "counter", counter: "n", op: "gt", value: 5 } }],
    ]);
    const tail = events.slice(events.findIndex((e) => e.type === "trigger" && e.trigger.type === "use_item"));
    expect(tail[0]).toEqual({ type: "trigger", owner: { kind: "hotspot", scene: "yard", id: "pot" }, trigger: { type: "use_item", item: "key" } });
    expect(tail.at(-2)).toEqual({ type: "no_match", owner: { kind: "hotspot", scene: "yard", id: "pot" }, trigger: { type: "use_item", item: "key" }, response: "That won't work." });
    expect(tail.at(-1)).toEqual({ type: "action", action: { type: "narrate", text: "That won't work." } });
  });

  it("reports the match, its actions and scene changes", () => {
    const { s, events } = traced(door([rule({ type: "hand" }, [{ type: "set_flag", flag: "open", value: true }, { type: "change_scene", scene: "shed", spawn: "door" }])]));
    expect(events[0]).toEqual({ type: "scene", from: null, to: "yard", spawn: "default" });
    s.selectVerb("hand");
    s.primaryClick(POT);
    arrive(s);
    const kinds = events.map((e) => (e.type === "rule" ? `rule:${e.verdict.kind}` : e.type === "action" ? `action:${e.action.type}` : e.type));
    expect(kinds).toEqual(["scene", "trigger", "no_match", "trigger", "rule:matched", "action:set_flag", "action:change_scene", "trigger", "no_match", "scene", "trigger", "no_match"]);
    expect(events.filter((e) => e.type === "scene").at(-1)).toEqual({ type: "scene", from: "yard", to: "shed", spawn: "door" });
  });

  it("notes skipped steps; sounds are actions, not notes", () => {
    const { s, events } = traced(door([rule({ type: "hand" }, [{ type: "start_dialogue", dialogue: "chat" }, { type: "play_sound", sound: "creak" }])]));
    s.selectVerb("hand");
    s.primaryClick(POT);
    arrive(s);
    const notes = events.filter((e) => e.type === "note");
    expect(notes).toHaveLength(1);
    expect(events.some((e) => e.type === "action" && e.action.type === "play_sound")).toBe(true);
    expect(s.sounds).toEqual(["creak"]);
  });

  it("is off by default: a session without hooks still logs notes", () => {
    const s = new Session(testProject(door([rule({ type: "hand" }, [{ type: "start_dialogue", dialogue: "chat" }])])), testImages);
    s.selectVerb("hand");
    s.primaryClick(POT);
    arrive(s);
    expect(s.log.at(-1)).toContain("chat");
  });
});

describe("start state and entry snapshot", () => {
  it("starts from a given state at its scene and player position, without changing it", () => {
    const base = new Session(testProject(), testImages);
    const state = cloneState(base.state);
    state.scene = "shed";
    state.player = { x: 70, y: 390, facing: "left" };
    state.inventory = ["key"];
    const frozen = cloneState(state);
    const s = new Session(testProject(), testImages, { state });
    expect(s.scene.id).toBe("shed");
    expect(s.world.player.pos).toEqual([70, 390]);
    expect(s.state.inventory).toEqual(["key"]);
    expect(s.state.visited).toContain("shed");
    s.state.inventory.push("rod");
    expect(state).toEqual(frozen);
    expect(s.entry.spawn).toBe(null);
  });

  it("records the state before scene_enter on each entry", () => {
    const enter = rule({ type: "scene_enter" }, [{ type: "give_item", item: "rod" }]);
    const s = new Session(testProject({ shed: { rules: [enter] }, ...door([rule({ type: "hand" }, [{ type: "give_item", item: "key" }, { type: "change_scene", scene: "shed", spawn: "door" }])]) }), testImages);
    expect(s.entry.spawn).toBe("default");
    s.selectVerb("hand");
    s.primaryClick(POT);
    arrive(s);
    expect(s.scene.id).toBe("shed");
    expect(s.state.inventory).toEqual(["key", "rod"]);
    const { state, spawn } = s.entry;
    expect(spawn).toBe("door");
    expect(state.inventory).toEqual(["key"]);
    expect(state.player).toEqual({ x: 50, y: 380, facing: "right" });
    // Restarting from the snapshot re-runs scene_enter.
    const again = new Session(testProject({ shed: { rules: [enter] } }), testImages, { state });
    expect(again.state.inventory).toEqual(["key", "rod"]);
  });
});
