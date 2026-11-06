// What's in a scene, by layer (spec 09, D15, D103): the rows of the Layers panel,
// what a selection refers to, and which layer each thing lives on. DOM-free.
import { objectBaseline, sortByBaseline, type ImageLookup } from "@questforge/engine";
import type { SceneFile } from "@questforge/schema";
import type { Layer } from "./sceneUi.ts";

/** Lists a scene-thing selection can point into. */
export type ThingList = "objects" | "characters" | "hotspots" | "regions" | "spawns" | "walkable" | "depth" | "background";

/**
 * One thing in a scene. Keys: object/hotspot/region ID, character ID (one placement
 * per character, D106), spawn ID, `outer` / `hole:<n>` for the walkable area, `far` /
 * `near` for depth lines, `background`.
 */
export interface ThingRef {
  list: ThingList;
  key: string;
}

export const LIST_LAYER: Record<ThingList, Layer> = {
  objects: "objects",
  characters: "objects",
  hotspots: "hotspots",
  regions: "regions",
  spawns: "guides",
  depth: "guides",
  walkable: "walkable",
  background: "background",
};

export const sameThing = (a: ThingRef | null | undefined, b: ThingRef | null | undefined) => !!a && !!b && a.list === b.list && a.key === b.key;

export const holeKey = (i: number) => `hole:${i}`;
export const holeIndex = (key: string) => (key.startsWith("hole:") ? Number(key.slice(5)) : -1);

export interface LayerRow {
  ref: ThingRef;
  title: string;
  detail: string;
  /** Can be deleted from the Layers panel. */
  deletable: boolean;
  /** Can be dragged to change draw order (objects only, D95). */
  draggable?: boolean;
}

const rules = (n: number) => `${n} rule${n === 1 ? "" : "s"}`;
const points = (n: number) => `${n} point${n === 1 ? "" : "s"}`;

/**
 * Objects and placed characters in draw order, back to front (D95): by baseline,
 * ties keep file order with objects before characters, exactly as the engine sorts.
 * An object whose image isn't loaded yet sorts by its top edge.
 */
export function drawOrder(scene: SceneFile, images: ImageLookup): ThingRef[] {
  const items = [
    ...scene.objects.map((o) => ({ ref: { list: "objects" as const, key: o.id }, baseline: objectBaseline(o, images(o.image)?.size.h ?? 0) })),
    ...scene.characters.map((c) => ({ ref: { list: "characters" as const, key: c.character }, baseline: c.y })),
  ];
  return sortByBaseline(items).map((x) => x.ref);
}

/** The rows under each layer in the Layers panel, top of the stack first. */
export function layerRows(scene: SceneFile, images: ImageLookup): Record<Layer, LayerRow[]> {
  const objects = drawOrder(scene, images)
    .reverse() // front first, like a layer list
    .map((ref): LayerRow => {
      if (ref.list === "objects") {
        const o = scene.objects.find((x) => x.id === ref.key)!;
        return {
          ref,
          title: o.name ? `${o.name} (${o.id})` : o.id,
          detail: `${o.image}${o.visible ? "" : " · hidden"}${o.obstacle ? " · obstacle" : ""}${o.rules.length ? ` · ${rules(o.rules.length)}` : ""}`,
          deletable: true,
          draggable: true,
        };
      }
      const c = scene.characters.find((x) => x.character === ref.key)!;
      return { ref, title: c.character, detail: `character${c.visible ? "" : " · hidden"}${c.rules.length ? ` · ${rules(c.rules.length)}` : ""}`, deletable: true };
    });
  const { outer, holes } = scene.walkable;
  return {
    guides: [
      { ref: { list: "depth", key: "far" }, title: "Far line", detail: `y ${scene.depth.far.y} · ×${scene.depth.far.scale}`, deletable: false },
      { ref: { list: "depth", key: "near" }, title: "Near line", detail: `y ${scene.depth.near.y} · ×${scene.depth.near.scale}`, deletable: false },
      ...Object.entries(scene.spawns).map(([id, s]): LayerRow => ({ ref: { list: "spawns", key: id }, title: id, detail: `spawn (${s.x}, ${s.y}) ${s.facing}`, deletable: true })),
    ],
    regions: scene.regions.map((r) => ({ ref: { list: "regions", key: r.id }, title: r.id, detail: rules(r.rules.length), deletable: true })),
    hotspots: scene.hotspots.map((h) => ({ ref: { list: "hotspots", key: h.id }, title: `${h.name} (${h.id})`, detail: rules(h.rules.length), deletable: true })),
    walkable: [
      ...(outer.length ? [{ ref: { list: "walkable" as const, key: "outer" }, title: "Outline", detail: points(outer.length), deletable: true }] : []),
      ...holes.map((h, i) => ({ ref: { list: "walkable" as const, key: holeKey(i) }, title: `Hole ${i + 1}`, detail: points(h.length), deletable: true })),
    ],
    objects,
    background: scene.background ? [{ ref: { list: "background", key: "background" }, title: scene.background, detail: "image", deletable: false }] : [],
  };
}
