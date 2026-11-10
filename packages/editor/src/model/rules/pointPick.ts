// "Pick on canvas" for an action's point: the Inspector starts a
// pick, the scene canvas takes the next click, and the point lands as one undo step.
import { SCENE_HEIGHT, SCENE_WIDTH, type Action, type Project } from "@questforge/schema";
import { setActionFields } from "./commands.ts";
import { ownerScene, type RuleOwnerRef } from "./owner.ts";

export interface PointPick {
  owner: RuleOwnerRef;
  ruleId: string;
  /** The action's index in the rule. */
  index: number;
  /** The scene whose canvas takes the click. */
  scene: string;
}

/**
 * The scene a point is picked on: `set_character_position` picks on the scene it
 * names; `walk_player_to` on the rule's own scene, or for a game-level rule the scene
 * tab that's open (null when none is).
 */
export function pointPickScene(owner: RuleOwnerRef, action: Action, activeScene: string | null): string | null {
  if (action.type === "set_character_position") return action.scene;
  if (action.type === "walk_player_to" || action.type === "walk_character_to") return ownerScene(owner) ?? activeScene;
  return null;
}

/** Puts the picked point into the action: whole scene pixels, kept on the scene. */
export function applyPointPick(p: Project, pick: PointPick, at: readonly [number, number]): Project {
  const x = Math.min(SCENE_WIDTH, Math.max(0, Math.round(at[0])));
  const y = Math.min(SCENE_HEIGHT, Math.max(0, Math.round(at[1])));
  return setActionFields(p, pick.owner, pick.ruleId, pick.index, { x, y });
}
