import { describe, expect, it } from "vitest";
import { CharacterFile, SceneFile, type ImageAsset } from "@questforge/schema";
import { World, type LoadedImage } from "../src/world.ts";
import type { Vec } from "../src/vec.ts";

// Headless scene simulation: walking, depth, occlusion, hit-testing, approach points.

const anim = (frames: number[]) => ({ image: "hero_sheet", frames, fps: 8, loop: true });
const hero = CharacterFile.parse({
  schemaVersion: 1,
  id: "hero",
  name: "Hero",
  textColor: "#ffffff",
  walkSpeed: 100,
  mirrorLeft: true,
  animations: { idle_down: anim([0]), walk_down: anim([0, 1, 2, 3]), walk_right: anim([4, 5, 6, 7]), idle_right: anim([4]) },
});
const gardener = CharacterFile.parse({
  ...hero,
  id: "gardener",
  name: "Gardener",
  animations: { ...hero.animations, talk_right: { ...anim([4, 5]), loop: false } },
});

const look = (text: string) => ({ when: { type: "look" }, if: [], do: [{ type: "narrate", text }], once: false });
const scene = SceneFile.parse({
  schemaVersion: 1,
  id: "yard",
  name: "Yard",
  background: "bg",
  depth: { far: { y: 200, scale: 0.5 }, near: { y: 400, scale: 1 } },
  walkable: { outer: [[0, 200], [640, 200], [640, 400], [0, 400]], holes: [[[280, 280], [360, 280], [360, 320], [280, 320]]] },
  spawns: { default: { x: 100, y: 380, facing: "up" } },
  objects: [
    // A foreground tree: walk above y=330 and you're behind it.
    { id: "tree", name: "tree", image: "tree_img", x: 480, y: 100, baseline: 330, visible: true, rules: [look("A tall tree.")] },
    // No baseline: sorts by its bottom edge (y + height = 260).
    { id: "rock", name: "rock", image: "rock_img", x: 100, y: 230, visible: true, rules: [] },
    { id: "boulder", image: "rock_img", x: 0, y: 0, visible: true, obstacle: [[0, 250], [640, 250], [640, 260], [0, 260]], rules: [] },
  ],
  characters: [{ character: "gardener", x: 560, y: 380, facing: "left", visible: true, rules: [look("A busy gardener.")] }],
  hotspots: [
    {
      id: "pond",
      name: "pond",
      shape: [[280, 280], [360, 280], [360, 320], [280, 320]],
      walkTo: { x: 320, y: 340, facing: "up" },
      rules: [
        { when: { type: "look" }, if: [{ type: "first_time" }], do: [{ type: "narrate", text: "Conditional." }], once: true },
        { when: { type: "hand" }, if: [], do: [{ type: "narrate", text: "Wet." }], once: false },
        { when: { type: "look" }, if: [], do: [{ type: "narrate", text: "A still pond." }, { type: "narrate", text: "Fish dart about." }], once: false },
      ],
    },
    { id: "sky", name: "sky", shape: [[0, 0], [640, 0], [640, 100], [0, 100]], rules: [] },
  ],
  regions: [],
  rules: [],
});

const img = (asset: ImageAsset, w: number, h: number): LoadedImage => ({ asset, size: { w, h } });
const images = new Map<string, LoadedImage>([
  ["hero_sheet", img({ id: "hero_sheet", path: "assets/h.png", sheet: { columns: 4, rows: 2, cellWidth: 32, cellHeight: 48 } }, 128, 96)],
  ["tree_img", img({ id: "tree_img", path: "assets/t.png" }, 100, 240)],
  ["rock_img", img({ id: "rock_img", path: "assets/r.png" }, 60, 30)],
]);

const make = () => new World(scene, new Map([["hero", hero], ["gardener", gardener]]), (id) => images.get(id), { player: "hero", spawn: scene.spawns.default! });
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) w.tick(1 / 60);
};
const order = (w: World) => w.drawList().map((d) => d.id);
const near = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;

describe("walking", () => {
  it("spawns at the start spawn and walks around the hole to a click", () => {
    const w = make();
    expect(w.player.pos).toEqual([100, 380]);
    w.walkTo([500, 300]);
    expect(w.route.length).toBeGreaterThan(0);
    run(w, 10);
    expect(near(w.player.pos, [500, 300])).toBe(true);
    expect(w.route).toEqual([]);
    expect(w.player.kind).toBe("idle");
  });

  it("goes around a hole instead of through it", () => {
    const w = make();
    w.walkTo([320, 370]);
    run(w, 10);
    w.walkTo([320, 270]);
    expect(w.route.length).toBeGreaterThan(1);
    for (let i = 0; i < 600; i++) {
      w.tick(1 / 60);
      expect(w.nav.isWalkable(w.player.pos)).toBe(true);
    }
    expect(near(w.player.pos, [320, 270])).toBe(true);
  });

  it("faces and animates along the direction of travel", () => {
    const w = make();
    w.walkTo([300, 380]);
    w.tick(1 / 60);
    expect(w.player.kind).toBe("walk");
    expect(w.player.facing).toBe("right");
    const sprite = w.drawList().find((d) => d.id === "hero")!;
    expect(sprite.src.y).toBe(48); // walk_right row
    expect(sprite.mirror).toBe(false);
    w.walkTo([20, 380]);
    w.tick(1 / 60);
    expect(w.player.facing).toBe("left");
    expect(w.drawList().find((d) => d.id === "hero")!.mirror).toBe(true);
  });

  it("walks slower and draws smaller toward the far line", () => {
    const w = make();
    w.walkTo([100, 270]);
    const start = w.player.pos[1];
    w.tick(1 / 60);
    const nearStep = start - w.player.pos[1];
    const nearHeight = w.drawList().find((d) => d.id === "hero")!.dest.h;
    run(w, 10);
    expect(w.playerScale).toBeCloseTo(0.5 + 0.5 * (70 / 200), 6);
    w.walkTo([100, 262]);
    const farStart = w.player.pos[1];
    w.tick(1 / 60);
    expect(farStart - w.player.pos[1]).toBeLessThan(nearStep);
    expect(w.drawList().find((d) => d.id === "hero")!.dest.h).toBeLessThan(nearHeight);
  });

  it("can't pass a visible obstacle, and can once it's hidden (D42)", () => {
    const w = make();
    w.walkTo([320, 220]);
    run(w, 15);
    expect(w.player.pos[1]).toBeGreaterThanOrEqual(260);
    w.setObjectVisible("boulder", false);
    w.walkTo([320, 220]);
    run(w, 15);
    expect(near(w.player.pos, [320, 220])).toBe(true);
  });

  it("re-plans an ongoing walk when an obstacle appears", () => {
    const w = make();
    w.setObjectVisible("boulder", false);
    w.walkTo([320, 220]);
    run(w, 0.5);
    w.setObjectVisible("boulder", true);
    run(w, 15);
    expect(w.player.pos[1]).toBeGreaterThanOrEqual(260);
  });
});

describe("occlusion by baseline", () => {
  it("walks behind the tree above its baseline and in front below it", () => {
    const w = make();
    w.walkTo([530, 300]);
    run(w, 10);
    expect(order(w).indexOf("hero")).toBeLessThan(order(w).indexOf("tree"));
    w.walkTo([530, 360]);
    run(w, 10);
    expect(order(w).indexOf("hero")).toBeGreaterThan(order(w).indexOf("tree"));
  });

  it("uses an object's bottom edge when it has no baseline", () => {
    const w = make();
    expect(w.drawList().find((d) => d.id === "rock")!.baseline).toBe(260);
    expect(order(w).indexOf("rock")).toBeLessThan(order(w).indexOf("hero"));
  });

  it("hides hidden objects", () => {
    const w = make();
    w.setObjectVisible("tree", false);
    expect(order(w)).not.toContain("tree");
  });
});

describe("hit-testing (D69)", () => {
  it("prefers hotspots, then named sprites topmost first", () => {
    const w = make();
    expect(w.hitTest([300, 300])).toEqual({ kind: "hotspot", id: "pond", name: "pond" });
    expect(w.hitTest([500, 200])).toEqual({ kind: "object", id: "tree", name: "tree" });
    expect(w.hitTest([560, 360])).toEqual({ kind: "character", id: "gardener", name: "Gardener" });
    expect(w.hitTest([20, 5])).toEqual({ kind: "hotspot", id: "sky", name: "sky" });
    // The unnamed boulder isn't interactive; the player never targets itself.
    expect(w.hitTest([20, 255])).toBe(null);
    expect(w.hitTest([100, 370])).toBe(null);
  });
});

describe("approach and actors", () => {
  it("approaches a hotspot at its walk-to point and a character from the side (D74)", () => {
    const w = make();
    expect(w.approach({ kind: "hotspot", id: "pond", name: "pond" }, [300, 300])).toEqual({ dest: [320, 340], facing: "up", toward: [300, 300] });
    const a = w.approach({ kind: "character", id: "gardener", name: "Gardener" }, [560, 360]);
    expect(a.dest[0]).toBeLessThan(540);
    expect(a.dest[1]).toBe(380);
    expect(a.facing).toBe(null);
  });

  it("calls back on arrival, and a new walk replaces the callback", () => {
    const w = make();
    let arrived = 0;
    w.walkTo([300, 380], () => arrived++);
    run(w, 0.2);
    w.walkTo([200, 380]);
    run(w, 10);
    expect(arrived).toBe(0);
    w.walkTo([200, 380], () => arrived++);
    expect(arrived).toBe(1);
  });

  it("starts objects and NPCs from overrides", () => {
    const w = new World(scene, new Map([["hero", hero], ["gardener", gardener]]), (id) => images.get(id), {
      player: "hero",
      spawn: { x: 50, y: 390, facing: "right" },
      objectVisible: (id) => id !== "tree",
      characterPosition: (id) => (id === "gardener" ? { x: 400, y: 300, facing: "down" } : undefined),
    });
    expect(w.player.pos).toEqual([50, 390]);
    expect(w.isObjectVisible("tree")).toBe(false);
    expect(w.npcs[0]!.pos).toEqual([400, 300]);
    w.placeCharacter("gardener", { x: 10, y: 390, facing: "up" });
    expect(w.npcs[0]!.pos).toEqual([10, 390]);
  });

  it("plays a one-shot slot then returns to the normal animation (D71)", () => {
    const w = make();
    // Looping slots report 0 (they don't block); one-shots their length.
    expect(w.playSlot("gardener", "walk_right")).toBe(0);
    expect(w.playSlot("gardener", "talk_up")).toBe(null);
    expect(w.playSlot("gardener", "dance")).toBe(null);
    // Left mirrors right.
    expect(w.playSlot("gardener", "talk_left")).toBeCloseTo(0.25, 6);
    expect(w.drawList().find((d) => d.id === "gardener")!.mirror).toBe(true);
    run(w, 0.3);
    expect(w.npcs[0]!.special).toBe(null);
    expect(w.drawList().find((d) => d.id === "gardener")!.mirror).toBe(true); // still facing left
  });
});
