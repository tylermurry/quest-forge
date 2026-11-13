import { describe, expect, it } from "vitest";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import { Session } from "../src/session.ts";
import type { Rect } from "../src/sprite.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { MIN_HIT_CSS, choiceLayout, computeLayout, placementOf, type Placement } from "../src/ui/layout.ts";
import { layoutTextBox, narrateBox, sayBox } from "../src/ui/textbox.ts";
import { fitViewport } from "../src/viewport.ts";
import { testImages, testProject } from "./support/project.ts";

// The Frames position (Game Settings > Styling > Frames > Position): narration, speech, the dialogue choices
// and the inventory all go at its top and width; a project without it keeps the legacy layout.

const measure = (s: string) => s.length * 6;
const AT_80: Placement = { top: 80, width: 50 };
const MIDDLE: Placement = { top: "center", width: 75 };
const inside = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= SCENE_WIDTH && r.y + r.h <= SCENE_HEIGHT;
const speaker = { id: "g", name: "Gardener", color: "#88cc88", anchor: { x: 500, y: 250, w: 32, h: 48 } };

describe("panel placement", () => {
  it("reads the Frames position, or none for a project without one", () => {
    expect(placementOf(undefined)).toBe(null);
    expect(placementOf({ typography: { size: 14 } })).toBe(null);
    expect(placementOf({ narration: {} })).toEqual({ top: 50, width: 60 });
    expect(placementOf({ narration: { top: 120, center: true, width: 40 } })).toEqual({ top: "center", width: 40 });
  });

  it("puts narration and speech at the top and width, centred across", () => {
    for (const box of [narrateBox("Hello there."), sayBox("Good day.", speaker)]) {
      const l = layoutTextBox(box, measure, undefined, AT_80);
      expect(l).toMatchObject({ x: 160, y: 80, w: 320 });
    }
    // Speech keeps its speaker's name inside the box.
    expect(layoutTextBox(sayBox("Good day.", speaker), measure, undefined, AT_80).name).toBe("Gardener");
  });

  it("centres a box up and down, and wraps text to the configured width", () => {
    const l = layoutTextBox(narrateBox("word ".repeat(60).trim()), measure, undefined, MIDDLE);
    expect(l.w).toBe(480);
    expect(l.y).toBe(Math.round((SCENE_HEIGHT - l.h) / 2));
    for (const line of l.lines) expect(measure(line)).toBeLessThanOrEqual(480 - 20);
  });

  it("keeps a box near the bottom on the screen", () => {
    const l = layoutTextBox(narrateBox("word ".repeat(60).trim()), measure, undefined, { top: 390, width: 30 });
    expect(l.y + l.h).toBe(SCENE_HEIGHT);
  });

  it("puts the dialogue choices there, rows still full-size", () => {
    const b = choiceLayout(44, 3, 0, true, AT_80);
    expect(b.panel).toMatchObject({ x: 160, y: 80, w: 320 });
    for (const r of b.rows) {
      expect(r.h).toBe(44);
      expect(r.x).toBeGreaterThanOrEqual(b.panel.x);
      expect(r.x + r.w).toBeLessThanOrEqual(b.panel.x + b.panel.w);
    }
    // A long, paged list at the bottom is pushed up to stay on the screen.
    const paged = choiceLayout(44, 12, 0, true, { top: 300, width: 60 });
    expect(paged.more).not.toBe(null);
    expect(inside(paged.panel)).toBe(true);
  });

  it("puts the inventory there, never narrower than its buttons need, every control ≥ 44 CSS px", () => {
    for (const [w, h] of [[844, 390], [568, 320], [1280, 800], [400, 250]] as const) {
      const k = fitViewport(w, h).scale;
      for (const placement of [AT_80, MIDDLE, { top: 0, width: 20 }, { top: 400, width: 100 }] satisfies Placement[]) {
        const inv = computeLayout(k, placement).inventory;
        expect(inside(inv.panel)).toBe(true);
        expect(inv.panel.x).toBe(Math.round((SCENE_WIDTH - inv.panel.w) / 2));
        for (const r of [...inv.cells, ...inv.buttons.map((b) => b.rect)]) {
          expect(r.w * k).toBeGreaterThanOrEqual(MIN_HIT_CSS);
          expect(r.h * k).toBeGreaterThanOrEqual(MIN_HIT_CSS);
          expect(r.x).toBeGreaterThanOrEqual(inv.panel.x);
          expect(r.x + r.w).toBeLessThanOrEqual(inv.panel.x + inv.panel.w);
        }
      }
    }
    const inv = computeLayout(1, AT_80).inventory;
    expect(inv.panel).toMatchObject({ x: 160, y: 80, w: 320 });
    // 20% (128 px) is too narrow for Look / Select / item / OK, so the panel grows to fit them.
    expect(computeLayout(1, { top: 0, width: 20 }).inventory.panel.w).toBe(4 * 64 + 3 * 4 + 16);
  });

  it("leaves a project without a Frames position on the legacy layout", () => {
    expect(computeLayout(1, null)).toEqual(computeLayout(1));
    expect(choiceLayout(44, 3, 0, false, null)).toEqual(choiceLayout(44, 3, 0));
    const legacyNarrate = layoutTextBox(narrateBox("Hello there."), measure);
    expect(layoutTextBox(narrateBox("Hello there."), measure, undefined, null)).toEqual(legacyNarrate);
    // Speech still sits over its speaker.
    const say = layoutTextBox(sayBox("Good day.", speaker), measure, undefined, null);
    expect(say.y + say.h).toBeLessThanOrEqual(speaker.anchor.y);
    expect(say.x + say.w / 2).toBeCloseTo(516, 0);
  });

  it("the player UI uses the game's Frames position, or the legacy layout without one", () => {
    const ui = (game?: NonNullable<Parameters<typeof testProject>[0]>["game"]) => new PlayerUi(new Session(testProject({ game }), testImages));
    const placed = ui({ style: { narration: { top: 80, width: 50 } } });
    expect(placed.placement).toEqual(AT_80);
    placed.setScale(1);
    expect(placed.layout.inventory.panel).toMatchObject({ x: 160, y: 80, w: 320 });
    const legacy = ui();
    expect(legacy.placement).toBe(null);
    legacy.setScale(1);
    expect(legacy.layout).toEqual(computeLayout(1));
  });
});
