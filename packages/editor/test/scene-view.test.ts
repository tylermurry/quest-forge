import { MemoryFs } from "@questforge/schema";
import { describe, expect, it, vi } from "vitest";
import { LAYER_TOOLS, SceneUiStore, VIEW_FILE, VIEW_SAVE_DELAY_MS } from "../src/model/scene/sceneUi.ts";
import { fitTransform, gridVisible, panBy, snapPixel, stepZoom, toScene, toScreen, transformFor, zoomAround, zoomByWheel, zoomTo } from "../src/model/scene/view.ts";

const canvas = { w: 1000, h: 700 };

describe("scene view transform", () => {
  it("fits and centres the 640×400 scene", () => {
    const t = fitTransform(canvas);
    expect(t.scale).toBeCloseTo(Math.min(968 / 640, 668 / 400));
    expect(Math.abs(t.x + 320 * t.scale - 500)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.y + 200 * t.scale - 350)).toBeLessThanOrEqual(1);
  });

  it("round-trips screen and scene points", () => {
    const t = transformFor({ fit: false, scale: 3, pan: [-40, 25] }, canvas);
    const p = [123.5, 77.25] as const;
    expect(toScene(t, toScreen(t, p))).toEqual(p);
  });

  it("zooms around the cursor, keeping the scene point under it", () => {
    const t = transformFor({ fit: false, scale: 2, pan: [10, 20] }, canvas);
    const anchor = [410, 220] as const;
    const before = toScene(t, anchor);
    const after = toScene(transformFor(zoomAround(t, 4, anchor), canvas), anchor);
    expect(after[0]).toBeCloseTo(before[0], 0);
    expect(after[1]).toBeCloseTo(before[1], 0);
  });

  it("steps through 1×–8× and clamps", () => {
    expect(stepZoom(1.4, 1)).toBe(2);
    expect(stepZoom(1.4, -1)).toBe(1);
    expect(stepZoom(6, 1)).toBe(8);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(1, -1)).toBe(1);
    const t = transformFor({ fit: false, scale: 8, pan: [0, 0] }, canvas);
    expect((zoomByWheel(t, -500, [0, 0]) as { scale: number }).scale).toBe(8);
    expect(zoomTo(canvas, 1)).toEqual({ fit: false, scale: 1, pan: [180, 150] });
  });

  it("pans by screen deltas, leaving fit mode at the same scale", () => {
    const t = fitTransform(canvas);
    expect(panBy(t, 15, -5)).toEqual({ fit: false, scale: t.scale, pan: [t.x + 15, t.y - 5] });
  });

  it("snaps to whole pixels inside the scene", () => {
    expect(snapPixel([10.4, 99.6])).toEqual([10, 100]);
    expect(snapPixel([-3, 405])).toEqual([0, 400]);
  });

  it("shows the pixel grid from 4×", () => {
    expect(gridVisible({ scale: 3, x: 0, y: 0 })).toBe(false);
    expect(gridVisible({ scale: 4, x: 0, y: 0 })).toBe(true);
  });
});

describe("scene UI state", () => {
  it("keeps the tool valid for the selected layer", () => {
    const s = new SceneUiStore();
    s.setLayer("garden", "hotspots");
    s.setTool("garden", "walkto");
    expect(s.get("garden").tool).toBe("walkto");
    s.setLayer("garden", "guides");
    expect(s.get("garden").tool).toBe("select");
    s.setTool("garden", "polygon");
    expect(s.get("garden").tool).toBe("select");
    expect(LAYER_TOOLS.guides).toContain("spawn");
  });

  it("saves to .editor/view.json after a short delay and loads it back", async () => {
    vi.useFakeTimers();
    try {
      const fs = new MemoryFs();
      const a = new SceneUiStore();
      await a.attach(fs);
      a.toggleHidden("garden", "hotspots");
      a.toggleLocked("garden", "walkable");
      a.setZoom("garden", { fit: false, scale: 4, pan: [-100, -50] });
      expect(fs.files.has(VIEW_FILE)).toBe(false);
      await vi.advanceTimersByTimeAsync(VIEW_SAVE_DELAY_MS);
      expect(fs.files.has(VIEW_FILE)).toBe(true);
      // Hidden files aren't project files.
      expect(await fs.list()).toEqual([]);
      const b = new SceneUiStore();
      await b.attach(fs);
      expect(b.get("garden")).toMatchObject({ hidden: ["hotspots"], locked: ["walkable"], zoom: { fit: false, scale: 4, pan: [-100, -50] } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a broken view file", async () => {
    const fs = new MemoryFs({ [VIEW_FILE]: "{nope" });
    const s = new SceneUiStore();
    await s.attach(fs);
    expect(s.get("garden").zoom).toEqual({ fit: true });
  });
});
