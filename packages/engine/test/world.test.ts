import { describe, expect, it } from "vitest";
import { CharacterFile, GameFile, SceneFile, type ImageAsset } from "@questforge/schema";
import { World, type LoadedImage } from "../src/world.ts";
import type { Vec } from "../src/vec.ts";

// Headless runtime: walking, depth, occlusion, hit-testing and M1 look text.

const game = GameFile.parse({
  schemaVersion: 1,
  id: "test",
  title: "Test",
  version: 1,
  startScene: "yard",
  startSpawn: "default",
  player: "hero",
  maxScore: 0,
  defaultResponses: { look: "You see nothing special.", hand: "No.", talk: "Nobody answers.", use_item: "No.", combine: "No." },
  rules: [],
});

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
const gardener = CharacterFile.parse({ ...hero, id: "gardener", name: "Gardener" });

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

const make = () => new World(game, scene, new Map([["hero", hero], ["gardener", gardener]]), (id) => images.get(id), "default");
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) w.tick(1 / 60);
};
const order = (w: World) => w.drawList().map((d) => d.id);
const near = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;

describe("walking", () => {
  it("spawns at the start spawn and walks around the hole to a click", () => {
    const w = make();
    expect(w.player.pos).toEqual([100, 380]);
    w.primaryClick([500, 300]);
    expect(w.route.length).toBeGreaterThan(0);
    run(w, 10);
    expect(near(w.player.pos, [500, 300])).toBe(true);
    expect(w.route).toEqual([]);
    expect(w.player.kind).toBe("idle");
  });

  it("goes around a hole instead of through it", () => {
    const w = make();
    w.primaryClick([320, 370]);
    run(w, 10);
    w.primaryClick([320, 270]);
    expect(w.route.length).toBeGreaterThan(1);
    for (let i = 0; i < 600; i++) {
      w.tick(1 / 60);
      expect(w.nav.isWalkable(w.player.pos)).toBe(true);
    }
    expect(near(w.player.pos, [320, 270])).toBe(true);
  });

  it("faces and animates along the direction of travel", () => {
    const w = make();
    w.primaryClick([300, 380]);
    w.tick(1 / 60);
    expect(w.player.kind).toBe("walk");
    expect(w.player.facing).toBe("right");
    const sprite = w.drawList().find((d) => d.id === "hero")!;
    expect(sprite.src.y).toBe(48); // walk_right row
    expect(sprite.mirror).toBe(false);
    w.primaryClick([20, 380]);
    w.tick(1 / 60);
    expect(w.player.facing).toBe("left");
    expect(w.drawList().find((d) => d.id === "hero")!.mirror).toBe(true);
  });

  it("walks slower and draws smaller toward the far line", () => {
    const w = make();
    w.primaryClick([100, 270]);
    const start = w.player.pos[1];
    w.tick(1 / 60);
    const nearStep = start - w.player.pos[1];
    const nearHeight = w.drawList().find((d) => d.id === "hero")!.dest.h;
    run(w, 10);
    expect(w.playerScale).toBeCloseTo(0.5 + 0.5 * (70 / 200), 6);
    w.primaryClick([100, 262]);
    const farStart = w.player.pos[1];
    w.tick(1 / 60);
    expect(farStart - w.player.pos[1]).toBeLessThan(nearStep);
    expect(w.drawList().find((d) => d.id === "hero")!.dest.h).toBeLessThan(nearHeight);
  });

  it("can't pass a visible obstacle, and can once it's hidden (D42)", () => {
    const w = make();
    w.primaryClick([320, 220]);
    run(w, 15);
    expect(w.player.pos[1]).toBeGreaterThanOrEqual(260);
    w.setObjectVisible("boulder", false);
    w.primaryClick([320, 220]);
    run(w, 15);
    expect(near(w.player.pos, [320, 220])).toBe(true);
  });

  it("re-plans an ongoing walk when an obstacle appears", () => {
    const w = make();
    w.setObjectVisible("boulder", false);
    w.primaryClick([320, 220]);
    run(w, 0.5);
    w.setObjectVisible("boulder", true);
    run(w, 15);
    expect(w.player.pos[1]).toBeGreaterThanOrEqual(260);
  });
});

describe("occlusion by baseline", () => {
  it("walks behind the tree above its baseline and in front below it", () => {
    const w = make();
    w.primaryClick([530, 300]);
    run(w, 10);
    expect(order(w).indexOf("hero")).toBeLessThan(order(w).indexOf("tree"));
    w.primaryClick([530, 360]);
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

describe("look text (D67)", () => {
  it("right-click toggles Walk and Look", () => {
    const w = make();
    expect(w.verb).toBe("walk");
    w.secondaryClick();
    expect(w.verb).toBe("look");
    w.secondaryClick();
    expect(w.verb).toBe("walk");
  });

  it("walks to the hotspot's walk-to point, faces it, then shows the first unconditional look rule", () => {
    const w = make();
    w.secondaryClick();
    w.primaryClick([300, 300]);
    expect(w.text).toBe(null);
    run(w, 10);
    expect(near(w.player.pos, [320, 340])).toBe(true);
    expect(w.player.facing).toBe("up");
    expect(w.text).toEqual(["A still pond.", "Fish dart about."]);
  });

  it("locks input while text shows; a click dismisses it", () => {
    const w = make();
    w.secondaryClick();
    w.primaryClick([300, 300]);
    run(w, 10);
    w.secondaryClick();
    expect(w.verb).toBe("look");
    const pos = w.player.pos;
    w.primaryClick([100, 380]);
    expect(w.text).toBe(null);
    run(w, 1);
    expect(w.player.pos).toEqual(pos);
  });

  it("faces toward objects and characters, which have no walk-to point", () => {
    const w = make();
    w.secondaryClick();
    w.primaryClick([560, 360]);
    run(w, 10);
    expect(w.text).toEqual(["A busy gardener."]);
    w.primaryClick([0, 0]);
    w.primaryClick([500, 200]);
    run(w, 10);
    expect(w.text).toEqual(["A tall tree."]);
    expect(w.player.facing).toBe("up");
  });

  it("falls back to the default look response", () => {
    const w = make();
    w.secondaryClick();
    w.primaryClick([20, 5]);
    run(w, 10);
    expect(w.text).toEqual(["You see nothing special."]);
  });

  it("ignores Look on empty ground", () => {
    const w = make();
    w.secondaryClick();
    w.primaryClick([200, 380]);
    run(w, 5);
    expect(w.text).toBe(null);
    expect(w.player.pos).toEqual([100, 380]);
  });
});
