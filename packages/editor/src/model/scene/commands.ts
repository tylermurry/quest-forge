// Scene-editing commands (spec 09): pure Project → Project functions, each run as
// one undo step through Editor.apply (D84). Geometry stays integer (spec 01).
import { SCENE_HEIGHT, SCENE_WIDTH, type Placement, type Point, type Polygon, type Project, type SceneFile } from "@questforge/schema";
import { CommandError, updateDoc } from "../commands.ts";
import { getPolygon, withPolygon, type PolyRef } from "./shapes.ts";
import { holeIndex, type ThingRef } from "./things.ts";

/** Replaces one scene's data. */
export const updateScene = (p: Project, sceneId: string, f: (s: SceneFile) => SceneFile): Project => updateDoc<SceneFile>(p, "scene", sceneId, f);

export const sceneOf = (p: Project, sceneId: string): SceneFile => {
  const s = p.scenes.find((d) => d.data.id === sceneId)?.data;
  if (!s) throw new CommandError(`There's no scene with ID ${sceneId}.`);
  return s;
};

const gone = () => new CommandError("That's no longer in the scene.");

/** The undo label for deleting a thing, e.g. "Delete hole". */
export function thingNoun(ref: ThingRef): string {
  switch (ref.list) {
    case "objects":
      return "object";
    case "characters":
      return "character placement";
    case "hotspots":
      return "hotspot";
    case "regions":
      return "region";
    case "spawns":
      return "spawn point";
    case "walkable":
      return ref.key === "outer" ? "walkable outline" : "hole";
    case "depth":
      return "depth line";
    case "background":
      return "background";
  }
}

/** Removes a thing from a scene (with its rules). Depth lines can't be removed. */
export function deleteThing(p: Project, sceneId: string, ref: ThingRef): Project {
  return updateScene(p, sceneId, (s) => {
    switch (ref.list) {
      case "objects":
      case "hotspots":
      case "regions": {
        const list = s[ref.list] as { id: string }[];
        if (!list.some((x) => x.id === ref.key)) throw gone();
        return { ...s, [ref.list]: list.filter((x) => x.id !== ref.key) };
      }
      case "characters":
        if (!s.characters.some((c) => c.character === ref.key)) throw gone();
        return { ...s, characters: s.characters.filter((c) => c.character !== ref.key) };
      case "spawns": {
        if (!(ref.key in s.spawns)) throw gone();
        const { [ref.key]: _gone, ...spawns } = s.spawns;
        return { ...s, spawns };
      }
      case "walkable": {
        // Deleting the outline keeps the holes, so a redrawn outline gets them back (D104).
        if (ref.key === "outer") return { ...s, walkable: { ...s.walkable, outer: [] } };
        const i = holeIndex(ref.key);
        if (!s.walkable.holes[i]) throw gone();
        return { ...s, walkable: { ...s.walkable, holes: s.walkable.holes.filter((_, j) => j !== i) } };
      }
      case "depth":
        throw new CommandError("Depth lines can't be deleted; drag them instead.");
      case "background":
        throw new CommandError("Choose a different background in the Inspector.");
    }
  });
}

// ── Geometry edits ───────────────────────────────────────────────────────────

const clampX = (x: number) => Math.min(SCENE_WIDTH, Math.max(0, Math.round(x)));
const clampY = (y: number) => Math.min(SCENE_HEIGHT, Math.max(0, Math.round(y)));

/**
 * Shrinks a whole-pixel move so every point stays inside the scene, keeping the
 * shape intact (rather than squashing it against the edge).
 */
export function clampDelta(points: readonly (readonly [number, number])[], dx: number, dy: number): [number, number] {
  let rx = Math.round(dx);
  let ry = Math.round(dy);
  for (const [x, y] of points) {
    rx = Math.max(-x, Math.min(SCENE_WIDTH - x, rx));
    ry = Math.max(-y, Math.min(SCENE_HEIGHT - y, ry));
  }
  return [rx, ry];
}

const shift = (poly: Polygon, dx: number, dy: number): Polygon => poly.map(([x, y]) => [x + dx, y + dy]);

function needPolygon(s: SceneFile, pr: PolyRef): Polygon {
  const poly = getPolygon(s, pr);
  if (!poly) throw gone();
  return poly;
}

/** Replaces one polygon (a vertex drag, a redraw). */
export function setPolygon(p: Project, sceneId: string, pr: PolyRef, poly: Polygon): Project {
  return updateScene(p, sceneId, (s) => {
    needPolygon(s, pr);
    return withPolygon(s, pr, poly.map(([x, y]) => [clampX(x), clampY(y)]));
  });
}

/** Moves one vertex to a scene point. */
export function moveVertex(p: Project, sceneId: string, pr: PolyRef, index: number, to: Point): Project {
  return updateScene(p, sceneId, (s) => {
    const poly = needPolygon(s, pr);
    if (!poly[index]) throw gone();
    return withPolygon(s, pr, poly.map((v, i) => (i === index ? [clampX(to[0]), clampY(to[1])] : v)));
  });
}

/** Alt-click (spec 09). A shape keeps at least 3 points. */
export function deleteVertex(p: Project, sceneId: string, pr: PolyRef, index: number): Project {
  return updateScene(p, sceneId, (s) => {
    const poly = needPolygon(s, pr);
    if (poly.length <= 3) throw new CommandError("A shape needs at least 3 points. Delete the whole shape instead.");
    return withPolygon(s, pr, poly.filter((_, i) => i !== index));
  });
}

/** Adds a vertex on the edge that starts at `index`. */
export function insertVertex(p: Project, sceneId: string, pr: PolyRef, index: number, at: Point): Project {
  return updateScene(p, sceneId, (s) => {
    const poly = needPolygon(s, pr);
    return withPolygon(s, pr, [...poly.slice(0, index + 1), [clampX(at[0]), clampY(at[1])], ...poly.slice(index + 1)]);
  });
}

/** Moves a whole polygon by a pixel delta (kept inside the scene). */
export function movePolygon(p: Project, sceneId: string, pr: PolyRef, dx: number, dy: number): Project {
  return updateScene(p, sceneId, (s) => {
    const poly = needPolygon(s, pr);
    const [rx, ry] = clampDelta(poly, dx, dy);
    return withPolygon(s, pr, shift(poly, rx, ry));
  });
}

/** Moves a placed object; its obstacle and baseline come along. */
export function moveObject(p: Project, sceneId: string, id: string, dx: number, dy: number): Project {
  return updateScene(p, sceneId, (s) => {
    const o = s.objects.find((x) => x.id === id);
    if (!o) throw gone();
    let [rx, ry] = [Math.round(dx), Math.round(dy)];
    rx = Math.max(-SCENE_WIDTH - o.x, Math.min(SCENE_WIDTH * 2 - o.x, rx));
    ry = Math.max(-SCENE_HEIGHT - o.y, Math.min(SCENE_HEIGHT * 2 - o.y, ry));
    // Attached geometry must stay inside the scene.
    const attached: [number, number][] = [...(o.obstacle ?? []), ...(o.baseline !== undefined ? [[0, o.baseline] as [number, number]] : [])];
    [rx, ry] = clampDelta(attached, rx, ry);
    const moved = { ...o, x: o.x + rx, y: o.y + ry };
    if (o.obstacle) moved.obstacle = shift(o.obstacle, rx, ry);
    if (o.baseline !== undefined) moved.baseline = o.baseline + ry;
    return { ...s, objects: s.objects.map((x) => (x === o ? moved : x)) };
  });
}

/** Moves a placed character's feet. */
export function moveCharacter(p: Project, sceneId: string, character: string, to: Point): Project {
  return updateScene(p, sceneId, (s) => {
    if (!s.characters.some((c) => c.character === character)) throw gone();
    return { ...s, characters: s.characters.map((c) => (c.character === character ? { ...c, x: clampX(to[0]), y: clampY(to[1]) } : c)) };
  });
}

/** Moves a spawn point. */
export function moveSpawn(p: Project, sceneId: string, id: string, to: Point): Project {
  return updateScene(p, sceneId, (s) => {
    const sp = s.spawns[id];
    if (!sp) throw gone();
    return { ...s, spawns: { ...s.spawns, [id]: { ...sp, x: clampX(to[0]), y: clampY(to[1]) } } };
  });
}

/** Sets or clears a hotspot's walk-to point. */
export function setWalkTo(p: Project, sceneId: string, hotspot: string, walkTo: Placement | undefined): Project {
  return updateScene(p, sceneId, (s) => {
    if (!s.hotspots.some((h) => h.id === hotspot)) throw gone();
    return {
      ...s,
      hotspots: s.hotspots.map((h) => {
        if (h.id !== hotspot) return h;
        const { walkTo: _old, ...rest } = h;
        return walkTo ? { ...rest, walkTo: { x: clampX(walkTo.x), y: clampY(walkTo.y), facing: walkTo.facing } } : rest;
      }),
    };
  });
}

/** Moves a depth line, keeping the far line above the near line. */
export function setDepthY(p: Project, sceneId: string, key: "far" | "near", y: number): Project {
  return updateScene(p, sceneId, (s) => {
    const other = key === "far" ? s.depth.near.y : s.depth.far.y;
    const clamped = key === "far" ? Math.min(clampY(y), other - 1) : Math.max(clampY(y), other + 1);
    const v = clampY(clamped);
    return { ...s, depth: { ...s.depth, [key]: { ...s.depth[key], y: v } } };
  });
}

/** Sets a depth line's scale (Inspector). */
export function setDepthScale(p: Project, sceneId: string, key: "far" | "near", scale: number): Project {
  if (!(scale > 0 && scale <= 4)) throw new CommandError("A depth scale must be more than 0 and at most 4.");
  return updateScene(p, sceneId, (s) => ({ ...s, depth: { ...s.depth, [key]: { ...s.depth[key], scale: Math.round(scale * 100) / 100 } } }));
}

/** Sets an object's baseline; undefined = Auto (its image's bottom edge, spec 04). */
export function setBaseline(p: Project, sceneId: string, id: string, y: number | undefined): Project {
  return updateScene(p, sceneId, (s) => {
    if (!s.objects.some((o) => o.id === id)) throw gone();
    return {
      ...s,
      objects: s.objects.map((o) => {
        if (o.id !== id) return o;
        const { baseline: _old, ...rest } = o;
        return y === undefined ? rest : { ...rest, baseline: clampY(y) };
      }),
    };
  });
}
