import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DialogueFile, SceneFile } from "../src/index.ts";

// An example scene, filled in, with asset IDs and placed characters.
const beachYaml = `
schemaVersion: 2
id: beach
name: Sunny Beach
background: beach_bg
music: beach_theme
depth: { far: { y: 180, scale: 0.4 }, near: { y: 390, scale: 1.0 } }
walkable:
  outer: [[0, 250], [640, 250], [640, 400], [0, 400]]
  holes: [[[300, 300], [360, 300], [360, 340], [300, 340]]]
spawns:
  default: { x: 320, y: 360, facing: down }
  from_path: { x: 600, y: 300, facing: left }
objects:
  - { id: palm, image: palm_img, x: 40, y: 0, baseline: 300, visible: true, rules: [] }
  - id: rock
    name: big rock
    image: rock_img
    x: 300
    y: 280
    visible: true
    obstacle: [[300, 300], [360, 300], [360, 340]]
    rules:
      - { id: rule_1, when: { type: look }, if: [], do: [{ type: narrate, text: "A big rock." }], once: false }
characters:
  - { character: fisherman, x: 100, y: 330, facing: right, visible: true, rules: [] }
hotspots:
  - id: shell
    name: seashell
    shape: [[200, 350], [220, 350], [220, 365], [200, 365]]
    walkTo: { x: 210, y: 375, facing: up }
    rules:
      - id: rule_1
        when: { type: hand }
        if: [{ type: first_time }]
        do:
          - { type: narrate, text: "Under the shell you find a coin!" }
          - { type: give_item, item: coin }
          - { type: award_points, points: 2, award: found_coin }
        once: true
      - { id: rule_2, when: { type: look }, if: [], do: [{ type: narrate, text: "A pretty seashell." }], once: false }
regions:
  - id: exit_north
    shape: [[580, 250], [640, 250], [640, 290], [580, 290]]
    rules:
      - { id: rule_1, when: { type: enter_region }, if: [], do: [{ type: change_scene, scene: path, spawn: from_beach }], once: false }
rules:
  - { id: rule_1, when: { type: scene_enter }, if: [], do: [{ type: play_music, music: beach_theme }], once: false }
`;

const shopDialogueYaml = `
schemaVersion: 2
id: shopkeeper_chat
name: Shopkeeper
nodes:
  - { id: start, type: start, pos: [0, 0], next: hello }
  - { id: hello, type: line, character: shopkeeper, text: "Welcome!", pos: [0, 100], next: menu }
  - id: menu
    type: choices
    pos: [0, 200]
    options:
      - { id: ask_cave, text: "What's in the cave?", if: [], once: true, next: cave_answer }
      - { id: buy, text: "I'd like the lantern.", if: [{ type: has_item, item: coin }], once: false, next: sell }
      - { id: bye, text: "Goodbye.", if: [], once: false, next: done }
  - { id: cave_answer, type: line, character: shopkeeper, text: "Darkness. Bring light.", pos: [-200, 300], next: menu }
  - id: sell
    type: actions
    pos: [0, 300]
    do: [{ type: take_item, item: coin }, { type: give_item, item: lantern }]
    next: menu
  - { id: check, type: branch, pos: [200, 300], if: [{ type: has_item, item: lantern }], then: done, else: null }
  - { id: done, type: end, pos: [200, 400] }
`;

describe("scene schema", () => {
  it("parses the example scene", () => {
    const scene = SceneFile.parse(parse(beachYaml));
    expect(scene.objects.map((o) => o.id)).toEqual(["palm", "rock"]);
    expect(Object.keys(scene.spawns)).toEqual(["default", "from_path"]);
    expect(scene.hotspots[0]?.rules).toHaveLength(2);
  });

  it("rejects scene-level triggers on hotspots and verbs on regions", () => {
    const scene = parse(beachYaml);
    scene.hotspots[0].rules[0].when = { type: "scene_enter" };
    expect(SceneFile.safeParse(scene).success).toBe(false);
    const scene2 = parse(beachYaml);
    scene2.regions[0].rules[0].when = { type: "look" };
    expect(SceneFile.safeParse(scene2).success).toBe(false);
  });

  it("rejects path-valued backgrounds and invalid spawn IDs", () => {
    expect(SceneFile.safeParse({ ...parse(beachYaml), background: "assets/images/beach.png" }).success).toBe(false);
    const scene = parse(beachYaml);
    scene.spawns["From Path"] = scene.spawns.from_path;
    expect(SceneFile.safeParse(scene).success).toBe(false);
  });

  it("rejects out-of-range geometry", () => {
    const scene = parse(beachYaml);
    scene.walkable.outer[0] = [0, 401];
    expect(SceneFile.safeParse(scene).success).toBe(false);
  });
});

describe("dialogue schema", () => {
  it("parses a shopkeeper conversation with gated and once-only choices", () => {
    const d = DialogueFile.parse(parse(shopDialogueYaml));
    const menu = d.nodes.find((n) => n.id === "menu");
    expect(menu?.type).toBe("choices");
    if (menu?.type === "choices") {
      expect(menu.options.map((o) => o.once)).toEqual([true, false, false]);
      expect(menu.options[1]?.if).toEqual([{ type: "has_item", item: "coin" }]);
    }
  });

  it("allows a narrator line (no character) and unconnected ports", () => {
    const d = parse(shopDialogueYaml);
    delete d.nodes[1].character;
    d.nodes[1].next = null;
    expect(DialogueFile.safeParse(d).success).toBe(true);
  });

  it("rejects unknown node types and missing ports", () => {
    const d = parse(shopDialogueYaml);
    d.nodes[0].type = "jump";
    expect(DialogueFile.safeParse(d).success).toBe(false);
    const d2 = parse(shopDialogueYaml);
    delete d2.nodes[0].next;
    expect(DialogueFile.safeParse(d2).success).toBe(false);
  });
});
