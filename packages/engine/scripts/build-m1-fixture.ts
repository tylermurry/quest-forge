// Builds the hand-written M1 engine fixture (spec 15 note, D68): the project files in
// canonical form plus procedurally drawn placeholder PNGs. Internal test data only;
// not a user path (D13). Run: `corepack pnpm --filter @questforge/engine fixture`.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import {
  AssetsFile,
  CharacterFile,
  FlagsFile,
  GameFile,
  SceneFile,
  pointInPolygon,
  serialize,
  type Polygon,
} from "@questforge/schema";

const ROOT = join(import.meta.dirname, "../fixtures/m1");

// ── Tiny RGBA canvas + PNG writer (no dependencies) ─────────────────────────

type RGBA = [number, number, number, number];

class Bitmap {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h * 4);
  }
  set(x: number, y: number, c: RGBA) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data.set(c, (y * this.w + x) * 4);
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGBA) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | ((dx: number, dy: number) => RGBA)) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, typeof c === "function" ? c(dx, dy) : c);
      }
    }
  }
  polygon(poly: Polygon, c: RGBA | ((x: number, y: number) => RGBA)) {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    for (let y = Math.min(...ys); y < Math.max(...ys); y++) {
      for (let x = Math.min(...xs); x < Math.max(...xs); x++) {
        if (pointInPolygon([x + 0.5, y + 0.5], poly)) this.set(x, y, typeof c === "function" ? c(x, y) : c);
      }
    }
  }
  png(): Buffer {
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(tb));
      return Buffer.concat([len, tb, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      raw.set(this.data.subarray(y * this.w * 4, (y + 1) * this.w * 4), y * (this.w * 4 + 1) + 1);
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const mix = (a: RGBA, b: RGBA, t: number): RGBA => a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as RGBA;
const shade = (c: RGBA, k: number): RGBA => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), c[3]];
const noise = (x: number, y: number) => ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;

// ── Scene geometry ──────────────────────────────────────────────────────────

const WALKABLE: Polygon = [
  [20, 395], [620, 395], [540, 240], [360, 240], [360, 175], [470, 175], [470, 150],
  [190, 150], [190, 175], [300, 175], [300, 240], [100, 240],
];
const POND: Polygon = [[230, 300], [330, 290], [390, 320], [330, 350], [240, 345]];
const PALM_OBSTACLE: Polygon = [[58, 356], [84, 356], [84, 366], [58, 366]];
const ROCK_OBSTACLE: Polygon = [[446, 288], [504, 288], [504, 300], [446, 300]];
const BOULDER_OBSTACLE: Polygon = [[294, 222], [366, 222], [366, 248], [294, 248]];

// ── Art ─────────────────────────────────────────────────────────────────────

function gardenBackground(): Bitmap {
  const b = new Bitmap(640, 400);
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 640; x++) {
      if (y < 130) b.set(x, y, mix([110, 170, 230, 255], [200, 225, 245, 255], y / 130));
      else b.set(x, y, shade(mix([70, 120, 60, 255], [60, 150, 60, 255], (y - 130) / 270), 0.9 + noise(x, y) * 0.15));
    }
  }
  // Hills on the horizon.
  b.ellipse(120, 140, 180, 40, [80, 130, 90, 255]);
  b.ellipse(520, 145, 200, 35, [70, 120, 85, 255]);
  b.rect(0, 140, 640, 10, [70, 125, 70, 255]);
  // Walkable ground: a lighter dirt-and-grass yard with a track up to the ledge.
  b.polygon(WALKABLE, (x, y) => shade(mix([150, 135, 95, 255], [175, 160, 110, 255], (y - 150) / 245), 0.92 + noise(x, y) * 0.12));
  b.polygon(POND, (x, y) => (noise(x, y) > 0.985 ? [220, 240, 255, 255] : mix([40, 95, 175, 255], [80, 150, 215, 255], (y - 290) / 60)));
  // A low wall framing the ledge.
  b.rect(180, 138, 300, 12, [120, 110, 100, 255]);
  for (let x = 180; x < 480; x += 20) b.rect(x, 138, 1, 12, [90, 80, 75, 255]);
  return b;
}

function palm(): Bitmap {
  const b = new Bitmap(90, 330);
  for (let y = 60; y < 330; y++) {
    const cx = 45 + Math.sin(y / 60) * 6;
    for (let x = -6; x <= 6; x++) b.set(cx + x, y, shade([120, 80, 45, 255], (y % 14 < 2 ? 0.7 : 1) * (x < -3 ? 0.8 : 1)));
  }
  const frond = (ang: number) => {
    for (let t = 0; t < 1; t += 0.01) {
      const x = 45 + Math.cos(ang) * t * 44;
      const y = 62 + Math.sin(ang) * t * 34 + t * t * 26;
      b.ellipse(x, y, 5 * (1 - t) + 2, 3 * (1 - t) + 1.5, [40, 140 - t * 40, 50, 255]);
    }
  };
  for (const a of [-2.9, -2.3, -1.6, -0.9, -0.25, 0.3, 2.85]) frond(a);
  b.ellipse(45, 62, 9, 7, [60, 110, 40, 255]);
  return b;
}

const stone = (w: number, h: number, base: RGBA) => {
  const b = new Bitmap(w, h);
  b.ellipse(w / 2, h / 2 + 2, w / 2 - 1, h / 2 - 3, (dx, dy) => shade(base, 1.15 - (dx + dy) * 0.25 - noise(dx * 9, dy * 9) * 0.1));
  return b;
};

/** A walking figure: 4 frames per row; rows face down, right, up. */
function figureSheet(tunic: RGBA, hat: RGBA | null, rows: number, cols: number): Bitmap {
  const W = 32;
  const H = 48;
  const b = new Bitmap(cols * W, rows * H);
  const skin: RGBA = [240, 200, 160, 255];
  const dark: RGBA = [30, 30, 40, 255];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = col * W;
      const oy = row * H;
      const step = [0, 3, 0, -3][col % 4]!;
      // Legs (feet end at y=46, the origin row).
      b.rect(ox + 11 + (row === 1 ? step : 0), oy + 34 - Math.max(0, -step), 4, 13 + Math.max(0, -step) - (step > 0 ? 1 : 0), dark);
      b.rect(ox + 17 - (row === 1 ? step : 0), oy + 34 - Math.max(0, step), 4, 13 + Math.max(0, step) - (step < 0 ? 1 : 0), dark);
      // Body and arms.
      b.rect(ox + 9, oy + 18, 14, 17, tunic);
      b.rect(ox + 7, oy + 19 + (row === 1 ? 0 : step / 2), 3, 11, shade(tunic, 0.8));
      b.rect(ox + 22, oy + 19 - (row === 1 ? 0 : step / 2), 3, 11, shade(tunic, 0.8));
      // Head.
      b.ellipse(ox + 16, oy + 11, 7, 7, row === 2 ? [90, 60, 30, 255] : skin);
      if (row === 0) {
        b.set(ox + 13, oy + 11, dark);
        b.set(ox + 18, oy + 11, dark);
      } else if (row === 1) {
        // Facing right: eye and nose on the right, so mirroring is visible.
        b.set(ox + 19, oy + 10, dark);
        b.rect(ox + 23, oy + 11, 2, 2, shade(skin, 0.85));
        b.ellipse(ox + 12, oy + 9, 4, 5, [90, 60, 30, 255]);
      }
      if (hat) b.rect(ox + 7, oy + 3, 18, 3, hat);
    }
  }
  return b;
}

// ── Project data ────────────────────────────────────────────────────────────

const look = (text: string) => ({ when: { type: "look" as const }, if: [], do: [{ type: "narrate" as const, text }], once: false });
const anim = (image: string, frames: number[], fps = 8) => ({ image, frames, fps, loop: true });

const game = GameFile.parse({
  schemaVersion: 1,
  id: "m1_fixture",
  title: "M1 Engine Fixture",
  version: 1,
  startScene: "garden",
  startSpawn: "default",
  player: "hero",
  maxScore: 0,
  defaultResponses: {
    look: "You see nothing special.",
    hand: "You can't do that.",
    talk: "Nobody answers.",
    use_item: "That doesn't work.",
    combine: "Those don't go together.",
  },
  rules: [],
});

const flags = FlagsFile.parse({ schemaVersion: 1, flags: [] });

const sheet = (columns: number, rows: number) => ({ columns, rows, cellWidth: 32, cellHeight: 48 });
const assets = AssetsFile.parse({
  schemaVersion: 1,
  images: [
    { id: "garden_bg", path: "assets/images/garden_bg.png" },
    { id: "palm_img", path: "assets/images/palm.png" },
    { id: "rock_img", path: "assets/images/rock.png" },
    { id: "boulder_img", path: "assets/images/boulder.png" },
    { id: "hero_sheet", path: "assets/images/characters/hero_sheet.png", sheet: sheet(4, 3), origin: [16, 47] },
    { id: "gardener_sheet", path: "assets/images/characters/gardener_sheet.png", sheet: sheet(4, 1) },
  ],
  audio: [],
});

const hero = CharacterFile.parse({
  schemaVersion: 1,
  id: "hero",
  name: "Hero",
  textColor: "#ffffff",
  walkSpeed: 90,
  mirrorLeft: true,
  animations: {
    idle_down: anim("hero_sheet", [0], 1),
    idle_up: anim("hero_sheet", [8], 1),
    idle_right: anim("hero_sheet", [4], 1),
    walk_down: anim("hero_sheet", [0, 1, 2, 3]),
    walk_up: anim("hero_sheet", [8, 9, 10, 11]),
    walk_right: anim("hero_sheet", [4, 5, 6, 7]),
  },
});

const npc = (id: string, name: string) =>
  CharacterFile.parse({
    schemaVersion: 1,
    id,
    name,
    textColor: "#88cc88",
    walkSpeed: 60,
    mirrorLeft: true,
    // Idle only: talk/walk slots fall back (spec 05).
    animations: { idle_down: anim("gardener_sheet", [0, 0, 0, 1], 2) },
  });

const garden = SceneFile.parse({
  schemaVersion: 1,
  id: "garden",
  name: "Garden",
  background: "garden_bg",
  depth: { far: { y: 150, scale: 0.35 }, near: { y: 395, scale: 1 } },
  walkable: { outer: WALKABLE, holes: [POND] },
  spawns: { default: { x: 200, y: 380, facing: "up" } },
  objects: [
    { id: "boulder", name: "boulder", image: "boulder_img", x: 288, y: 186, baseline: 248, visible: true, obstacle: BOULDER_OBSTACLE, rules: [look("A huge boulder blocks the narrow path.")] },
    { id: "rock", name: "rock", image: "rock_img", x: 440, y: 262, baseline: 296, visible: true, obstacle: ROCK_OBSTACLE, rules: [look("A mossy rock.")] },
    { id: "palm", name: "palm tree", image: "palm_img", x: 20, y: 40, baseline: 362, visible: true, obstacle: PALM_OBSTACLE, rules: [look("A palm tree, swaying gently.")] },
  ],
  characters: [{ character: "gardener", x: 560, y: 360, facing: "left", visible: true, rules: [look("The gardener is busy pulling weeds.")] }],
  hotspots: [
    { id: "pond", name: "pond", shape: POND, walkTo: { x: 300, y: 372, facing: "up" }, rules: [look("A still pond. Tiny fish dart about.")] },
    { id: "sky", name: "sky", shape: [[0, 0], [640, 0], [640, 120], [0, 120]], rules: [] },
  ],
  regions: [],
  rules: [],
});

// 15 objects and 3 characters for the spec 03 frame-rate check.
const stressObjects = Array.from({ length: 15 }, (_, i) => {
  const kind = (["rock", "boulder", "palm"] as const)[i % 3]!;
  const col = i % 5;
  const row = Math.floor(i / 5);
  return {
    id: `${kind}_${i}`,
    name: kind,
    image: `${kind}_img`,
    x: 30 + col * 120 + row * 20,
    y: kind === "palm" ? -40 + row * 60 : 200 + row * 60,
    visible: true,
    rules: [],
  };
});
const stress = SceneFile.parse({
  ...garden,
  id: "stress",
  name: "Stress test",
  walkable: { outer: WALKABLE, holes: [] },
  objects: stressObjects,
  characters: [
    { character: "gardener", x: 560, y: 360, facing: "left", visible: true, rules: [] },
    { character: "visitor", x: 140, y: 300, facing: "right", visible: true, rules: [] },
  ],
  hotspots: [],
});

const files: Record<string, string | Buffer> = {
  "game.yaml": serialize(game),
  "flags.yaml": serialize(flags),
  "assets.yaml": serialize(assets),
  "characters/hero.character.yaml": serialize(hero),
  "characters/gardener.character.yaml": serialize(npc("gardener", "Gardener")),
  "characters/visitor.character.yaml": serialize(npc("visitor", "Visitor")),
  "scenes/garden.scene.yaml": serialize(garden),
  "scenes/stress.scene.yaml": serialize(stress),
  "assets/images/garden_bg.png": gardenBackground().png(),
  "assets/images/palm.png": palm().png(),
  "assets/images/rock.png": stone(70, 40, [130, 135, 125, 255]).png(),
  "assets/images/boulder.png": stone(84, 64, [140, 120, 100, 255]).png(),
  "assets/images/characters/hero_sheet.png": figureSheet([190, 40, 40, 255], null, 3, 4).png(),
  "assets/images/characters/gardener_sheet.png": figureSheet([60, 130, 60, 255], [200, 170, 80, 255], 1, 4).png(),
};

await rm(ROOT, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  const full = join(ROOT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}
console.log(`Wrote ${Object.keys(files).length} files to ${ROOT}`);
