import { describe, expect, it } from "vitest";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import { Session } from "../src/session.ts";
import type { Rect } from "../src/sprite.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { MIN_HIT_CSS, computeLayout, unitFor } from "../src/ui/layout.ts";
import { fitViewport } from "../src/viewport.ts";
import type { Vec } from "../src/vec.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// Player UI: 44 CSS px controls, touch-only play, no hover needs.

/** CSS px per scene px for a CSS viewport (device pixel ratio cancels out). */
const cssScaleFor = (w: number, h: number) => fitViewport(w, h).scale;
const center = (r: Rect): Vec => [r.x + r.w / 2, r.y + r.h / 2];
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= SCENE_WIDTH && r.y + r.h <= SCENE_HEIGHT;

describe("layout", () => {
  const screens: [string, number, number][] = [
    ["iPhone 14 landscape", 844, 390],
    ["iPhone SE landscape", 667, 375],
    ["small phone landscape", 568, 320],
    ["desktop 1×", 1280, 800],
    ["desktop 2×", 1440, 900],
    ["tiny window", 400, 250],
  ];

  for (const [name, w, h] of screens) {
    it(`every control is ≥ 44 CSS px, on screen and apart: ${name}`, () => {
      const k = cssScaleFor(w, h);
      const L = computeLayout(k);
      const groups: Rect[][] = [
        L.barButtons.map((b) => b.rect),
        [...L.inventory.cells, ...L.inventory.buttons.map((b) => b.rect)],
        L.settings.buttons.map((b) => b.rect),
        L.ending.buttons.map((b) => b.rect),
        [...L.slots.rows, ...L.slots.buttons.map((b) => b.rect)],
        L.volume.buttons.map((b) => b.rect),
        [L.tab.hit],
      ];
      for (const group of groups) {
        for (const r of group) {
          expect(r.w * k).toBeGreaterThanOrEqual(MIN_HIT_CSS);
          expect(r.h * k).toBeGreaterThanOrEqual(MIN_HIT_CSS);
          expect(inside(r)).toBe(true);
        }
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) expect(overlaps(group[i]!, group[j]!)).toBe(false);
      }
      for (const b of L.barButtons) expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(L.bar.h);
      expect(L.inventory.cells.length).toBeGreaterThanOrEqual(6);
    });
  }

  it("uses the 32 px design size when the screen is big", () => {
    expect(unitFor(2)).toBe(32);
    expect(unitFor(1)).toBe(44);
    expect(unitFor(0.8)).toBe(55);
  });
});

const POT: Vec = [320, 320];
const make = (over?: Parameters<typeof testProject>[0]) => {
  const s = new Session(testProject(over), testImages);
  const ui = new PlayerUi(s);
  ui.setScale(cssScaleFor(844, 390));
  return { s, ui };
};
const tap = (ui: PlayerUi, p: Vec) => {
  ui.pointerDown(p, "touch");
  ui.tick(1 / 60);
  ui.pointerUp(p, "touch");
};
const run = (s: Session, ui: PlayerUi, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    s.tick(1 / 60);
    ui.tick(1 / 60);
  }
};
const bar = (ui: PlayerUi, id: string) => center(ui.layout.barButtons.find((b) => b.id === id)!.rect);
const inv = (ui: PlayerUi, id: string) => center(ui.layout.inventory.buttons.find((b) => b.id === id)!.rect);
const cell = (ui: PlayerUi, i: number) => center(ui.layout.inventory.cells[i]!);

describe("touch play", () => {
  it("a tap walks with the current verb; the tab opens the bar to change it", () => {
    const { s, ui } = make({ yard: { hotspots: [{ id: "pot", name: "flowerpot", shape: [[300, 300], [340, 300], [340, 340], [300, 340]], rules: [rule({ type: "look" }, [narrate("A pot.")])] }] } });
    expect(ui.tabVisible).toBe(false);
    tap(ui, [200, 380]);
    expect(ui.touchSeen).toBe(true);
    expect(s.world.walking).toBe(true);
    expect(ui.tabVisible).toBe(true);
    tap(ui, center(ui.layout.tab.hit));
    expect(ui.barOpen).toBe(true);
    tap(ui, bar(ui, "look"));
    expect(ui.barOpen).toBe(false);
    expect(s.verb).toBe("look");
    tap(ui, POT);
    expect(s.text?.text).toBe("A pot.");
    // Tapping the text skips it.
    tap(ui, [100, 100]);
    expect(s.text).toBe(null);
  });

  it("tap-and-hold shows the name and doesn't act", () => {
    const { s, ui } = make();
    ui.pointerDown(POT, "touch");
    run(s, ui, 0.5);
    expect(ui.label?.text).toBe("flowerpot");
    ui.pointerUp(POT, "touch");
    expect(ui.label).toBe(null);
    expect(s.world.walking).toBe(false);
  });

  it("a drag isn't a tap", () => {
    const { s, ui } = make();
    ui.pointerDown([200, 380], "touch");
    ui.pointerMove([260, 380], "touch");
    ui.pointerUp([260, 380], "touch");
    expect(s.world.walking).toBe(false);
  });

  it("tapping outside the open bar closes it without walking", () => {
    const { s, ui } = make();
    tap(ui, [200, 380]);
    run(s, ui, 3);
    tap(ui, center(ui.layout.tab.hit));
    tap(ui, [100, 380]);
    expect(ui.barOpen).toBe(false);
    expect(s.world.walking).toBe(false);
  });

  it("the bar won't open during a sequence", () => {
    const { s, ui } = make({ yard: { rules: [rule({ type: "scene_enter" }, [{ type: "wait", seconds: 2 }])] } });
    ui.touchSeen = true;
    expect(s.busy).toBe(true);
    expect(ui.tabVisible).toBe(false);
    tap(ui, center(ui.layout.tab.hit));
    expect(ui.barOpen).toBe(false);
  });
});

describe("inventory", () => {
  const combine = rule({ type: "combine", item: "stick", with: "string" }, [
    { type: "take_item", item: "stick" },
    { type: "take_item", item: "string" },
    { type: "give_item", item: "rod" },
  ]);

  it("Look describes, Select picks the current item and closes, holding one combines", () => {
    const { s, ui } = make({ game: { rules: [combine] } });
    s.state.inventory.push("stick", "string");
    ui.touchSeen = true;
    tap(ui, center(ui.layout.tab.hit));
    tap(ui, bar(ui, "inventory"));
    expect(ui.panel).toBe("inventory");
    expect(ui.inventoryMode).toBe("select");
    tap(ui, inv(ui, "look"));
    tap(ui, cell(ui, 0));
    expect(s.text?.text).toBe("A stick.");
    tap(ui, cell(ui, 0)); // skips the text
    expect(s.text).toBe(null);
    tap(ui, inv(ui, "select"));
    tap(ui, cell(ui, 1));
    expect(ui.panel).toBe(null);
    expect(s.item).toBe("string");
    expect(s.verb).toBe("item");
    // Reopen holding the string: tapping the stick combines, window stays open.
    tap(ui, center(ui.layout.tab.hit));
    tap(ui, bar(ui, "inventory"));
    expect(ui.inventoryMode).toBe("item");
    tap(ui, cell(ui, 0));
    expect(s.state.inventory).toEqual(["rod"]);
    expect(ui.panel).toBe("inventory");
    run(s, ui, 0.1);
    expect(s.item).toBe(null);
    expect(ui.inventoryMode).toBe("select");
    tap(ui, inv(ui, "ok"));
    expect(ui.panel).toBe(null);
  });

  it("the bar's item button uses the current item", () => {
    const { s, ui } = make();
    s.state.inventory.push("key");
    s.selectItem("key");
    s.selectVerb("walk");
    ui.touchSeen = true;
    tap(ui, center(ui.layout.tab.hit));
    tap(ui, bar(ui, "item"));
    expect(s.verb).toBe("item");
  });
});

describe("settings and endings", () => {
  it("Restart from settings resets the game; Save opens the slots and Cancel comes back", () => {
    const { s, ui } = make();
    s.state.inventory.push("key");
    ui.touchSeen = true;
    tap(ui, center(ui.layout.tab.hit));
    tap(ui, bar(ui, "settings"));
    expect(ui.panel).toBe("settings");
    tap(ui, center(ui.layout.settings.buttons.find((b) => b.id === "save")!.rect));
    expect(ui.panel).toBe("save");
    tap(ui, center(ui.layout.slots.buttons.find((b) => b.id === "cancel")!.rect));
    expect(ui.panel).toBe("settings");
    // Nothing saved yet: Load stays shut.
    tap(ui, center(ui.layout.settings.buttons.find((b) => b.id === "load")!.rect));
    expect(ui.panel).toBe("settings");
    tap(ui, center(ui.layout.settings.buttons.find((b) => b.id === "restart")!.rect));
    expect(ui.panel).toBe(null);
    expect(s.state.inventory).toEqual([]);
  });

  it("an ending only answers its buttons", () => {
    const enter = rule({ type: "scene_enter" }, [{ type: "die", message: "Oops." }], [{ type: "first_time" }]);
    const { s, ui } = make({ yard: { rules: [enter] } });
    expect(s.ending?.kind).toBe("die");
    tap(ui, [100, 380]);
    expect(s.ending?.kind).toBe("die");
    tap(ui, center(ui.layout.ending.buttons.find((b) => b.id === "restart")!.rect));
    // Restart resets fired rules too, so the first-time enter rule runs again.
    expect(s.ending?.kind).toBe("die");
    expect(s.state.fired).toEqual([`yard/scene/${enter.id}`]);
  });
});

describe("mouse play", () => {
  it("the top 8 CSS px reveal the bar; hover labels; right-click cycles verbs", () => {
    const { s, ui } = make();
    ui.setScale(1);
    ui.pointerMove(POT, "mouse");
    expect(ui.label?.text).toBe("flowerpot");
    expect(ui.cursor).toEqual(POT);
    ui.pointerMove([300, 5], "mouse");
    expect(ui.barOpen).toBe(true);
    ui.pointerDown(bar(ui, "hand"), "mouse");
    expect(s.verb).toBe("hand");
    ui.pointerMove([300, 300], "mouse");
    expect(ui.barOpen).toBe(false);
    ui.pointerDown([300, 300], "mouse", 2);
    expect(s.verb).toBe("talk");
    expect(ui.tabVisible).toBe(false);
  });

  it("a mouse click acts at once", () => {
    const { s, ui } = make();
    ui.pointerDown([200, 380], "mouse");
    expect(s.world.walking).toBe(true);
  });
});
