// Jump-to (spec 14, D120, D121): what a problem's location selects. A rule problem
// selects the exact hotspot, object, character, region, scene or Game, and keeps the
// data path so the rule inspector can scroll to and flash the rule part.
import { ASSET_LAYOUT, allDocs, type AssetKind, type DataPath, type Location, type Project, type SceneFile } from "@questforge/schema";
import { problemThing } from "./scene/problems.ts";
import type { ThingList } from "./scene/things.ts";
import type { EntryRef } from "./workspace.ts";

type JumpTarget =
  /** A browser entry: an asset (opens its tab), a flag, an image or a sound. */
  | { kind: "entry"; entry: EntryRef }
  /** A thing on a scene canvas. */
  | { kind: "sceneThing"; scene: string; list: ThingList; key: string }
  /** The scene itself, e.g. its own rules (D124). */
  | { kind: "scene"; scene: string }
  /** Game-level rules and settings (spec 10). */
  | { kind: "game" }
  /** A dialogue node: opens the dialogue's graph and selects the node (D121). */
  | { kind: "dialogueNode"; dialogue: string; node: string };

export interface Jump {
  target: JumpTarget;
  /** The problem's location, for highlighting the rule part it points at. */
  location: Location;
}

/** Where a problem's location points, or null if it's nowhere the editor can show. */
export function locate(project: Project, location: Location): Jump | null {
  const target = locateTarget(project, location);
  return target ? { target, location } : null;
}

function locateTarget(project: Project, { file, path }: Location): JumpTarget | null {
  if (file === project.game?.path) return { kind: "game" };
  if (file === project.flags?.path && path[0] === "flags" && typeof path[1] === "number") {
    const flag = project.flags.data.flags[path[1]];
    return flag ? { kind: "entry", entry: { section: "flag", id: flag.id } } : null;
  }
  if (file === project.assets?.path && (path[0] === "images" || path[0] === "audio") && typeof path[1] === "number") {
    const list = path[0] === "images" ? project.assets.data.images : project.assets.data.audio;
    const a = list[path[1]];
    return a ? { kind: "entry", entry: { section: path[0] === "images" ? "image" : "audio", id: a.id } } : null;
  }
  for (const { kind, doc } of allDocs(project)) {
    if (doc.path !== file || !(kind in ASSET_LAYOUT)) continue;
    const id = (doc.data as { id: string }).id;
    if (kind === "scene") return sceneTarget(id, doc.data as SceneFile, path);
    if (kind === "dialogue") {
      const node = typeof path[1] === "number" && path[0] === "nodes" ? (doc.data as { nodes: { id: string }[] }).nodes[path[1]] : undefined;
      if (node) return { kind: "dialogueNode", dialogue: id, node: node.id };
    }
    return { kind: "entry", entry: { section: kind as AssetKind, id } };
  }
  return null;
}

function sceneTarget(scene: string, data: SceneFile, path: DataPath): JumpTarget {
  const thing = problemThing(data, path);
  return thing ? { kind: "sceneThing", scene, ...thing } : { kind: "scene", scene };
}

/** Whether `path` is `prefix` or inside it, e.g. a condition inside a rule. */
export const pathWithin = (path: readonly (string | number)[], prefix: readonly (string | number)[]) =>
  prefix.length <= path.length && prefix.every((seg, i) => path[i] === seg);
