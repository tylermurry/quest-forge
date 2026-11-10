import { CharacterFile, DialogueFile, FlagsFile, GameFile, ItemFile, SceneFile, emptyProject, type ImageAsset, type Project } from "@questforge/schema";
import type { LoadedImage } from "../../src/world.ts";

// A small in-memory project for headless session tests. Parsed with the real
// schemas so it can't drift from the on-disk shapes.

type Raw = Record<string, unknown>;

/** Rule IDs only need to be unique within a list; a counter makes them unique everywhere. */
let nextRuleId = 0;
export const rule = (when: Raw, actions: Raw[], cond: Raw[] = [], once = false) => ({ id: `rule_${++nextRuleId}`, when, if: cond, do: actions, once });
export const narrate = (text: string) => ({ type: "narrate", text });

const anim = (frames: number[]) => ({ image: "hero_sheet", frames, fps: 8, loop: true });

export function testProject(over: { game?: Raw; yard?: Raw; shed?: Raw; dialogues?: Raw[] } = {}): Project {
  const game = GameFile.parse({
    schemaVersion: 2,
    id: "t",
    title: "T",
    version: 1,
    startScene: "yard",
    startSpawn: "default",
    player: "hero",
    maxScore: 20,
    defaultResponses: { look: "Nothing special.", hand: "You can't.", talk: "Nobody answers.", use_item: "That won't work.", combine: "They don't fit." },
    rules: [],
    ...over.game,
  });
  const flags = FlagsFile.parse({ schemaVersion: 2, flags: [{ id: "open", type: "bool", initial: false }, { id: "n", type: "counter", initial: 0 }] });
  const hero = CharacterFile.parse({
    schemaVersion: 2,
    id: "hero",
    name: "Hero",
    textColor: "#ffffff",
    walkSpeed: 100,
    mirrorLeft: true,
    animations: { idle_down: anim([0]), walk_down: anim([0, 1, 2, 3]), walk_right: anim([4, 5, 6, 7]), idle_right: anim([4]) },
  });
  const gardener = CharacterFile.parse({ ...hero, id: "gardener", name: "Gardener", textColor: "#88cc88" });
  const base = {
    schemaVersion: 2,
    background: "bg",
    depth: { far: { y: 200, scale: 1 }, near: { y: 400, scale: 1 } },
    walkable: { outer: [[0, 200], [640, 200], [640, 400], [0, 400]], holes: [] },
    objects: [],
    characters: [],
    hotspots: [],
    regions: [],
    rules: [],
  };
  const yard = SceneFile.parse({
    ...base,
    id: "yard",
    name: "Yard",
    spawns: { default: { x: 100, y: 380, facing: "up" }, from_shed: { x: 600, y: 300, facing: "left" } },
    objects: [
      { id: "rock", name: "rock", image: "rock_img", x: 200, y: 200, visible: true, rules: [] },
      { id: "boulder", image: "rock_img", x: 400, y: 200, visible: true, obstacle: [[380, 240], [460, 240], [460, 260], [380, 260]], rules: [] },
    ],
    characters: [{ character: "gardener", x: 500, y: 380, facing: "left", visible: true, rules: [] }],
    hotspots: [{ id: "pot", name: "flowerpot", shape: [[300, 300], [340, 300], [340, 340], [300, 340]], walkTo: { x: 320, y: 360, facing: "up" }, rules: [] }],
    ...over.yard,
  });
  const shed = SceneFile.parse({ ...base, id: "shed", name: "Shed", spawns: { door: { x: 50, y: 380, facing: "right" } }, ...over.shed });
  const item = (id: string, name: string) => ItemFile.parse({ schemaVersion: 2, id, name, description: `A ${name}.`, icon: `${id}_icon` });

  const p = emptyProject();
  p.game = { path: "game.yaml", data: game };
  p.flags = { path: "flags.yaml", data: flags };
  p.scenes = [yard, shed].map((s) => ({ path: `scenes/${s.id}.scene.yaml`, data: s }));
  p.characters = [hero, gardener].map((c) => ({ path: `characters/${c.id}.character.yaml`, data: c }));
  p.items = [item("key", "key"), item("stick", "stick"), item("string", "string"), item("rod", "fishing rod")].map((i) => ({ path: `items/${i.id}.item.yaml`, data: i }));
  p.dialogues = (over.dialogues ?? []).map((d) => {
    const data = DialogueFile.parse({ schemaVersion: 2, name: "Chat", ...d });
    return { path: `dialogues/${data.id}.dialogue.yaml`, data };
  });
  return p;
}

const img = (asset: ImageAsset, w: number, h: number): LoadedImage => ({ asset, size: { w, h } });
const images = new Map<string, LoadedImage>([
  ["hero_sheet", img({ id: "hero_sheet", path: "assets/h.png", sheet: { columns: 4, rows: 2, cellWidth: 32, cellHeight: 48 } }, 128, 96)],
  ["rock_img", img({ id: "rock_img", path: "assets/r.png" }, 60, 40)],
  ["torch_sheet", img({ id: "torch_sheet", path: "assets/t.png", sheet: { columns: 4, rows: 2, cellWidth: 16, cellHeight: 24 } }, 64, 48)],
]);
export const testImages = (id: string) => images.get(id);
