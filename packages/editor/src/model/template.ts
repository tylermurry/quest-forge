// New projects (spec 08, D87). "Blank" is the smallest project that validates and
// plays; the demo template arrives with M9.
import {
  AssetsFile,
  CharacterFile,
  FlagsFile,
  GameFile,
  SCHEMA_VERSION,
  SceneFile,
  emptyProject,
  saveProject,
  type Project,
  type ProjectFs,
} from "@questforge/schema";
import { slugify } from "./commands.ts";
import { Bitmap, type RGBA } from "./png.ts";

/** A folder name made from a title: no path separators or reserved characters, not hidden. */
export function folderNameFor(title: string): string {
  const name = title
    .replace(/[/\\:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80)
    .trim();
  return name || "Untitled game";
}

function background(): Uint8Array {
  const bmp = new Bitmap(640, 400);
  const sky: RGBA = [86, 132, 196, 255];
  const ground: RGBA = [92, 140, 72, 255];
  bmp.fill(0, 0, 640, 200, sky);
  bmp.fill(0, 200, 640, 200, ground);
  bmp.fill(0, 198, 640, 4, [70, 110, 56, 255]);
  return bmp.png();
}

/** A 32×48 stand-in hero: one frame. */
function playerSprite(): Uint8Array {
  const bmp = new Bitmap(32, 48);
  bmp.fill(11, 2, 10, 10, [240, 200, 160, 255]); // head
  bmp.fill(8, 12, 16, 20, [200, 60, 60, 255]); // body
  bmp.fill(9, 32, 6, 14, [60, 60, 120, 255]); // legs
  bmp.fill(17, 32, 6, 14, [60, 60, 120, 255]);
  return bmp.png();
}

/** The blank project in memory; saving it writes every file through the canonical serializer (D54). */
export function blankProject(title: string): Project {
  const p = emptyProject();
  const id = slugify(title, "game");
  p.game = {
    path: "game.yaml",
    data: GameFile.parse({
      schemaVersion: SCHEMA_VERSION,
      id,
      title: title.trim() || "Untitled game",
      version: 1,
      startScene: "first_scene",
      startSpawn: "default",
      player: "player",
      maxScore: 0,
      defaultResponses: {
        look: "You see nothing special.",
        hand: "You can't do that.",
        talk: "Nobody answers.",
        use_item: "That doesn't work.",
        combine: "Those don't go together.",
      },
      rules: [],
    }),
  };
  p.flags = { path: "flags.yaml", data: FlagsFile.parse({ schemaVersion: SCHEMA_VERSION, flags: [] }) };
  p.assets = {
    path: "assets.yaml",
    data: AssetsFile.parse({
      schemaVersion: SCHEMA_VERSION,
      images: [
        { id: "first_scene_bg", path: "assets/images/first_scene_bg.png" },
        { id: "player_sprite", path: "assets/images/player_sprite.png" },
      ],
      audio: [],
    }),
  };
  p.pendingFiles = { "assets/images/first_scene_bg.png": background(), "assets/images/player_sprite.png": playerSprite() };
  p.scenes = [
    {
      path: "scenes/first_scene.scene.yaml",
      data: SceneFile.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "first_scene",
        name: "First Scene",
        background: "first_scene_bg",
        depth: { far: { y: 200, scale: 0.5 }, near: { y: 400, scale: 1 } },
        walkable: { outer: [[0, 200], [640, 200], [640, 400], [0, 400]], holes: [] },
        spawns: { default: { x: 320, y: 360, facing: "down" } },
        objects: [],
        characters: [],
        hotspots: [],
        regions: [],
        rules: [],
      }),
    },
  ];
  p.characters = [
    {
      path: "characters/player.character.yaml",
      data: CharacterFile.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "player",
        name: "Player",
        textColor: "#ffffff",
        walkSpeed: 80,
        mirrorLeft: true,
        animations: { idle_down: { image: "player_sprite", frames: [0], fps: 1, loop: true } },
      }),
    },
  ];
  return p;
}

/** Writes a blank project into an empty folder. */
export async function createBlankProject(fs: ProjectFs, title: string): Promise<void> {
  await saveProject(fs, blankProject(title));
  await fs.writeText(".gitignore", ".editor/\n");
}
