import { describe, expect, it } from "vitest";
import type { SceneFile } from "@questforge/schema";
import { hitTest, VERTEX_PX } from "../src/model/scene/hit.ts";
import { getPolygon, samePoly, scenePolygons, withPolygon } from "../src/model/scene/shapes.ts";
import { SceneUiStore, type SceneUi } from "../src/model/scene/sceneUi.ts";
import { snapPoint } from "../src/model/scene/snap.ts";
import type { ThingRef } from "../src/model/scene/things.ts";
import { m1Project } from "./support/fixtures.ts";

// The scene tests drive these modules through SceneTools (scene-select, scene-draw, ...).
// These direct tests cover only what that path never reaches: handle priority, the
// walk-to marker, the background rule, snapping that skips hidden layers and the dragged
// vertex, and the polygon helpers' edge cases.

async function garden(): Promise<SceneFile> {
  const p = await m1Project();
  return p.scenes.find((s) => s.data.id === "garden")!.data;
}

const uiWith = (patch: Partial<SceneUi>): SceneUi => {
  const store = new SceneUiStore();
  store.update("garden", (u) => ({ ...u, ...patch }));
  return store.get("garden");
};

describe("shapes helpers", () => {
  it("lists regions, hotspots, holes, the outline and obstacles, each on its own layer", async () => {
    const scene = await garden();
    const layers = scenePolygons(scene).map((x) => x.layer);
    expect(new Set(layers)).toEqual(new Set(["regions", "hotspots", "walkable", "objects"]));
    // Holes are listed before the outline so a click in a hole finds the hole first.
    const walkable = scenePolygons(scene).filter((x) => x.layer === "walkable");
    expect(walkable.at(-1)!.pr.ref.key).toBe("outer");
    expect(walkable.length).toBe(scene.walkable.holes.length + 1);
  });

  it("an obstacle is a different polygon from its object, and unknown targets change nothing", async () => {
    const scene = await garden();
    const withObstacle = scene.objects.find((o) => o.obstacle)!;
    const obstacle = { ref: { list: "objects", key: withObstacle.id }, obstacle: true } as const;
    const plain = { ref: { list: "objects", key: withObstacle.id } } as const;
    expect(samePoly(obstacle, plain)).toBe(false);
    expect(samePoly(obstacle, { ...obstacle })).toBe(true);
    expect(samePoly(null, obstacle)).toBe(false);
    expect(getPolygon(scene, obstacle)).toEqual(withObstacle.obstacle);
    expect(getPolygon(scene, plain)).toBeUndefined();
    const tri: [number, number][] = [[0, 0], [10, 0], [0, 10]];
    expect(withPolygon(scene, plain, tri)).toBe(scene);
    expect(withPolygon(scene, { ref: { list: "walkable", key: "hole:99" } }, tri)).toBe(scene);
    expect(withPolygon(scene, { ref: { list: "hotspots", key: "nope" } }, tri)).toEqual(scene);
    expect(getPolygon(withPolygon(scene, obstacle, tri), obstacle)).toEqual(tri);
  });
});

describe("hitTest", () => {
  const ctx = (scene: SceneFile, ui: SceneUi, selection: ThingRef | null, scale = 2) => ({ scene, ui, scale, selection, sprites: [] });

  it("on the selected shape a vertex wins over the edge and the inside, within a screen-sized radius", async () => {
    const scene = await garden();
    const outer = scene.walkable.outer;
    const v = outer[0]!;
    const sel: ThingRef = { list: "walkable", key: "outer" };
    const c = ctx(scene, uiWith({ layer: "walkable" }), sel);
    expect(hitTest(v, c)).toMatchObject({ kind: "vertex", index: 0 });
    // Just inside the radius at 2x (VERTEX_PX / 2 scene px) still grabs it; well outside does not.
    expect(hitTest([v[0] + (VERTEX_PX / 2 - 0.5), v[1]], c)).toMatchObject({ kind: "vertex", index: 0 });
    expect(hitTest([v[0] + VERTEX_PX, v[1]], c)?.kind).not.toBe("vertex");
    // Halfway along the first edge is an edge hit, not a shape hit.
    const w = outer[1]!;
    expect(hitTest([(v[0] + w[0]) / 2, (v[1] + w[1]) / 2], c)).toMatchObject({ kind: "edge", index: 0 });
  });

  it("a hotspot's walk-to marker is grabbed before the hotspot's own shape", async () => {
    const scene = await garden();
    const pond = scene.hotspots.find((h) => h.id === "pond")!;
    const inside = pond.shape[0]!;
    const withWalkTo: SceneFile = {
      ...scene,
      hotspots: scene.hotspots.map((h) => (h.id === "pond" ? { ...h, walkTo: { x: inside[0], y: inside[1], facing: "up" as const } } : h)),
    };
    const c = ctx(withWalkTo, uiWith({ layer: "hotspots" }), null);
    expect(hitTest(inside, c)).toEqual({ kind: "walkto", ref: { list: "hotspots", key: "pond" } });
  });

  it("the background only answers on the Background layer, so empty clicks elsewhere deselect", async () => {
    const scene = await garden();
    expect(scene.background).toBeDefined();
    // A spot no polygon covers (found by search, so the test doesn't depend on exact coordinates).
    let empty: [number, number] | null = null;
    for (let y = 3; y < 400 && !empty; y += 7) for (let x = 3; x < 640 && !empty; x += 7) if (hitTest([x, y], ctx(scene, uiWith({ layer: "walkable" }), null)) === null) empty = [x, y];
    if (!empty) throw new Error("fixture scene has no empty spot");
    expect(hitTest(empty, ctx(scene, uiWith({ layer: "walkable" }), null))).toBeNull();
    expect(hitTest(empty, ctx(scene, uiWith({ layer: "background" }), null))).toEqual({ kind: "background", ref: { list: "background", key: "background" } });
  });
});

describe("snapPoint", () => {
  it("with Snap off, or nothing near, rounds to whole pixels", async () => {
    const scene = await garden();
    expect(snapPoint([10.4, 20.6], scene, uiWith({ snap: false }), 2)).toEqual({ point: [10, 21], kind: "pixel" });
    // Far from every vertex and edge: only the pixel grid.
    let far: [number, number] | null = null;
    for (let y = 3.3; y < 400 && !far; y += 7) for (let x = 3.3; x < 640 && !far; x += 7) if (snapPoint([x, y], scene, uiWith({ snap: true }), 2).kind === "pixel") far = [x, y];
    if (!far) throw new Error("fixture scene has no spot clear of shapes");
    expect(snapPoint(far, scene, uiWith({ snap: true }), 2)).toEqual({ point: [Math.round(far[0]), Math.round(far[1])], kind: "pixel" });
  });

  it("does not snap to shapes on hidden layers", async () => {
    const scene = await garden();
    const v = scene.walkable.outer[0]!;
    const near: [number, number] = [v[0] + 1, v[1] + 1];
    expect(snapPoint(near, scene, uiWith({ snap: true }), 2)).toEqual({ point: v, kind: "vertex" });
    expect(snapPoint(near, scene, uiWith({ snap: true, hidden: ["walkable"] }), 2).kind).not.toBe("vertex");
  });

  it("snaps to extra points (the shape being drawn)", async () => {
    const scene = await garden();
    const got = snapPoint([2, 2], scene, uiWith({ snap: true }), 2, { extra: [[3, 3]] });
    expect(got).toEqual({ point: [3, 3], kind: "vertex" });
  });

  it("the dragged vertex and the edges touching it are not snap targets", async () => {
    const scene = await garden();
    const sel = scenePolygons(scene).find((x) => x.pr.ref.key === "outer")!;
    const v = sel.poly[0]!;
    const next = sel.poly[1]!;
    const near: [number, number] = [v[0] + 1, v[1] + 1];
    const got = snapPoint(near, scene, uiWith({ snap: true }), 2, { pr: sel.pr, index: 0 });
    expect(got.point).not.toEqual(v);
    // Halfway along an edge that touches the dragged vertex: no edge snap either.
    const mid: [number, number] = [Math.round((v[0] + next[0]) / 2) + 0.3, Math.round((v[1] + next[1]) / 2) + 0.3];
    const onEdge = snapPoint(mid, scene, uiWith({ snap: true }), 2, { pr: sel.pr, index: 0 });
    expect(onEdge.kind === "edge" || onEdge.kind === "pixel").toBe(true);
    expect(onEdge.kind === "edge" ? onEdge.point : null).not.toEqual(mid.map(Math.round));
  });
});
