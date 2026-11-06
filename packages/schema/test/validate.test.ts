import { describe, expect, it } from "vitest";
import {
  formatProblem,
  hasBlockingErrors,
  inWalkable,
  loadProject,
  polygonIssue,
  suggest,
  validateProject,
  type Point,
  type Problem,
  type Project,
} from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE } from "./helpers.ts";

const fixture = async () => (await loadProject(new NodeFs(FIXTURE))).project;

/** Load the fixture, apply an edit to a deep copy, validate. */
async function problemsAfter(edit: (p: Project) => void): Promise<Problem[]> {
  const project = structuredClone(await fixture());
  edit(project);
  return validateProject(project);
}
const scene = (p: Project, id: string) => p.scenes.find((s) => s.data.id === id)!.data;
const summary = (ps: Problem[]) => ps.map((p) => ({ code: p.code, file: p.location.file, path: p.location.path.join("."), text: formatProblem(p) }));

describe("the fixture project", () => {
  it("has no problems", async () => {
    expect(validateProject(await fixture())).toEqual([]);
  });
});

describe("spec 14 errors", () => {
  it("missing reference, with a did-you-mean (spec 14 message style)", async () => {
    const problems = await problemsAfter((p) => {
      p.items.find((i) => i.data.id === "lantern")!.data.id = "golden_key";
      scene(p, "beach").hotspots[0]!.rules[1]!.when = { type: "use_item", item: "gold_key" };
    });
    const mine = problems.filter((x) => x.location.file.includes("beach"));
    expect(summary(mine)).toEqual([
      {
        code: "missing_reference",
        file: "scenes/outdoors/beach.scene.yaml",
        path: "hotspots.0.rules.1.when.item",
        text: 'Sunny Beach › Hotspot "shell" › Rule 2: uses item gold_key, which doesn\'t exist. Did you mean golden_key?',
      },
    ]);
  });

  it.each([
    ["scene", (p: Project) => (scene(p, "beach").regions[0]!.rules[0]!.do[0] = { type: "change_scene", scene: "cave", spawn: "default" }), "uses scene cave, which doesn't exist."],
    ["flag", (p: Project) => (scene(p, "path").characters[0]!.rules[0]!.if[0] = { type: "flag_is", flag: "talked_to_villagr", value: false }), "uses flag talked_to_villagr, which doesn't exist. Did you mean talked_to_villager?"],
    ["character", (p: Project) => (scene(p, "path").characters[0]!.rules[1]!.do[0] = { type: "say", character: "vilager", text: "Hi" }), "uses character vilager, which doesn't exist. Did you mean villager?"],
    ["audio", (p: Project) => (scene(p, "beach").music = "sea_theme"), "uses sound sea_theme, which doesn't exist."],
    ["dialogue", (p: Project) => (scene(p, "shop").characters[0]!.rules[0]!.do[0] = { type: "start_dialogue", dialogue: "shop_chat" }), "uses dialogue shop_chat, which doesn't exist."],
    ["image", (p: Project) => (scene(p, "beach").background = "beach_bgg"), "uses image beach_bgg, which doesn't exist. Did you mean beach_bg?"],
    ["spawn", (p: Project) => (scene(p, "beach").regions[0]!.rules[0]!.do[0] = { type: "change_scene", scene: "path", spawn: "from_beech" }), "uses spawn point from_beech in Village Path, which doesn't exist. Did you mean from_beach?"],
    ["object", (p: Project) => (scene(p, "path").characters[0]!.rules[0]!.do[1] = { type: "hide_object", scene: "path", object: "bouldr" }), "uses object bouldr in Village Path, which doesn't exist. Did you mean boulder?"],
    ["flag used as counter", (p: Project) => (scene(p, "shop").rules[0]!.do[0] = { type: "add_to_counter", counter: "talked_to_villager", amount: 1 }), "uses talked_to_villager as a counter, but it's a flag."],
  ])("missing reference: %s", async (_kind, edit, message) => {
    const problems = await problemsAfter(edit);
    expect(problems.map((x) => [x.code, x.message])).toEqual([["missing_reference", message]]);
  });

  it("missing reference: dialogue node", async () => {
    const problems = await problemsAfter((p) => {
      const sell = p.dialogues[0]!.data.nodes.find((n) => n.id === "sell")!;
      if (sell.type === "actions") sell.next = "thank_you";
    });
    expect(summary(problems)).toEqual([
      { code: "missing_reference", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.4.next", text: 'Dialogue "Shopkeeper" › Node "sell": connects to node thank_you, which doesn\'t exist.' },
    ]);
  });

  it("scene with no walkable area", async () => {
    const problems = await problemsAfter((p) => {
      scene(p, "shop").walkable.outer = [];
    });
    expect(summary(problems)).toEqual([
      { code: "no_walkable_area", file: "scenes/shop.scene.yaml", path: "walkable", text: "The Shop: has no walkable area. Draw where the player can walk." },
    ]);
  });

  it("spawn outside walkable (outside the outline, or inside a hole)", async () => {
    const problems = await problemsAfter((p) => {
      scene(p, "beach").spawns.default = { x: 330, y: 320, facing: "down" }; // inside the rock hole
      scene(p, "shop").spawns.default = { x: 10, y: 10, facing: "up" };
    });
    expect(summary(problems)).toEqual([
      { code: "spawn_outside_walkable", file: "scenes/outdoors/beach.scene.yaml", path: "spawns.default", text: 'Sunny Beach › Spawn "default": is at (330, 320), outside the walkable area.' },
      { code: "spawn_outside_walkable", file: "scenes/shop.scene.yaml", path: "spawns.default", text: 'The Shop › Spawn "default": is at (10, 10), outside the walkable area.' },
    ]);
  });

  it("start scene missing", async () => {
    const problems = await problemsAfter((p) => {
      p.game!.data.startScene = "beech";
    });
    expect(summary(problems)).toEqual([
      { code: "start_scene_missing", file: "game.yaml", path: "startScene", text: "Game settings: the start scene beech doesn't exist. Did you mean beach?" },
    ]);
  });

  it("dialogue without Start (and more than one Start)", async () => {
    const none = await problemsAfter((p) => {
      p.dialogues[0]!.data.nodes = p.dialogues[0]!.data.nodes.filter((n) => n.type !== "start");
    });
    expect(summary(none)).toEqual([
      { code: "dialogue_without_start", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes", text: 'Dialogue "Shopkeeper": has no Start node, so it can never begin.' },
    ]);
    const two = await problemsAfter((p) => {
      p.dialogues[0]!.data.nodes.push({ id: "start2", type: "start", pos: [0, 0], next: null });
    });
    expect(two.map((x) => x.code)).toEqual(["dialogue_multiple_starts"]);
  });

  it.each<[string, Point[], string]>([
    ["fewer than 3 points", [[0, 0], [10, 10]], "has fewer than 3 points."],
    ["a bow-tie", [[0, 0], [10, 10], [10, 0], [0, 10]], "crosses itself."],
    ["a doubled-back edge", [[0, 0], [10, 0], [5, 0], [5, 10]], "crosses itself."],
    ["a repeated vertex", [[0, 0], [10, 0], [10, 0], [10, 10]], "crosses itself."],
    ["no area", [[0, 0], [5, 5], [10, 10]], "is flat (it has no area)."],
  ])("invalid polygon: %s", async (_name, shape, message) => {
    const problems = await problemsAfter((p) => {
      scene(p, "beach").hotspots[1]!.shape = shape;
    });
    expect(summary(problems)).toEqual([
      { code: "invalid_polygon", file: "scenes/outdoors/beach.scene.yaml", path: "hotspots.1.shape", text: `Sunny Beach › Hotspot "sea": The shape ${message}` },
    ]);
  });

  it("invalid polygon: walkable outline, holes, obstacles and regions are all checked", async () => {
    const bowtie: Point[] = [[0, 0], [10, 10], [10, 0], [0, 10]];
    const problems = await problemsAfter((p) => {
      scene(p, "beach").walkable.holes[0] = bowtie;
      scene(p, "path").objects[0]!.obstacle = bowtie;
      scene(p, "path").regions[0]!.shape = bowtie;
      scene(p, "shop").walkable.outer = bowtie;
    });
    expect(problems.map((x) => [x.code, x.location.path.join("."), x.breadcrumb])).toEqual([
      ["invalid_polygon", "walkable.holes.0", "Sunny Beach › Walkable area › Hole 1"],
      ["invalid_polygon", "objects.0.obstacle", 'Village Path › Object "boulder" › Obstacle'],
      ["invalid_polygon", "regions.0.shape", 'Village Path › Region "exit_west"'],
      ["invalid_polygon", "walkable.outer", "The Shop › Walkable area"],
    ]);
  });

  it("duplicate IDs: across asset files and within lists", async () => {
    const problems = await problemsAfter((p) => {
      p.items.push({ path: "items/old/coin.item.yaml", data: structuredClone(p.items[0]!.data) });
      p.flags!.data.flags.push({ id: "shop_visits", type: "bool", initial: false });
      scene(p, "beach").hotspots[1]!.id = "shell";
      const menu = p.dialogues[0]!.data.nodes[2]!;
      if (menu.type === "choices") menu.options[2]!.id = "buy";
    });
    expect(summary(problems)).toEqual([
      { code: "duplicate_id", file: "items/old/coin.item.yaml", path: "id", text: 'Item "gold coin": uses the ID coin, which items/coin.item.yaml already uses. IDs must be unique.' },
      { code: "duplicate_id", file: "flags.yaml", path: "flags.2.id", text: 'Flags › Flag "shop_visits": uses the ID shop_visits, which another flag or counter already uses. IDs must be unique.' },
      { code: "duplicate_id", file: "scenes/outdoors/beach.scene.yaml", path: "hotspots.1.id", text: 'Sunny Beach › Hotspot "shell": uses the ID shell, which another hotspot in this scene already uses. IDs must be unique.' },
      { code: "duplicate_id", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.2.options.2.id", text: 'Dialogue "Shopkeeper" › Node "menu" › Choice "buy": uses the ID buy, which another choice in this dialogue already uses. IDs must be unique.' },
    ]);
  });

  it("missing image file", async () => {
    const problems = await problemsAfter((p) => {
      p.files = p.files.filter((f) => f !== "assets/images/palm_img.png");
    });
    expect(summary(problems)).toEqual([
      { code: "missing_image_file", file: "assets.yaml", path: "images.3.path", text: 'Assets › Image "palm_img": points to assets/images/palm_img.png, which isn\'t in the project folder.' },
    ]);
  });

  it("all of them are blocking errors", async () => {
    const problems = await problemsAfter((p) => {
      p.game!.data.startScene = "nowhere";
    });
    expect(hasBlockingErrors(problems)).toBe(true);
    expect(hasBlockingErrors([])).toBe(false);
  });
});

describe("spec 14 acceptance: deleting an item used in 3 places", () => {
  it("produces 3 problems, each jumping to the correct spot", async () => {
    const problems = await problemsAfter((p) => {
      p.items = p.items.filter((i) => i.data.id !== "coin");
    });
    expect(summary(problems)).toEqual([
      {
        code: "missing_reference",
        file: "scenes/outdoors/beach.scene.yaml",
        path: "hotspots.0.rules.0.do.1.item",
        text: 'Sunny Beach › Hotspot "shell" › Rule 1 › Action 2: uses item coin, which doesn\'t exist.',
      },
      {
        code: "missing_reference",
        file: "dialogues/shopkeeper_chat.dialogue.yaml",
        path: "nodes.2.options.1.if.0.item",
        text: 'Dialogue "Shopkeeper" › Node "menu" › Choice "buy" › Condition 1: uses item coin, which doesn\'t exist.',
      },
      {
        code: "missing_reference",
        file: "dialogues/shopkeeper_chat.dialogue.yaml",
        path: "nodes.4.do.0.item",
        text: 'Dialogue "Shopkeeper" › Node "sell" › Action 1: uses item coin, which doesn\'t exist.',
      },
    ]);
  });
});

describe("geometry helpers", () => {
  const square: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const hole: Point[] = [[40, 40], [60, 40], [60, 60], [40, 60]];
  it("accepts simple polygons, including concave ones", () => {
    expect(polygonIssue(square)).toBe(null);
    expect(polygonIssue([[0, 0], [100, 0], [100, 100], [50, 50], [0, 100]])).toBe(null);
  });
  it("treats the outline and hole edges as walkable, hole interiors as not", () => {
    expect(inWalkable([0, 50], square, [hole])).toBe(true);
    expect(inWalkable([40, 50], square, [hole])).toBe(true);
    expect(inWalkable([50, 50], square, [hole])).toBe(false);
    expect(inWalkable([101, 50], square, [hole])).toBe(false);
  });
  it("suggests close IDs only", () => {
    expect(suggest("gold_key", ["golden_key", "lantern"])).toBe("golden_key");
    expect(suggest("cave", ["beach", "path"])).toBe(undefined);
  });
});
