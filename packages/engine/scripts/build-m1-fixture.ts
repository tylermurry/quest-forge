// Builds the hand-written engine fixture (spec 15 note, D68): the project files in
// canonical form plus procedurally drawn placeholder PNGs. Internal test data only;
// not a user path (D13). Run: `corepack pnpm --filter @questforge/engine fixture`.
//
// M2 puzzle chain (exercises spec 02): Hand the flowerpot → stick. Walk east into
// the shed (region exit), take the string. Combine stick + string → fishing rod.
// Use the rod on the pond → fish. Talk to the gardener while holding the fish
// (gated rule) → a sequence that rolls the boulder away and opens the ledge.
//
// M7 shop (spec 11 acceptance): Hand the workbench → a coin. Talk to the visitor in
// the shed → the shop dialogue: a once-only question, buying the lantern only while
// you have the coin, and a loop back to the menu.
//
// M8 (spec 07): each scene has its own music loop, picking things up plays a
// sound, and grabbing the saw in the shed is a death (Restore · Restart · Try again).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import {
  AssetsFile,
  CharacterFile,
  DialogueFile,
  FlagsFile,
  GameFile,
  ItemFile,
  SCHEMA_VERSION,
  SceneFile,
  pointInPolygon,
  withRuleIds,
  serialize,
  type Polygon,
} from "@questforge/schema";

const ROOT = join(import.meta.dirname, "../fixtures/m1");

// ── Tiny WAV writer (8-bit mono PCM, no dependencies) ───────────────────────

const RATE = 11025;

/** Notes as [frequency Hz, beats]; 0 Hz is a rest. A soft square-ish tone with a short fade per note. */
function wav(notes: [number, number][], beat: number, volume = 0.25): Buffer {
  const samples: number[] = [];
  for (const [f, beats] of notes) {
    const n = Math.round(beats * beat * RATE);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 200, (n - i) / 400);
      const t = i / RATE;
      const v = f === 0 ? 0 : (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(6 * Math.PI * f * t)) * env * volume;
      samples.push(Math.max(0, Math.min(255, Math.round(128 + v * 127))));
    }
  }
  const data = Buffer.from(samples);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE, 28); // bytes per second
  h.writeUInt16LE(1, 32); // block align
  h.writeUInt16LE(8, 34); // bits per sample
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const [C4, D4, E4, F4, G4, A4, B4, C5, E5] = [262, 294, 330, 349, 392, 440, 494, 523, 659];
const gardenTheme = () => wav([[C4, 1], [E4, 1], [G4, 1], [E4, 1], [F4, 1], [A4, 1], [G4, 2], [E4, 1], [D4, 1], [C4, 2], [0, 2]], 0.3);
const shedTheme = () => wav([[A4 / 2, 2], [C4, 2], [E4, 2], [D4, 2], [A4 / 2, 2], [B4 / 2, 2], [C4, 4]], 0.35, 0.2);
const pickup = () => wav([[C5, 0.5], [E5, 1]], 0.08, 0.35);

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

const SHED_WALKABLE: Polygon = [[20, 395], [620, 395], [560, 250], [80, 250]];

function shedBackground(): Bitmap {
  const b = new Bitmap(640, 400);
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 640; x++) {
      // Plank walls above, floorboards below.
      const plank = y < 250 ? (x % 48 < 2 ? 0.7 : 1) : (y % 18 < 2 ? 0.75 : 1);
      const base: RGBA = y < 250 ? [120, 85, 55, 255] : [150, 110, 70, 255];
      b.set(x, y, shade(base, plank * (0.92 + noise(x, y) * 0.12)));
    }
  }
  // A window with daylight.
  b.rect(260, 60, 120, 80, [90, 70, 50, 255]);
  b.rect(266, 66, 108, 68, [170, 210, 240, 255]);
  b.rect(318, 66, 4, 68, [90, 70, 50, 255]);
  // The door on the left wall.
  b.rect(10, 150, 60, 110, [80, 55, 35, 255]);
  b.rect(16, 156, 48, 98, [100, 70, 45, 255]);
  return b;
}

function flowerpot(): Bitmap {
  const b = new Bitmap(30, 30);
  b.polygon([[3, 8], [27, 8], [23, 30], [7, 30]], (x, y) => shade([190, 95, 55, 255], 1 - (x - 3) / 60 - (y < 12 ? 0.1 : 0)));
  b.rect(1, 6, 28, 4, [210, 110, 65, 255]);
  b.ellipse(15, 6, 10, 3, [80, 55, 35, 255]);
  b.ellipse(12, 2, 3, 3, [60, 150, 60, 255]);
  b.ellipse(18, 3, 3, 2.5, [70, 160, 70, 255]);
  return b;
}

function workbench(): Bitmap {
  const b = new Bitmap(160, 70);
  b.rect(0, 0, 160, 12, [110, 75, 45, 255]);
  b.rect(0, 10, 160, 3, [80, 55, 35, 255]);
  for (const x of [6, 146]) b.rect(x, 12, 8, 58, [90, 60, 38, 255]);
  b.rect(10, 50, 140, 5, [90, 60, 38, 255]);
  return b;
}

/** A coil of string (also its item icon, smaller). */
function stringCoil(size: number): Bitmap {
  const b = new Bitmap(size, size);
  const c = size / 2;
  for (let r = size * 0.42; r > size * 0.12; r -= Math.max(1.5, size / 12)) {
    for (let a = 0; a < Math.PI * 2; a += 0.02) b.set(c + Math.cos(a) * r, c + Math.sin(a) * r * 0.7, [235, 225, 190, 255]);
  }
  return b;
}

function iconStick(): Bitmap {
  const b = new Bitmap(24, 24);
  for (let t = 0; t < 1; t += 0.01) b.ellipse(3 + t * 18, 21 - t * 18, 1.6, 1.6, [130, 85, 45, 255]);
  b.ellipse(14, 12, 2, 1, [80, 140, 60, 255]);
  return b;
}

function iconRod(): Bitmap {
  const b = new Bitmap(24, 24);
  for (let t = 0; t < 1; t += 0.01) b.ellipse(2 + t * 16, 22 - t * 18, 1.3, 1.3, [130, 85, 45, 255]);
  for (let y = 4; y < 20; y++) b.set(19 + Math.sin(y / 3), y, [235, 225, 190, 255]);
  b.ellipse(19, 20, 1.5, 1.5, [200, 60, 60, 255]);
  return b;
}

function iconFish(): Bitmap {
  const b = new Bitmap(24, 24);
  b.ellipse(10, 12, 8, 5, (dx, dy) => shade([120, 160, 200, 255], 1.1 - dy * 0.3 + dx * 0.05));
  b.polygon([[17, 12], [23, 6], [23, 18]], [100, 140, 180, 255]);
  b.set(6, 11, [20, 20, 30, 255]);
  return b;
}

function iconCoin(): Bitmap {
  const b = new Bitmap(24, 24);
  b.ellipse(12, 12, 8, 8, (dx, dy) => shade([220, 180, 60, 255], 1.15 - dy * 0.3 - dx * 0.1));
  b.ellipse(12, 12, 4, 4, [190, 150, 40, 255]);
  return b;
}

function iconLantern(): Bitmap {
  const b = new Bitmap(24, 24);
  b.polygon([[8, 7], [16, 7], [17, 20], [7, 20]], [60, 60, 70, 255]);
  b.ellipse(12, 14, 3, 4, [250, 210, 90, 255]);
  b.ellipse(12, 4, 3, 2, [60, 60, 70, 255]);
  return b;
}

// ── Project data ────────────────────────────────────────────────────────────

const look = (text: string) => ({ when: { type: "look" as const }, if: [], do: [{ type: "narrate" as const, text }], once: false });
type Raw = Record<string, unknown>;
const rule = (when: Raw, actions: Raw[], cond: Raw[] = [], once = false) => ({ when, if: cond, do: actions, once });
const narrate = (text: string) => ({ type: "narrate", text });
const say = (character: string, text: string) => ({ type: "say", character, text });
const anim = (image: string, frames: number[], fps = 8) => ({ image, frames, fps, loop: true });

const game = GameFile.parse(withRuleIds({
  schemaVersion: SCHEMA_VERSION,
  id: "m1_fixture",
  title: "M1 Engine Fixture",
  version: 1,
  startScene: "garden",
  startSpawn: "default",
  player: "hero",
  maxScore: 25,
  defaultResponses: {
    look: "You see nothing special.",
    hand: "You can't do that.",
    talk: "Nobody answers.",
    use_item: "That doesn't work.",
    combine: "Those don't go together.",
  },
  rules: [
    rule({ type: "combine", item: "stick", with: "string" }, [
      { type: "take_item", item: "stick" },
      { type: "take_item", item: "string" },
      { type: "give_item", item: "rod" },
      narrate("You tie the string to the stick. A fishing rod!"),
    ]),
  ],
}));

const flags = FlagsFile.parse({ schemaVersion: SCHEMA_VERSION, flags: [{ id: "path_open", type: "bool", initial: false }] });

const item = (id: string, name: string, description: string) => ItemFile.parse({ schemaVersion: SCHEMA_VERSION, id, name, description, icon: `${id}_icon` });
const items = [
  item("stick", "stick", "A straight, springy stick."),
  item("string", "string", "A coil of garden string."),
  item("rod", "fishing rod", "A stick with a string tied to it. Crude, but it might work."),
  item("fish", "fish", "A small, wriggling fish."),
  item("coin", "coin", "A worn copper coin."),
  item("lantern", "lantern", "A little oil lantern."),
];

const sheet = (columns: number, rows: number) => ({ columns, rows, cellWidth: 32, cellHeight: 48 });
const assets = AssetsFile.parse({
  schemaVersion: SCHEMA_VERSION,
  images: [
    { id: "garden_bg", path: "assets/images/garden_bg.png" },
    { id: "palm_img", path: "assets/images/palm.png" },
    { id: "rock_img", path: "assets/images/rock.png" },
    { id: "boulder_img", path: "assets/images/boulder.png" },
    { id: "hero_sheet", path: "assets/images/characters/hero_sheet.png", sheet: sheet(4, 3), origin: [16, 47] },
    { id: "gardener_sheet", path: "assets/images/characters/gardener_sheet.png", sheet: sheet(4, 1) },
    { id: "shed_bg", path: "assets/images/shed_bg.png" },
    { id: "flowerpot_img", path: "assets/images/flowerpot.png" },
    { id: "workbench_img", path: "assets/images/workbench.png" },
    { id: "string_img", path: "assets/images/string.png" },
    ...items.map((i) => ({ id: i.icon, path: `assets/images/items/${i.id}.png` })),
  ],
  audio: [
    { id: "garden_theme", path: "assets/audio/garden_theme.wav" },
    { id: "shed_theme", path: "assets/audio/shed_theme.wav" },
    { id: "pickup", path: "assets/audio/pickup.wav" },
  ],
});

const hero = CharacterFile.parse({
  schemaVersion: SCHEMA_VERSION,
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
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    textColor: "#88cc88",
    walkSpeed: 60,
    mirrorLeft: true,
    // Idle only: talk/walk slots fall back (spec 05).
    animations: { idle_down: anim("gardener_sheet", [0, 0, 0, 1], 2) },
  });

const garden = SceneFile.parse(withRuleIds({
  schemaVersion: SCHEMA_VERSION,
  id: "garden",
  name: "Garden",
  background: "garden_bg",
  music: "garden_theme",
  depth: { far: { y: 150, scale: 0.35 }, near: { y: 395, scale: 1 } },
  walkable: { outer: WALKABLE, holes: [POND] },
  spawns: { default: { x: 200, y: 380, facing: "up" }, from_shed: { x: 555, y: 370, facing: "left" } },
  objects: [
    { id: "boulder", name: "boulder", image: "boulder_img", x: 288, y: 186, baseline: 248, visible: true, obstacle: BOULDER_OBSTACLE, rules: [look("A huge boulder blocks the narrow path.")] },
    {
      id: "flowerpot",
      name: "flowerpot",
      image: "flowerpot_img",
      x: 140,
      y: 290,
      baseline: 318,
      visible: true,
      obstacle: [[142, 312], [168, 312], [168, 319], [142, 319]],
      rules: [
        rule({ type: "hand" }, [narrate("You tip the pot. Underneath is a straight, springy stick."), { type: "play_sound", sound: "pickup" }, { type: "give_item", item: "stick" }, { type: "award_points", points: 5, award: "found_stick" }], [], true),
        rule({ type: "hand" }, [narrate("Nothing else under there.")]),
        look("A terracotta flowerpot with a sprig of something green."),
      ],
    },
    { id: "rock", name: "rock", image: "rock_img", x: 440, y: 262, baseline: 296, visible: true, obstacle: ROCK_OBSTACLE, rules: [look("A mossy rock.")] },
    { id: "palm", name: "palm tree", image: "palm_img", x: 20, y: 40, baseline: 362, visible: true, obstacle: PALM_OBSTACLE, rules: [look("A palm tree, swaying gently.")] },
  ],
  characters: [
    {
      character: "gardener",
      x: 560,
      y: 330,
      facing: "left",
      visible: true,
      rules: [
        look("The gardener is busy pulling weeds."),
        // Gated on the fish: the M2 end-to-end sequence.
        rule({ type: "talk" }, [
          say("gardener", "A fish! For my supper? You're too kind."),
          { type: "take_item", item: "fish" },
          { type: "award_points", points: 10, award: "fed_gardener" },
          say("gardener", "Let me get that boulder out of your way."),
          { type: "walk_player_to", x: 250, y: 370 },
          { type: "face", facing: "up" },
          { type: "set_character_position", character: "gardener", scene: "garden", x: 372, y: 262, facing: "left" },
          { type: "wait", seconds: 1 },
          { type: "hide_object", scene: "garden", object: "boulder" },
          { type: "set_flag", flag: "path_open", value: true },
          narrate("With a grunt, the gardener rolls the boulder aside. The path to the ledge is open."),
        ], [{ type: "has_item", item: "fish" }]),
        rule({ type: "talk" }, [say("gardener", "I'm too busy to talk. Unless you've got something for my supper?")], [{ type: "first_time" }]),
        rule({ type: "use_item", item: "fish" }, [say("gardener", "Don't wave it at me. Just tell me about it!")]),
        rule({ type: "talk" }, [say("gardener", "Still no fish? The pond is full of them.")], [{ type: "flag_is", flag: "path_open", value: false }]),
        rule({ type: "talk" }, [say("gardener", "Enjoy the view from the ledge!")]),
      ],
    },
  ],
  hotspots: [
    {
      id: "pond",
      name: "pond",
      shape: POND,
      walkTo: { x: 300, y: 372, facing: "up" },
      rules: [
        look("A still pond. Tiny fish dart about."),
        rule({ type: "use_item", item: "rod" }, [narrate("You dangle the string in the water. Something bites! You pull out a small fish."), { type: "give_item", item: "fish" }, { type: "award_points", points: 5, award: "caught_fish" }], [], true),
        rule({ type: "use_item", item: "rod" }, [narrate("One fish is plenty.")]),
        rule({ type: "hand" }, [narrate("The fish are far too quick for your hands.")]),
      ],
    },
    { id: "sky", name: "sky", shape: [[0, 0], [640, 0], [640, 120], [0, 120]], rules: [look("A clear blue sky.")] },
  ],
  regions: [
    { id: "exit_shed", shape: [[590, 330], [640, 330], [640, 400], [590, 400]], rules: [rule({ type: "enter_region" }, [{ type: "change_scene", scene: "shed", spawn: "door" }])] },
    { id: "ledge", shape: [[190, 150], [470, 150], [470, 176], [190, 176]], rules: [rule({ type: "enter_region" }, [narrate("From the ledge you can see the whole valley."), { type: "award_points", points: 5, award: "saw_view" }], [], true)] },
  ],
  rules: [],
}));

const shed = SceneFile.parse(withRuleIds({
  schemaVersion: SCHEMA_VERSION,
  id: "shed",
  name: "Garden shed",
  background: "shed_bg",
  music: "shed_theme",
  depth: { far: { y: 250, scale: 0.8 }, near: { y: 395, scale: 1.1 } },
  walkable: { outer: SHED_WALKABLE, holes: [] },
  spawns: { door: { x: 100, y: 370, facing: "right" } },
  objects: [
    {
      id: "workbench",
      name: "workbench",
      image: "workbench_img",
      x: 400,
      y: 200,
      baseline: 268,
      visible: true,
      obstacle: [[400, 256], [560, 256], [560, 268], [400, 268]],
      rules: [
        look("A sturdy workbench, covered in sawdust."),
        rule({ type: "hand" }, [narrate("Under the sawdust you find a coin."), { type: "play_sound", sound: "pickup" }, { type: "give_item", item: "coin" }], [], true),
        rule({ type: "hand" }, [narrate("Just sawdust now.")]),
      ],
    },
    {
      id: "string",
      name: "string",
      image: "string_img",
      x: 470,
      y: 184,
      baseline: 269,
      visible: true,
      rules: [
        look("A coil of garden string."),
        rule({ type: "hand" }, [{ type: "hide_object", scene: "shed", object: "string" }, { type: "give_item", item: "string" }, narrate("You take the string.")]),
      ],
    },
  ],
  characters: [
    {
      character: "visitor",
      x: 230,
      y: 300,
      facing: "right",
      visible: true,
      rules: [look("A traveller with a pack full of odds and ends."), rule({ type: "talk" }, [{ type: "start_dialogue", dialogue: "shop" }])],
    },
  ],
  hotspots: [
    { id: "window", name: "window", shape: [[260, 60], [380, 60], [380, 140], [260, 140]], walkTo: { x: 320, y: 270, facing: "up" }, rules: [look("Sunlight and cobwebs.")] },
    // A death (spec 07): Restore · Restart · Try again.
    {
      id: "saw",
      name: "saw",
      shape: [[100, 120], [180, 120], [180, 180], [100, 180]],
      walkTo: { x: 140, y: 290, facing: "up" },
      rules: [look("A rusty saw hangs on the wall. Its teeth look sharp."), rule({ type: "hand" }, [narrate("You grab the saw by the blade."), { type: "die", message: "Ouch! Gardening is a dangerous hobby. Maybe hold sharp things by the handle." }])],
    },
  ],
  regions: [{ id: "exit_garden", shape: [[0, 320], [55, 320], [55, 400], [0, 400]], rules: [rule({ type: "enter_region" }, [{ type: "change_scene", scene: "garden", spawn: "from_shed" }])] }],
  rules: [rule({ type: "scene_enter" }, [narrate("A cramped garden shed. It smells of soil and oil.")], [{ type: "first_time" }])],
}));

// The visitor's shop (spec 11 acceptance), laid out left to right like auto-layout.
const option = (id: string, text: string, next: string, extra: Raw = {}) => ({ id, text, if: [], once: false, next, ...extra });
const shop = DialogueFile.parse({
  schemaVersion: SCHEMA_VERSION,
  id: "shop",
  name: "Visitor's shop",
  nodes: [
    { id: "start", type: "start", pos: [0, 0], next: "hello" },
    { id: "hello", type: "line", pos: [320, -24], character: "visitor", text: "Welcome! Have a look at my wares.", next: "menu" },
    {
      id: "menu",
      type: "choices",
      pos: [640, -60],
      options: [
        option("ask", "Where are you headed?", "travels", { once: true }),
        option("buy", "I'll buy the lantern.", "sell", { if: [{ type: "has_item", item: "coin" }] }),
        option("bye", "Goodbye.", "done"),
      ],
    },
    { id: "travels", type: "line", pos: [960, -200], character: "visitor", text: "Over the hills, once the rain stops.", next: "menu" },
    { id: "sell", type: "actions", pos: [960, -40], do: [{ type: "take_item", item: "coin" }, { type: "give_item", item: "lantern" }], next: "thanks" },
    { id: "thanks", type: "line", pos: [1280, -40], character: "visitor", text: "Mind the oil. Anything else?", next: "menu" },
    { id: "done", type: "end", pos: [960, 120] },
  ],
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
const stress = SceneFile.parse(withRuleIds({
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
  regions: [],
}));

const files: Record<string, string | Buffer> = {
  "game.yaml": serialize(game),
  "flags.yaml": serialize(flags),
  "assets.yaml": serialize(assets),
  "characters/hero.character.yaml": serialize(hero),
  "characters/gardener.character.yaml": serialize(npc("gardener", "Gardener")),
  "characters/visitor.character.yaml": serialize(npc("visitor", "Visitor")),
  "scenes/garden.scene.yaml": serialize(garden),
  "scenes/stress.scene.yaml": serialize(stress),
  "scenes/shed.scene.yaml": serialize(shed),
  "dialogues/shop.dialogue.yaml": serialize(shop),
  ...Object.fromEntries(items.map((i) => [`items/${i.id}.item.yaml`, serialize(i)])),
  "assets/images/shed_bg.png": shedBackground().png(),
  "assets/images/flowerpot.png": flowerpot().png(),
  "assets/images/workbench.png": workbench().png(),
  "assets/images/string.png": stringCoil(22).png(),
  "assets/images/items/stick.png": iconStick().png(),
  "assets/images/items/string.png": stringCoil(24).png(),
  "assets/images/items/rod.png": iconRod().png(),
  "assets/images/items/fish.png": iconFish().png(),
  "assets/images/items/coin.png": iconCoin().png(),
  "assets/images/items/lantern.png": iconLantern().png(),
  "assets/images/garden_bg.png": gardenBackground().png(),
  "assets/images/palm.png": palm().png(),
  "assets/images/rock.png": stone(70, 40, [130, 135, 125, 255]).png(),
  "assets/images/boulder.png": stone(84, 64, [140, 120, 100, 255]).png(),
  "assets/images/characters/hero_sheet.png": figureSheet([190, 40, 40, 255], null, 3, 4).png(),
  "assets/images/characters/gardener_sheet.png": figureSheet([60, 130, 60, 255], [200, 170, 80, 255], 1, 4).png(),
  "assets/audio/garden_theme.wav": gardenTheme(),
  "assets/audio/shed_theme.wav": shedTheme(),
  "assets/audio/pickup.wav": pickup(),
};

await rm(ROOT, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  const full = join(ROOT, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}
console.log(`Wrote ${Object.keys(files).length} files to ${ROOT}`);
