// Which things in a scene have validation problems (D100), so the canvas can mark
// them and the Inspector can explain them, ahead of M5's Problems panel. Reuses
// `validateProject`'s problems; never re-checks anything itself.
import type { Problem, SceneFile } from "@questforge/schema";
import { holeKey, type ThingRef } from "./things.ts";

export const thingKey = (ref: ThingRef) => `${ref.list}:${ref.key}`;

/** The thing a problem's data path points into, if it's inside the scene's contents. */
export function problemThing(scene: SceneFile, path: readonly (string | number)[]): ThingRef | null {
  const [head, a, b] = path;
  switch (head) {
    case "walkable":
      if (a === "outer") return { list: "walkable", key: "outer" };
      if (a === "holes" && typeof b === "number") return { list: "walkable", key: holeKey(b) };
      return null;
    case "hotspots":
    case "regions":
    case "objects": {
      const item = typeof a === "number" ? (scene[head] as { id: string }[])[a] : undefined;
      return item ? { list: head, key: item.id } : null;
    }
    case "characters": {
      const c = typeof a === "number" ? scene.characters[a] : undefined;
      return c ? { list: "characters", key: c.character } : null;
    }
    case "spawns":
      return typeof a === "string" ? { list: "spawns", key: a } : null;
    case "background":
      return { list: "background", key: "background" };
    default:
      return null;
  }
}

/** Problems in one scene's file, by thing (`list:key`), plus scene-wide ones under "". */
export function sceneProblems(problems: readonly Problem[], file: string, scene: SceneFile): Map<string, Problem[]> {
  const out = new Map<string, Problem[]>();
  for (const p of problems) {
    if (p.location.file !== file) continue;
    const ref = problemThing(scene, p.location.path);
    const key = ref ? thingKey(ref) : "";
    out.set(key, [...(out.get(key) ?? []), p]);
  }
  return out;
}
