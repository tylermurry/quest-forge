// Scene-editing commands: pure Project → Project functions, each run as
// one undo step through Editor.apply. Geometry stays integer.
import {
  RenameError,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  renameSceneId,
  type Facing,
  type Placement,
  type Point,
  type Polygon,
  type Project,
  type SceneFile,
} from "@questforge/schema";
import { CommandError, uniqueId, updateDoc } from "../commands.ts";
import { getPolygon, withPolygon, type PolyRef } from "./shapes.ts";
import { holeIndex, holeKey, type ThingRef } from "./things.ts";

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
        // Deleting the outline keeps the holes, so a redrawn outline gets them back.
        if (ref.key === "outer") return { ...s, walkable: { ...s.walkable, outer: [] } };
        const i = holeIndex(ref.key);
        if (!s.walkable.holes[i]) throw gone();
        return { ...s, walkable: { ...s.walkable, holes: s.walkable.holes.filter((_, j) => j !== i) } };
      }
      case "depth":
        throw new CommandError("Depth lines can't be deleted; drag them instead.");
      case "background": {
        const { background: _old, ...rest } = s;
        return rest;
      }
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
function clampDelta(points: readonly (readonly [number, number])[], dx: number, dy: number): [number, number] {
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

/** Moves one vertex to a scene point. */
export function moveVertex(p: Project, sceneId: string, pr: PolyRef, index: number, to: Point): Project {
  return updateScene(p, sceneId, (s) => {
    const poly = needPolygon(s, pr);
    if (!poly[index]) throw gone();
    return withPolygon(
      s,
      pr,
      poly.map((v, i) => (i === index ? [clampX(to[0]), clampY(to[1])] : v)),
    );
  });
}

/** Alt-click. A shape keeps at least 3 points. */
export function deleteVertex(p: Project, sceneId: string, pr: PolyRef, index: number): Project {
  return updateScene(p, sceneId, (s) => {
    const poly = needPolygon(s, pr);
    if (poly.length <= 3) throw new CommandError("A shape needs at least 3 points. Delete the whole shape instead.");
    return withPolygon(
      s,
      pr,
      poly.filter((_, i) => i !== index),
    );
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
    // Attached geometry must stay inside the scene. The baseline is a height only, so it limits
    // the vertical move and never the horizontal one.
    [rx, ry] = clampDelta(o.obstacle ?? [], rx, ry);
    if (o.baseline !== undefined) ry = Math.max(-o.baseline, Math.min(SCENE_HEIGHT - o.baseline, ry));
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

/** Sets an object's baseline; undefined = Auto (its image's bottom edge). */
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

// ── New shapes ────────────────────────────────────────────────────────

/** What a closed polygon becomes, decided by the active layer. */
export type DrawTarget = { kind: "outline" } | { kind: "hole" } | { kind: "hotspot" } | { kind: "region" } | { kind: "obstacle"; object: string };

export const DRAW_LABEL: Record<DrawTarget["kind"], string> = {
  outline: "Draw walkable area",
  hole: "Draw hole",
  hotspot: "Draw hotspot",
  region: "Draw region",
  obstacle: "Draw obstacle",
};

/** IDs used inside a scene by objects, hotspots and regions (each list must be unique). */
const listIds = (s: SceneFile, list: "hotspots" | "regions" | "objects") => (s[list] as { id: string }[]).map((x) => x.id);

/** "Hotspot", "Hotspot 2", … matching `hotspot`, `hotspot_2`, …. */
const defaultName = (base: string, id: string) => {
  const n = id.slice(base.length + 1);
  const word = base[0]!.toUpperCase() + base.slice(1);
  return n ? `${word} ${n}` : word;
};

/** Adds a closed polygon as the target says; returns what it made, for selecting. */
export function createShape(p: Project, sceneId: string, target: DrawTarget, poly: Polygon): { project: Project; ref: ThingRef } {
  const clean: Polygon = poly.map(([x, y]) => [clampX(x), clampY(y)]);
  if (clean.length < 3) throw new CommandError("A shape needs at least 3 points.");
  let ref: ThingRef = { list: "walkable", key: "outer" };
  const project = updateScene(p, sceneId, (s) => {
    switch (target.kind) {
      case "outline":
        if (s.walkable.outer.length) throw new CommandError("This scene already has a walkable outline. Delete it first to draw a new one.");
        return { ...s, walkable: { ...s.walkable, outer: clean } };
      case "hole":
        ref = { list: "walkable", key: holeKey(s.walkable.holes.length) };
        return { ...s, walkable: { ...s.walkable, holes: [...s.walkable.holes, clean] } };
      case "hotspot": {
        const id = uniqueId("hotspot", listIds(s, "hotspots"));
        ref = { list: "hotspots", key: id };
        return { ...s, hotspots: [...s.hotspots, { id, name: defaultName("hotspot", id), shape: clean, rules: [] }] };
      }
      case "region": {
        const id = uniqueId("region", listIds(s, "regions"));
        ref = { list: "regions", key: id };
        return { ...s, regions: [...s.regions, { id, shape: clean, rules: [] }] };
      }
      case "obstacle":
        if (!s.objects.some((o) => o.id === target.object)) throw gone();
        ref = { list: "objects", key: target.object };
        return { ...s, objects: s.objects.map((o) => (o.id === target.object ? { ...o, obstacle: clean } : o)) };
    }
  });
  return { project, ref };
}

/** Adds a spawn point. The first one in a scene is `default` (game.startSpawn usually names it). */
export function addSpawn(p: Project, sceneId: string, at: Placement): { project: Project; id: string } {
  let id = "default";
  const project = updateScene(p, sceneId, (s) => {
    id = "default" in s.spawns ? uniqueId("spawn", Object.keys(s.spawns)) : "default";
    return { ...s, spawns: { ...s.spawns, [id]: { x: clampX(at.x), y: clampY(at.y), facing: at.facing } } };
  });
  return { project, id };
}

/** Sets a spawn point's facing (Inspector, or a drag with the Spawn tool). */
export function setSpawn(p: Project, sceneId: string, id: string, at: Placement): Project {
  return updateScene(p, sceneId, (s) => {
    if (!s.spawns[id]) throw gone();
    return { ...s, spawns: { ...s.spawns, [id]: { x: clampX(at.x), y: clampY(at.y), facing: at.facing } } };
  });
}

// ── Objects layer ───────────────────────────────────────

/** An object ID from its image's ID: `palm_img` → `palm`. */
const objectIdFor = (imageId: string) => imageId.replace(/_(img|image|sprite|png)$/, "") || imageId;

/**
 * Places an image as a new object with its bottom-centre at the drop point (where
 * its feet would be), or its top-left there if the image's size isn't known yet.
 */
export function placeImage(p: Project, sceneId: string, imageId: string, at: Point, size?: { w: number; h: number }): { project: Project; id: string } {
  if (!p.assets?.data.images.some((i) => i.id === imageId)) throw new CommandError(`There's no image with ID ${imageId}.`);
  let id = "";
  const project = updateScene(p, sceneId, (s) => {
    id = uniqueId(objectIdFor(imageId), listIds(s, "objects"));
    const x = size ? Math.round(at[0] - size.w / 2) : at[0];
    const y = size ? Math.round(at[1] - size.h) : at[1];
    const object = {
      id,
      image: imageId,
      x: Math.max(-SCENE_WIDTH, Math.min(SCENE_WIDTH * 2, x)),
      y: Math.max(-SCENE_HEIGHT, Math.min(SCENE_HEIGHT * 2, y)),
      visible: true,
      rules: [],
    };
    return { ...s, objects: [...s.objects, object] };
  });
  return { project, id };
}

/** Places a character with its feet at the drop point. The player and repeats are refused. */
export function placeCharacter(p: Project, sceneId: string, character: string, at: Point): Project {
  if (!p.characters.some((c) => c.data.id === character)) throw new CommandError(`There's no character with ID ${character}.`);
  if (p.game?.data.player === character)
    throw new CommandError("The player appears at spawn points, so they aren't placed in scenes. Add a spawn point instead.");
  return updateScene(p, sceneId, (s) => {
    if (s.characters.some((c) => c.character === character)) throw new CommandError(`${character} is already in this scene. Move them instead.`);
    return { ...s, characters: [...s.characters, { character, x: clampX(at[0]), y: clampY(at[1]), facing: "down", visible: true, rules: [] }] };
  });
}

/**
 * Moves an object in the Objects list. The list is draw order, so this sets
 * the object's baseline between its new neighbours; with no room between them it
 * takes the one behind's baseline and moves after it in file order (ties keep file
 * order). `order` is back to front, as `drawOrder` returns; `index` is the object's
 * new place in it (after removing it).
 */
export function reorderObject(p: Project, sceneId: string, id: string, order: readonly { ref: ThingRef; baseline: number }[], index: number): Project {
  return updateScene(p, sceneId, (s) => {
    const o = s.objects.find((x) => x.id === id);
    if (!o) throw gone();
    const rest = order.filter((x) => !(x.ref.list === "objects" && x.ref.key === id));
    const behind = rest[index - 1];
    const front = rest[index];
    let baseline: number;
    let after: string | null = null;
    if (behind && front) {
      if (front.baseline - behind.baseline >= 2) baseline = Math.round((behind.baseline + front.baseline) / 2);
      else {
        baseline = behind.baseline;
        if (behind.ref.list === "objects") after = behind.ref.key;
      }
    } else if (behind) baseline = behind.baseline + 1;
    else if (front) baseline = front.baseline - 1;
    else return s;
    const moved = { ...o, baseline: clampY(baseline) };
    let objects = s.objects.filter((x) => x.id !== id);
    const at = after ? objects.findIndex((x) => x.id === after) + 1 : objects.length;
    objects = after ? [...objects.slice(0, at), moved, ...objects.slice(at)] : s.objects.map((x) => (x.id === id ? moved : x));
    return { ...s, objects };
  });
}

/** Sets or removes a scene's background image. */
export function setBackground(p: Project, sceneId: string, imageId: string | undefined): Project {
  if (imageId !== undefined && !p.assets?.data.images.some((i) => i.id === imageId)) throw new CommandError(`There's no image with ID ${imageId}.`);
  return updateScene(p, sceneId, (s) => {
    const { background: _old, ...rest } = s;
    return imageId === undefined ? rest : { ...rest, background: imageId };
  });
}

/** Sets or removes a scene's music: the track that plays while the player is in it. */
export function setSceneMusic(p: Project, sceneId: string, audioId: string | undefined): Project {
  if (audioId !== undefined && !p.assets?.data.audio.some((a) => a.id === audioId)) throw new CommandError(`There's no sound with ID ${audioId}.`);
  return updateScene(p, sceneId, (s) => {
    const { music: _old, ...rest } = s;
    return audioId === undefined ? rest : { ...rest, music: audioId };
  });
}

// ── Inspector fields ───────────────────────────────────────────────────

/** Changes the ID of an object, spawn, hotspot or region and everything that refers to it. */
export function changeThingId(p: Project, sceneId: string, ref: ThingRef, to: string): Project {
  const kind = ({ objects: "object", spawns: "spawn", hotspots: "hotspot", regions: "region" } as const)[ref.list as "objects"];
  if (!kind) throw new CommandError("That can't have its ID changed.");
  try {
    return renameSceneId(p, sceneId, kind, ref.key, to);
  } catch (e) {
    if (e instanceof RenameError) throw new CommandError(`${e.message}.`);
    throw e;
  }
}

/** Sets a hotspot's name (shown to the player), or an object's (empty = not clickable). */
export function setThingName(p: Project, sceneId: string, ref: ThingRef, name: string): Project {
  return updateScene(p, sceneId, (s) => {
    if (ref.list === "hotspots") {
      if (!name.trim()) throw new CommandError("A hotspot needs a name; it's what the player sees.");
      return { ...s, hotspots: s.hotspots.map((h) => (h.id === ref.key ? { ...h, name } : h)) };
    }
    if (ref.list === "objects") {
      return {
        ...s,
        objects: s.objects.map((o) => {
          if (o.id !== ref.key) return o;
          const { name: _old, ...rest } = o;
          // The serializer writes keys in schema order, so where `name` goes here doesn't matter.
          return name.trim() ? { ...rest, name } : rest;
        }),
      };
    }
    throw new CommandError("That has no name.");
  });
}

type ObjectFields = Partial<Pick<SceneFile["objects"][number], "image" | "x" | "y" | "visible">>;

/** Edits an object's image, position or initial visibility. */
export function setObjectFields(p: Project, sceneId: string, id: string, f: ObjectFields): Project {
  if (f.image !== undefined && !p.assets?.data.images.some((i) => i.id === f.image)) throw new CommandError(`There's no image with ID ${f.image}.`);
  return updateScene(p, sceneId, (s) => {
    if (!s.objects.some((o) => o.id === id)) throw gone();
    const x = f.x === undefined ? {} : { x: Math.max(-SCENE_WIDTH, Math.min(SCENE_WIDTH * 2, Math.round(f.x))) };
    const y = f.y === undefined ? {} : { y: Math.max(-SCENE_HEIGHT, Math.min(SCENE_HEIGHT * 2, Math.round(f.y))) };
    return { ...s, objects: s.objects.map((o) => (o.id === id ? { ...o, ...f, ...x, ...y } : o)) };
  });
}

/**
 * Gives an object a starting obstacle: a strip along its baseline as wide as
 * its image, which the user then shapes. `size` is the image's size.
 */
export function addObstacle(p: Project, sceneId: string, id: string, size: { w: number; h: number }): Project {
  return updateScene(p, sceneId, (s) => {
    const o = s.objects.find((x) => x.id === id);
    if (!o) throw gone();
    const base = clampY(o.baseline ?? o.y + size.h);
    const top = clampY(base - Math.max(4, Math.round(size.h / 6)));
    const x0 = clampX(o.x);
    const x1 = clampX(o.x + size.w);
    if (x1 - x0 < 1 || base - top < 1) throw new CommandError("This object is outside the scene, so it can't block walking here.");
    return {
      ...s,
      objects: s.objects.map((x) =>
        x === o
          ? {
              ...o,
              obstacle: [
                [x0, top],
                [x1, top],
                [x1, base],
                [x0, base],
              ],
            }
          : x,
      ),
    };
  });
}

export function removeObstacle(p: Project, sceneId: string, id: string): Project {
  return updateScene(p, sceneId, (s) => ({
    ...s,
    objects: s.objects.map((o) => {
      if (o.id !== id) return o;
      const { obstacle: _old, ...rest } = o;
      return rest;
    }),
  }));
}

/** Edits a placed character. */
export function setPlacement(p: Project, sceneId: string, character: string, f: Partial<{ x: number; y: number; facing: Facing; visible: boolean }>): Project {
  return updateScene(p, sceneId, (s) => {
    if (!s.characters.some((c) => c.character === character)) throw gone();
    const x = f.x === undefined ? {} : { x: clampX(f.x) };
    const y = f.y === undefined ? {} : { y: clampY(f.y) };
    return { ...s, characters: s.characters.map((c) => (c.character === character ? { ...c, ...f, ...x, ...y } : c)) };
  });
}
