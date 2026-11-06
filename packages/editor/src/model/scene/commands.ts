// Scene-editing commands (spec 09): pure Project → Project functions, each run as
// one undo step through Editor.apply (D84). Geometry stays integer (spec 01).
import type { Project, SceneFile } from "@questforge/schema";
import { CommandError, updateDoc } from "../commands.ts";
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
