import { describe, expect, it } from "vitest";
import {
  AssetsFile,
  CharacterFile,
  FlagsFile,
  Id,
  ItemFile,
  Placement,
  Point,
} from "../src/index.ts";

const item = {
  schemaVersion: 2,
  id: "gold_key",
  name: "golden key",
  description: "A small golden key.",
  icon: "gold_key_icon",
};

const character = {
  schemaVersion: 2,
  id: "shopkeeper",
  name: "Shopkeeper",
  textColor: "#ffcc00",
  walkSpeed: 60,
  mirrorLeft: true,
  animations: {
    idle_down: { image: "shopkeeper_sheet", frames: [0], fps: 1, loop: true },
    walk_right: { image: "shopkeeper_sheet", frames: [4, 5, 6, 7], fps: 8, loop: true },
  },
};

describe("IDs", () => {
  it.each(["beach", "gold_key", "room2", "a"])("accepts %s", (id) => {
    expect(Id.safeParse(id).success).toBe(true);
  });
  it.each(["", "Beach", "2room", "gold-key", "gold key", "_x", "a".repeat(65)])("rejects %j", (id) => {
    expect(Id.safeParse(id).success).toBe(false);
  });
});

describe("geometry", () => {
  it("accepts integer points inside 640×400, edges included", () => {
    expect(Point.safeParse([0, 0]).success).toBe(true);
    expect(Point.safeParse([640, 400]).success).toBe(true);
  });
  it.each([
    [[1.5, 2]],
    [[-1, 2]],
    [[641, 2]],
    [[2, 401]],
    [[1, 2, 3]],
    [["1", 2]],
  ])("rejects %j", (p) => {
    expect(Point.safeParse(p).success).toBe(false);
  });
  it("requires a known facing", () => {
    expect(Placement.safeParse({ x: 1, y: 2, facing: "down" }).success).toBe(true);
    expect(Placement.safeParse({ x: 1, y: 2, facing: "north" }).success).toBe(false);
  });
});

describe("file schemas", () => {
  it("parses valid files", () => {
    expect(ItemFile.parse(item)).toEqual(item);
    expect(CharacterFile.parse(character)).toEqual(character);
    expect(
      FlagsFile.parse({
        schemaVersion: 2,
        flags: [
          { id: "talked_to_villager", type: "bool", initial: false },
          { id: "coins", type: "counter", initial: 0 },
        ],
      }).flags,
    ).toHaveLength(2);
    expect(
      AssetsFile.safeParse({
        schemaVersion: 2,
        images: [{ id: "beach_bg", path: "assets/images/beach.png" }],
        audio: [{ id: "beach_theme", path: "assets/audio/rooms/beach.mp3" }],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys (D59)", () => {
    const r = ItemFile.safeParse({ ...item, colour: "red" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.code).toBe("unrecognized_keys");
  });

  it("rejects a wrong or missing schemaVersion", () => {
    expect(ItemFile.safeParse({ ...item, schemaVersion: 1 }).success).toBe(false);
    expect(ItemFile.safeParse({ ...item, schemaVersion: 3 }).success).toBe(false);
    const { schemaVersion: _omit, ...noVersion } = item;
    expect(ItemFile.safeParse(noVersion).success).toBe(false);
  });

  it("rejects counters with non-integer or bool-typed initial values", () => {
    const bad = (flag: unknown) => FlagsFile.safeParse({ schemaVersion: 2, flags: [flag] }).success;
    expect(bad({ id: "coins", type: "counter", initial: 1.5 })).toBe(false);
    expect(bad({ id: "coins", type: "counter", initial: true })).toBe(false);
    expect(bad({ id: "lit", type: "bool", initial: 0 })).toBe(false);
  });

  it("rejects unknown animation slots and bad colors", () => {
    expect(
      CharacterFile.safeParse({
        ...character,
        animations: { dance_down: character.animations.idle_down },
      }).success,
    ).toBe(false);
    expect(CharacterFile.safeParse({ ...character, textColor: "yellow" }).success).toBe(false);
  });

  it("rejects asset paths outside assets/", () => {
    const bad = (path: string) =>
      AssetsFile.safeParse({ schemaVersion: 2, images: [{ id: "x", path }], audio: [] }).success;
    expect(bad("images/beach.png")).toBe(false);
    expect(bad("assets/../game.yaml")).toBe(false);
    expect(bad("assets\\images\\beach.png")).toBe(false);
  });

  it("does not add keys while parsing (D54)", () => {
    const parsed = CharacterFile.parse({ ...character, animations: {} });
    expect(Object.keys(parsed)).toEqual(Object.keys(character));
    expect(parsed.animations).toEqual({});
  });

  it("orders animation slots canonically regardless of input order", () => {
    const anim = character.animations.idle_down;
    const parsed = CharacterFile.parse({ ...character, animations: { talk_up: anim, idle_down: anim } });
    expect(Object.keys(parsed.animations)).toEqual(["idle_down", "talk_up"]);
  });
});
