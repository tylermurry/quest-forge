import { describe, expect, it } from "vitest";
import { Action } from "@questforge/schema";
import { Sequence, type SequenceHost } from "../src/sequence.ts";
import { initialState } from "../src/state.ts";

// The action runner against a recording host.

function fakeHost() {
  const log: string[] = [];
  let textOpen = false;
  let walking = 0;
  let animLeft = 0;
  const host: SequenceHost & { log: string[]; dismiss(): void; arrive(): void; advanceAnim(): void } = {
    state: initialState({ schemaVersion: 2, flags: [{ id: "n", type: "counter", initial: 1 }] }, "yard", { x: 0, y: 0, facing: "up" }),
    log,
    narrate(text) {
      log.push(`narrate ${text}`);
      textOpen = true;
      return () => !textOpen;
    },
    say(c, text) {
      log.push(`say ${c} ${text}`);
      textOpen = true;
      return () => !textOpen;
    },
    walkPlayerTo(x, y) {
      log.push(`walk ${x},${y}`);
      walking++;
      const mine = walking;
      return () => walking !== mine;
    },
    walkCharacterTo(c, x, y) {
      log.push(`walk ${c} ${x},${y}`);
      return null;
    },
    face: (f) => log.push(`face ${f}`),
    changeScene: (s, sp) => log.push(`scene ${s} ${sp}`),
    setObjectVisible: (s, o, v) => log.push(`${v ? "show" : "hide"} ${s}/${o}`),
    setCharacterPosition: (c, s, p) => log.push(`place ${c} ${s} ${p.x},${p.y} ${p.facing}`),
    playAnimation(t, a) {
      log.push(`anim ${t.kind} ${a}`);
      if (a === "loop") return null;
      animLeft = 1;
      return () => animLeft === 0;
    },
    playSound: (s) => log.push(`sound ${s}`),
    playMusic: (m) => log.push(`music ${m}`),
    endGame: (e) => log.push(e.kind === "die" ? `die ${e.message}` : "win"),
    warn: (m) => log.push(`warn ${m}`),
    startDialogue(d) {
      log.push(`dialogue ${d}`);
      textOpen = true;
      return () => !textOpen;
    },
    dismiss: () => (textOpen = false),
    arrive: () => walking++,
    advanceAnim: () => (animLeft = 0),
  };
  return host;
}

const acts = (...a: unknown[]) => a.map((x) => Action.parse(x));
const DT = 1 / 60;

describe("sequences", () => {
  it("runs instant actions in one tick and in order", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts(
      { type: "give_item", item: "coin" },
      { type: "set_flag", flag: "door", value: true },
      { type: "add_to_counter", counter: "n", amount: 4 },
      { type: "award_points", points: 5, award: "coin" },
      { type: "award_points", points: 5, award: "coin" },
      { type: "face", facing: "left" },
      { type: "hide_object", scene: "yard", object: "rock" },
      { type: "set_character_position", character: "bob", scene: "yard", x: 10, y: 20, facing: "down" },
      { type: "play_music", music: "theme" },
      { type: "play_sound", sound: "ding" },
      { type: "take_item", item: "coin" },
    ));
    expect(s.done).toBe(false);
    s.tick(DT);
    expect(s.done).toBe(true);
    expect(h.state.inventory).toEqual([]);
    expect(h.state.flags.door).toBe(true);
    expect(h.state.counters.n).toBe(5);
    expect(h.state.awards).toEqual({ coin: 5 });
    expect(h.state.music).toBe("theme");
    expect(h.log).toEqual(["face left", "hide yard/rock", "place bob yard 10,20 down", "music theme", "sound ding"]);
  });

  it("blocks on text until it's dismissed", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "narrate", text: "One." }, { type: "say", character: "bob", text: "Two." }, { type: "give_item", item: "x" }));
    s.tick(DT);
    s.tick(DT);
    expect(h.log).toEqual(["narrate One."]);
    h.dismiss();
    s.tick(DT);
    expect(h.log).toEqual(["narrate One.", "say bob Two."]);
    expect(h.state.inventory).toEqual([]);
    h.dismiss();
    s.tick(DT);
    expect(h.state.inventory).toEqual(["x"]);
    expect(s.done).toBe(true);
  });

  it("blocks on walking until the player arrives", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "walk_player_to", x: 5, y: 6 }, { type: "face", facing: "up" }));
    s.tick(DT);
    s.tick(DT);
    expect(h.log).toEqual(["walk 5,6"]);
    h.arrive();
    s.tick(DT);
    expect(h.log).toEqual(["walk 5,6", "face up"]);
  });

  it("waits the given seconds at 60 Hz", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "wait", seconds: 0.5 }, { type: "give_item", item: "x" }));
    s.tick(DT); // starts the wait
    for (let i = 0; i < 29; i++) s.tick(DT);
    expect(h.state.inventory).toEqual([]);
    s.tick(DT);
    expect(h.state.inventory).toEqual(["x"]);
    expect(s.done).toBe(true);
  });

  it("blocks on one-shot animations but not looping ones", () => {
    const h = fakeHost();
    const target = { kind: "character", character: "bob" };
    const s = new Sequence(h, acts(
      { type: "play_animation", target, animation: "loop" },
      { type: "play_animation", target, animation: "wave" },
      { type: "give_item", item: "x" },
    ));
    s.tick(DT);
    expect(h.log).toEqual(["anim character loop", "anim character wave"]);
    s.tick(DT);
    expect(h.state.inventory).toEqual([]);
    h.advanceAnim();
    s.tick(DT);
    expect(h.state.inventory).toEqual(["x"]);
  });

  it("ends at change_scene and drops later actions", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "change_scene", scene: "cave", spawn: "door" }, { type: "give_item", item: "x" }));
    s.tick(DT);
    expect(s.done).toBe(true);
    s.tick(DT);
    expect(h.log).toEqual(["scene cave door"]);
    expect(h.state.inventory).toEqual([]);
  });

  it("ends at die and win_game", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "die", message: "Splat." }, { type: "give_item", item: "x" }));
    s.tick(DT);
    expect(s.done).toBe(true);
    const w = new Sequence(h, acts({ type: "win_game" }));
    w.tick(DT);
    expect(h.log).toEqual(["die Splat.", "win"]);
    expect(h.state.inventory).toEqual([]);
  });

  it("start_dialogue blocks until the dialogue ends, then the rule goes on", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "start_dialogue", dialogue: "shop" }, { type: "stop_music" }));
    h.state.music = "x";
    s.tick(DT);
    expect(h.log).toEqual(["dialogue shop"]);
    expect(h.state.music).toBe("x");
    h.dismiss();
    s.tick(DT);
    expect(h.state.music).toBe(null);
    expect(s.done).toBe(true);
  });

  it("stop() abandons the rest", () => {
    const h = fakeHost();
    const s = new Sequence(h, acts({ type: "narrate", text: "a" }, { type: "give_item", item: "x" }));
    s.tick(DT);
    s.stop();
    h.dismiss();
    s.tick(DT);
    expect(s.done).toBe(true);
    expect(h.state.inventory).toEqual([]);
  });
});
