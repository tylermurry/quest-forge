import { z } from "zod";
import { Id, Text, schemaVersion } from "./common.ts";
import { GameRule } from "./rules.ts";

/** Reply when no rule matches a verb. */
export const DefaultResponses = z.strictObject({
  look: Text,
  hand: Text,
  talk: Text,
  use_item: Text,
  combine: Text,
});

/** `game.yaml`. */
export const GameFile = z.strictObject({
  schemaVersion,
  id: Id,
  title: Text,
  /** Bumped on export; save slots are keyed by game id + version. */
  version: z.int().positive(),
  startScene: Id,
  startSpawn: Id,
  /** Character ID of the player. */
  player: Id,
  maxScore: z.int().min(0),
  defaultResponses: DefaultResponses,
  /** Game-level rules: `combine` and `dialogue_end`. */
  rules: z.array(GameRule),
});
export type GameFile = z.infer<typeof GameFile>;
