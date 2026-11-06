// Every polygon in a scene, addressed uniformly: the walkable outline and holes,
// hotspot and region shapes, and object obstacles (D42). DOM-free.
import type { Polygon, SceneFile } from "@questforge/schema";
import type { Layer } from "./sceneUi.ts";
import { holeIndex, holeKey, LIST_LAYER, type ThingRef } from "./things.ts";

/** One polygon: a thing's shape, or an object's obstacle. */
export interface PolyRef {
  ref: ThingRef;
  obstacle?: boolean;
}

export const samePoly = (a: PolyRef | null | undefined, b: PolyRef | null | undefined) =>
  !!a && !!b && a.ref.list === b.ref.list && a.ref.key === b.ref.key && !!a.obstacle === !!b.obstacle;

export function getPolygon(scene: SceneFile, pr: PolyRef): Polygon | undefined {
  const { list, key } = pr.ref;
  switch (list) {
    case "walkable":
      return key === "outer" ? scene.walkable.outer : scene.walkable.holes[holeIndex(key)];
    case "hotspots":
      return scene.hotspots.find((h) => h.id === key)?.shape;
    case "regions":
      return scene.regions.find((r) => r.id === key)?.shape;
    case "objects":
      return pr.obstacle ? scene.objects.find((o) => o.id === key)?.obstacle : undefined;
    default:
      return undefined;
  }
}

/** The scene with one polygon replaced. Unknown targets leave the scene unchanged. */
export function withPolygon(scene: SceneFile, pr: PolyRef, poly: Polygon): SceneFile {
  const { list, key } = pr.ref;
  switch (list) {
    case "walkable": {
      if (key === "outer") return { ...scene, walkable: { ...scene.walkable, outer: poly } };
      const i = holeIndex(key);
      if (!scene.walkable.holes[i]) return scene;
      return { ...scene, walkable: { ...scene.walkable, holes: scene.walkable.holes.map((h, j) => (j === i ? poly : h)) } };
    }
    case "hotspots":
      return { ...scene, hotspots: scene.hotspots.map((h) => (h.id === key ? { ...h, shape: poly } : h)) };
    case "regions":
      return { ...scene, regions: scene.regions.map((r) => (r.id === key ? { ...r, shape: poly } : r)) };
    case "objects":
      return pr.obstacle ? { ...scene, objects: scene.objects.map((o) => (o.id === key ? { ...o, obstacle: poly } : o)) } : scene;
    default:
      return scene;
  }
}

/** Every polygon in the scene with the layer it's on, top of the layer stack first (D15). */
export function scenePolygons(scene: SceneFile): { pr: PolyRef; poly: Polygon; layer: Layer }[] {
  const out: { pr: PolyRef; poly: Polygon; layer: Layer }[] = [];
  // Later entries draw on top, so they're listed first.
  for (const r of [...scene.regions].reverse()) out.push({ pr: { ref: { list: "regions", key: r.id } }, poly: r.shape, layer: "regions" });
  for (const h of [...scene.hotspots].reverse()) out.push({ pr: { ref: { list: "hotspots", key: h.id } }, poly: h.shape, layer: "hotspots" });
  scene.walkable.holes.forEach((h, i) => out.push({ pr: { ref: { list: "walkable", key: holeKey(i) } }, poly: h, layer: "walkable" }));
  if (scene.walkable.outer.length) out.push({ pr: { ref: { list: "walkable", key: "outer" } }, poly: scene.walkable.outer, layer: "walkable" });
  for (const o of [...scene.objects].reverse()) if (o.obstacle) out.push({ pr: { ref: { list: "objects", key: o.id }, obstacle: true }, poly: o.obstacle, layer: "objects" });
  return out;
}

export const polyLayer = (pr: PolyRef): Layer => LIST_LAYER[pr.ref.list];
