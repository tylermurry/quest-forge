// Game settings the Game inspector edits (spec 10): default verb responses (D40),
// the max score (spec 07) and where play starts. Pure Project → Project commands.
import type { GameFile, Project } from "@questforge/schema";
import { CommandError } from "./commands.ts";

export type ResponseVerb = keyof GameFile["defaultResponses"];
export const RESPONSE_VERBS: readonly ResponseVerb[] = ["look", "hand", "talk", "use_item", "combine"];
export const RESPONSE_LABEL: Record<ResponseVerb, string> = {
  look: "Look at something with no rule",
  hand: "Hand on something with no rule",
  talk: "Talk to something with no rule",
  use_item: "Use an item that doesn't work there",
  combine: "Combine items that don't go together",
};

function updateGame(p: Project, f: (g: GameFile) => GameFile): Project {
  if (!p.game) throw new CommandError("This project has no game settings.");
  return { ...p, game: { ...p.game, data: f(p.game.data) } };
}

export function setDefaultResponse(p: Project, verb: ResponseVerb, text: string): Project {
  if (!text.trim()) throw new CommandError("A default response needs some text.");
  return updateGame(p, (g) => ({ ...g, defaultResponses: { ...g.defaultResponses, [verb]: text } }));
}

export function setMaxScore(p: Project, maxScore: number): Project {
  if (!Number.isInteger(maxScore) || maxScore < 0) throw new CommandError("The max score is a whole number, 0 or more.");
  return updateGame(p, (g) => ({ ...g, maxScore }));
}

/** Start scene and spawn; a new scene starts at its `default` spawn, else its first. */
export function setStart(p: Project, startScene: string, startSpawn?: string): Project {
  const scene = p.scenes.find((s) => s.data.id === startScene)?.data;
  if (!scene) throw new CommandError(`There's no scene with ID ${startScene}.`);
  const spawns = Object.keys(scene.spawns);
  const spawn = startSpawn ?? (spawns.includes("default") ? "default" : spawns[0]);
  if (!spawn) throw new CommandError(`${scene.name} has no spawn point to start at.`);
  return updateGame(p, (g) => ({ ...g, startScene, startSpawn: spawn }));
}
