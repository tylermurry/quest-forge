import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_IDS, LEGACY_STYLE, SCENE_HEIGHT, SCENE_WIDTH, buildQuest, loadProject, resolveStyle, serialize, type GameStyle, type Project } from "@questforge/schema";
import { NodeFs } from "@questforge/schema/node";
import { DEBUG_OFF } from "../src/debug.ts";
import { drawSession } from "../src/render.ts";
import { DEFAULT_SETTINGS, SaveSlots } from "../src/saves.ts";
import { Session } from "../src/session.ts";
import { loadQuest } from "../src/quest.ts";
import { loadStyleAssets, styleImageIds, type StyleLoaders } from "../src/styleassets.ts";
import { choicesLook } from "../src/ui/choices.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { frameBorders, panelSkin, type SizedImage } from "../src/ui/frame.ts";
import { MIN_HIT_CSS, placementOf, unitFor } from "../src/ui/layout.ts";
import { layoutTextBox, narrateBox, sayBox } from "../src/ui/textbox.ts";
import { textStyle } from "../src/ui/typography.ts";
import { testImages, testProject } from "./support/project.ts";

// The creator's styled game from the file to the screen: the m1 fixture with a full custom style, built into a
// `.quest` and loaded the way the site's /play page loads it, then compared with the project the editor's Playtest
// starts from. Both call `createGame` with a project and an asset URL lookup, so what `createGame` derives from the
// project is what must match. And the player's Text Size and touch on a framed game.

const ROOT = join(import.meta.dirname, "../fixtures/m1");
const readFixture = (p: string) => readFile(join(ROOT, p)).then((b) => new Uint8Array(b));
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9]);

const ICONS = { walk: "palm_img", look: "rock_img", hand: "boulder_img", talk: "stick_icon", item: "string_icon", inventory: "rod_icon", settings: "fish_icon" } as const;
const STYLE: GameStyle = {
  sharedFrame: { image: "panel_webp", insets: { left: 8, right: 8, top: 8, bottom: 8 }, scale: 24 },
  typography: { font: "ye_olde", size: 18, color: "#ffeecc" },
  iconBar: { frame: { image: "shed_bg", insets: { left: 4, right: 4, top: 4, bottom: 4 } }, icons: { ...ICONS }, effect: "darken" },
  dialogueChoices: { effect: "darken", separator: "#445566" },
  narration: { top: 70, width: 65 },
  speech: { name: "#aabbcc" },
};

/** m1 with the full style, a WebP frame, a WOFF2 font, and a picture and font nothing uses. */
async function styledM1(style: GameStyle = STYLE): Promise<Project> {
  const { project: p } = await loadProject(new NodeFs(ROOT));
  return {
    ...p,
    game: { ...p.game!, data: { ...p.game!.data, style } },
    assets: {
      ...p.assets!,
      data: {
        ...p.assets!.data,
        images: [...p.assets!.data.images, { id: "panel_webp", path: "assets/images/panel.webp" }, { id: "unused_art", path: "assets/images/unused.webp" }],
        fonts: [{ id: "ye_olde", path: "assets/fonts/ye-olde.woff2" }],
      },
    },
    pendingFiles: { "assets/images/panel.webp": WEBP, "assets/images/unused.webp": WEBP, "assets/fonts/ye-olde.woff2": WOFF2 },
  };
}
const buildBytes = (p: Project) => buildQuest(p, readFixture);

/** What `createGame` derives from a project before it draws a thing, with loaders that record instead of load. */
async function startup(project: Project) {
  const style = project.game!.data.style;
  const eff = resolveStyle(style);
  const asked = { images: [] as string[], fonts: [] as string[] };
  const loaders: StyleLoaders = {
    loadImage: async (id) => void asked.images.push(id),
    loadFont: async (id) => {
      asked.fonts.push(id);
      if (!project.assets!.data.fonts?.some((f) => f.id === id)) throw new Error(`there is no font asset ${id}`);
      return { family: `qf-font-${id}-1`, release() {} };
    },
  };
  const assets = await loadStyleAssets(eff, loaders, (m) => { throw new Error(m); });
  const loaded = new Map<string, SizedImage>();
  for (const id of asked.images) loaded.set(id, { width: 40, height: 40 } as unknown as SizedImage);
  return {
    eff,
    images: asked.images.sort(),
    fonts: asked.fonts,
    family: assets.fontFamily,
    text: textStyle(style, assets.fontFamily, 100),
    placement: placementOf(style),
    choices: choicesLook(style),
    skin: panelSkin(eff.sharedFrame, (id) => loaded.get(id)),
  };
}

describe("a built game with a full custom style", () => {
  it("loads from the .quest with the style byte for byte, every picture and the font served, and nothing unused", async () => {
    const source = await styledM1();
    const bundle = await loadQuest(await buildBytes(source));
    expect(bundle.project.game!.data.style).toEqual(STYLE);
    expect(serialize(bundle.project.game!.data)).toBe(serialize(source.game!.data));

    const eff = resolveStyle(bundle.project.game!.data.style);
    const ids = styleImageIds(eff).sort();
    expect(ids).toEqual([...new Set(["panel_webp", "shed_bg", ...Object.values(ICONS)])].sort());
    expect(ICON_IDS.every((icon) => eff.iconBar.icons[icon] === ICONS[icon])).toBe(true);
    for (const id of ids) {
      const asset = bundle.project.assets!.data.images.find((i) => i.id === id)!;
      const url = bundle.assetUrl(asset.path);
      expect(url, id).toMatch(/^blob:/);
      const expected = source.pendingFiles[asset.path] ?? (await readFixture(asset.path));
      expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(expected);
    }
    const font = bundle.project.assets!.data.fonts!.find((f) => f.id === "ye_olde")!;
    const fontResponse = await fetch(bundle.assetUrl(font.path));
    expect(fontResponse.headers.get("content-type")).toBe("font/woff2");
    expect(new Uint8Array(await fontResponse.arrayBuffer())).toEqual(WOFF2);
    expect((await fetch(bundle.assetUrl("assets/images/panel.webp"))).headers.get("content-type")).toBe("image/webp");

    // What nothing uses is not in the game: not in the library, and with no URL of its own.
    expect(bundle.project.assets!.data.images.map((i) => i.id)).not.toContain("unused_art");
    expect(bundle.assetUrl("assets/images/unused.webp")).toBe("assets/images/unused.webp");
    bundle.dispose();
  });

  it("starts the same game as the editor's Playtest: the same style, pictures and font are asked for and the same text is drawn", async () => {
    const source = await styledM1();
    const bundle = await loadQuest(await buildBytes(source));
    const playtest = await startup(source); // the editor passes its project as it is
    const play = await startup(bundle.project); // /play passes the project read from the file
    expect(play).toEqual(playtest);
    expect(play.fonts).toEqual(["ye_olde"]);
    expect(play.images).toEqual([...new Set(["panel_webp", "shed_bg", ...Object.values(ICONS)])].sort());
    expect(play.family).toBe('"qf-font-ye_olde-1", monospace');
    expect(play.text).toMatchObject({ family: '"qf-font-ye_olde-1", monospace', size: 18, color: "#ffeecc", name: "#aabbcc", custom: true });
    expect(play.skin).toBeDefined();
    bundle.dispose();
  });
});

describe("a built game with no style", () => {
  it("plays as it did before styling: legacy text, no pictures or font to load, nothing placed", async () => {
    const { project } = await loadProject(new NodeFs(ROOT));
    const bundle = await loadQuest(await buildBytes(project));
    expect(bundle.project.game!.data.style).toBeUndefined();
    expect(bundle.project.assets!.data.fonts).toBeUndefined();
    const play = await startup(bundle.project);
    expect(play).toEqual(await startup(project));
    expect(play.eff).toEqual(LEGACY_STYLE);
    expect(play).toMatchObject({ images: [], fonts: [], family: "monospace", placement: null, skin: undefined });
    expect(play.text).toMatchObject({ family: "monospace", size: 10, line: 12, color: "#ffffff", custom: false });
    bundle.dispose();
  });
});

// A recording canvas, to compare what two styles draw.
function recorder() {
  const calls: unknown[][] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in state) return state[k];
      return (...a: unknown[]) => void calls.push([k, ...a]);
    },
    set: (_t, k: string, v) => {
      state[k] = v;
      calls.push(["set", k, v]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const MENU = {
  id: "menu",
  nodes: [
    { id: "start", type: "start", pos: [0, 0], next: "pick" },
    { id: "pick", type: "choices", pos: [0, 0], options: ["Yes", "No", "Maybe"].map((text, i) => ({ id: `o${i}`, text, if: [], once: false, next: "done" })) },
    { id: "done", type: "end", pos: [0, 0] },
  ],
};

describe("a game that sets no styling", () => {
  /** One frame of every surface a style could change, as the calls made on the canvas. */
  function drawEverything(style: GameStyle | undefined) {
    const out: unknown[][][] = [];
    const open: ((s: Session, ui: PlayerUi) => void)[] = [
      () => {},
      (s) => void s.narrate("You see a small garden with a pond."),
      (s) => void s.say("gardener", "Mind the flowers."),
      (s) => void s.startDialogue("menu"),
      (_s, ui) => void (ui.panel = "inventory"),
      (_s, ui) => void (ui.panel = "settings"),
      (_s, ui) => void (ui.barOpen = true),
    ];
    for (const show of open) {
      const s = new Session(testProject({ game: style ? { style } : {}, dialogues: [MENU] }), testImages);
      const eff = resolveStyle(style);
      const ui = new PlayerUi(s, { slots: new SaveSlots(null, s.game), settings: DEFAULT_SETTINGS });
      ui.setScale(1);
      show(s, ui);
      const r = recorder();
      drawSession(r.ctx, ui, () => undefined, undefined, DEBUG_OFF, textStyle(style, "monospace", 100), eff.iconBar, choicesLook(style), undefined);
      out.push(r.calls);
    }
    return out;
  }

  it("draws exactly what a game with no style at all draws", () => {
    expect(drawEverything({})).toEqual(drawEverything(undefined));
    expect(drawEverything({ sharedFrame: {} })).toEqual(drawEverything(undefined));
  });
});

describe("the player's Text Size on a framed game", () => {
  const speaker = { id: "g", name: "Gardener", color: "#88cc88", anchor: { x: 300, y: 250, w: 32, h: 48 } };
  const LONG = "The garden is quiet and the gardener glares at you from behind a wheelbarrow while the pond ripples. ".repeat(4).trim();
  const WORDS = "Hello there, friend. ".repeat(3).trim();
  // Six pixels a character at 10 px: width follows the size, as a real font does.
  const measure = (text: string, size: number) => text.length * 0.6 * size;
  const style = (scale: number): GameStyle => ({ ...STYLE, sharedFrame: { image: "panel_webp", insets: { left: 12, right: 12, top: 12, bottom: 12 }, scale } });

  for (const scale of [16, 64]) {
    for (const percent of [75, 100, 200]) {
      it(`keeps narration and speech on the screen and inside the frame's borders at ${percent}% with a ${scale} px frame`, () => {
        const s = style(scale);
        const t = textStyle(s, "serif", percent);
        const borders = frameBorders({ insets: s.sharedFrame!.insets!, scale });
        for (const box of [narrateBox(LONG), narrateBox(WORDS), sayBox(LONG, speaker), sayBox(WORDS, speaker)]) {
          for (const placement of [null, placementOf(s)]) {
            const l = layoutTextBox(box, measure, t, placement, borders);
            expect(l.x).toBeGreaterThanOrEqual(0);
            expect(l.y).toBeGreaterThanOrEqual(0);
            expect(l.x + l.w).toBeLessThanOrEqual(SCENE_WIDTH);
            expect(l.y + l.h).toBeLessThanOrEqual(SCENE_HEIGHT);
            // The box width is rounded to a whole pixel, so a line may be up to half a pixel over.
            for (const line of l.lines) expect(measure(line, l.size)).toBeLessThanOrEqual(l.w - borders.left - borders.right + 0.5);
            expect(l.textX).toBe(l.x + borders.left + (l.w - borders.left - borders.right) / 2);
            const rows = l.lines.length + (l.name ? 1 : 0);
            expect(l.textY - (l.name ? l.line : 0)).toBe(l.y + borders.top);
            expect(l.textY - (l.name ? l.line : 0) + rows * l.line + borders.bottom).toBe(l.y + l.h);
            expect(l.size).toBeGreaterThanOrEqual(Math.min(t.size, 10));
          }
        }
      });
    }
  }

  for (const [percent, scale] of [[75, 16], [200, 16], [200, 64]] as const) {
    for (const cssScale of [0.5, 1, 2, 3]) {
      it(`keeps every dialogue choice at least ${MIN_HIT_CSS} CSS px tall and tappable at ${percent}% text, a ${scale} px frame and ${cssScale} CSS px per game pixel`, () => {
        const s = style(scale);
        const borders = frameBorders({ insets: s.sharedFrame!.insets!, scale });
        const session = new Session(testProject({ game: { style: s }, dialogues: [MENU] }), testImages);
        const ui = new PlayerUi(session, { slots: new SaveSlots(null, session.game), settings: { ...DEFAULT_SETTINGS, textSize: percent }, borders });
        ui.setScale(cssScale);
        session.startDialogue("menu");
        const box = ui.choiceBox!;
        // A thick frame at big targets leaves room for fewer rows at once; the rest are a page away (More…).
        expect(box.rows.length).toBeGreaterThanOrEqual(1);
        if (box.rows.length < 3) expect(box.more).not.toBe(null);
        expect(box.panel.x).toBeGreaterThanOrEqual(0);
        expect(box.panel.y).toBeGreaterThanOrEqual(0);
        expect(box.panel.x + box.panel.w).toBeLessThanOrEqual(SCENE_WIDTH);
        expect(box.panel.y + box.panel.h).toBeLessThanOrEqual(SCENE_HEIGHT);
        for (const row of box.rows) {
          expect(row.h).toBe(unitFor(cssScale));
          expect(row.h * cssScale).toBeGreaterThanOrEqual(MIN_HIT_CSS);
          expect(row.x).toBeGreaterThanOrEqual(box.inner!.x);
          expect(row.x + row.w).toBeLessThanOrEqual(box.inner!.x + box.inner!.w);
          expect(row.y + row.h).toBeLessThanOrEqual(box.inner!.y + box.inner!.h);
        }
        // The text size doesn't change where the rows are.
        const other = new PlayerUi(session, { slots: new SaveSlots(null, session.game), settings: { ...DEFAULT_SETTINGS, textSize: 100 }, borders });
        other.setScale(cssScale);
        expect(other.choiceBox!.rows).toEqual(box.rows);
        // A touch on the last visible row's lower edge picks that answer.
        const at = box.rows.length - 1;
        const last = box.rows[at]!;
        ui.pointerDown([last.x + last.w / 2, last.y + last.h - 1], "touch");
        ui.pointerUp([last.x + last.w / 2, last.y + last.h - 1], "touch");
        expect(session.state.fired).toContain(`dialogue:menu/pick/o${box.first + at}`);
      });
    }
  }
});
