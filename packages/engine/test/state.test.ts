import { describe, expect, it } from "vitest";
import { FlagsFile, SceneFile } from "@questforge/schema";
import {
  award,
  cloneState,
  giveItem,
  hasItem,
  initialState,
  markFired,
  markVisited,
  objectVisible,
  score,
  setCharacterPosition,
  setObjectVisible,
  takeItem,
} from "../src/state.ts";

// Runtime game state (spec 07, D75).

const flags = FlagsFile.parse({
  schemaVersion: 1,
  flags: [
    { id: "door_open", type: "bool", initial: false },
    { id: "lit", type: "bool", initial: true },
    { id: "coins", type: "counter", initial: 3 },
  ],
});
const scene = SceneFile.parse({
  schemaVersion: 1,
  id: "yard",
  name: "Yard",
  background: "bg",
  depth: { far: { y: 200, scale: 0.5 }, near: { y: 400, scale: 1 } },
  walkable: { outer: [[0, 200], [640, 200], [640, 400], [0, 400]], holes: [] },
  spawns: { default: { x: 100, y: 380, facing: "up" } },
  objects: [
    { id: "tree", image: "t", x: 0, y: 0, visible: true, rules: [] },
    { id: "key", image: "k", x: 0, y: 0, visible: false, rules: [] },
  ],
  characters: [],
  hotspots: [],
  regions: [],
  rules: [],
});
const fresh = () => initialState(flags, "yard", { x: 100, y: 380, facing: "up" });

describe("game state", () => {
  it("starts from the flags file and the spawn", () => {
    const s = fresh();
    expect(s.scene).toBe("yard");
    expect(s.player).toEqual({ x: 100, y: 380, facing: "up" });
    expect(s.flags).toEqual({ door_open: false, lit: true });
    expect(s.counters).toEqual({ coins: 3 });
    expect(s.inventory).toEqual([]);
    expect(s.music).toBe(null);
  });

  it("survives a JSON round-trip deep-equal (spec 07)", () => {
    const s = fresh();
    giveItem(s, "coin");
    award(s, "found_coin", 5);
    setObjectVisible(s, "yard", "tree", false);
    setCharacterPosition(s, "yard", "gardener", { x: 10.5, y: 300, facing: "left" });
    markVisited(s, "yard");
    markFired(s, "yard/hotspot:pond/0");
    s.player.x = 123.456;
    s.music = "theme";
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const c = cloneState(s);
    expect(c).toEqual(s);
    c.inventory.push("x");
    expect(s.inventory).toEqual(["coin"]);
  });

  it("never holds an item twice and keeps pickup order", () => {
    const s = fresh();
    giveItem(s, "coin");
    giveItem(s, "rope");
    giveItem(s, "coin");
    expect(s.inventory).toEqual(["coin", "rope"]);
    expect(hasItem(s, "rope")).toBe(true);
    takeItem(s, "coin");
    takeItem(s, "coin");
    expect(s.inventory).toEqual(["rope"]);
  });

  it("counts each award ID once (award dedupe)", () => {
    const s = fresh();
    expect(award(s, "coin", 5)).toBe(true);
    expect(award(s, "coin", 5)).toBe(false);
    expect(award(s, "coin", 50)).toBe(false);
    expect(award(s, "gem", 10)).toBe(true);
    expect(score(s)).toBe(15);
  });

  it("falls back to the scene file for object visibility", () => {
    const s = fresh();
    expect(objectVisible(s, scene, "tree")).toBe(true);
    expect(objectVisible(s, scene, "key")).toBe(false);
    setObjectVisible(s, "yard", "key", true);
    setObjectVisible(s, "yard", "tree", false);
    expect(objectVisible(s, scene, "key")).toBe(true);
    expect(objectVisible(s, scene, "tree")).toBe(false);
    expect(objectVisible(s, scene, "missing")).toBe(false);
  });

  it("records visited scenes and fired rules once each", () => {
    const s = fresh();
    markVisited(s, "yard");
    markVisited(s, "yard");
    markFired(s, "k");
    markFired(s, "k");
    expect(s.visited).toEqual(["yard"]);
    expect(s.fired).toEqual(["k"]);
  });
});
