// Who owns a rule list: a thing on a scene, the scene itself, or the game.
// DOM-free; every rule command goes through `ownerRules` / `updateOwnerRules`.
import type { AnyRule, DataPath, GameFile, Project, SceneFile, Trigger } from "@questforge/schema";
import { CommandError } from "../commands.ts";
import { sceneOf, updateScene } from "../scene/commands.ts";

/** Scene things that have rules. */
type RuleThingList = "objects" | "characters" | "hotspots" | "regions";

export type RuleOwnerRef =
  | { kind: "thing"; scene: string; list: RuleThingList; key: string }
  | { kind: "scene"; scene: string }
  | { kind: "game" };

const RULE_THING_LISTS: readonly RuleThingList[] = ["objects", "characters", "hotspots", "regions"];
const isRuleThingList = (list: string): list is RuleThingList => (RULE_THING_LISTS as readonly string[]).includes(list);

export type TriggerType = Trigger["type"];

/** The triggers a rule may use where it lives; the schema enforces the same split. */
export function ownerTriggers(owner: RuleOwnerRef): TriggerType[] {
  if (owner.kind === "game") return ["combine", "dialogue_end"];
  if (owner.kind === "scene") return ["scene_enter", "scene_exit"];
  if (owner.list === "regions") return ["enter_region"];
  return ["look", "hand", "talk", "walk", "use_item"];
}

/** Stable key for merge keys and React keys. */
export const ownerKey = (o: RuleOwnerRef) => (o.kind === "game" ? "game" : o.kind === "scene" ? `${o.scene}/scene` : `${o.scene}/${o.list}:${o.key}`);

/** The scene a rule runs in, if it belongs to one (game-level rules run anywhere). */
export const ownerScene = (o: RuleOwnerRef): string | undefined => (o.kind === "game" ? undefined : o.scene);

type Thing = { rules: AnyRule[] };

function thingIndex(s: SceneFile, list: RuleThingList, key: string): number {
  return list === "characters" ? s.characters.findIndex((c) => c.character === key) : (s[list] as { id: string }[]).findIndex((t) => t.id === key);
}

export interface OwnerRules {
  file: string;
  /** Where the list lives in the file, e.g. `["hotspots", 2, "rules"]`. */
  path: DataPath;
  rules: AnyRule[];
}

/** The owner's rules, or null if the owner no longer exists. */
export function ownerRules(p: Project, owner: RuleOwnerRef): OwnerRules | null {
  if (owner.kind === "game") return p.game ? { file: p.game.path, path: ["rules"], rules: p.game.data.rules } : null;
  const doc = p.scenes.find((s) => s.data.id === owner.scene);
  if (!doc) return null;
  if (owner.kind === "scene") return { file: doc.path, path: ["rules"], rules: doc.data.rules };
  const i = thingIndex(doc.data, owner.list, owner.key);
  if (i < 0) return null;
  return { file: doc.path, path: [owner.list, i, "rules"], rules: (doc.data[owner.list][i] as Thing).rules };
}

const gone = () => new CommandError("That's no longer there.");

/** Replaces the owner's rule list. Throws a CommandError if the owner is gone. */
export function updateOwnerRules(p: Project, owner: RuleOwnerRef, f: (rules: AnyRule[]) => AnyRule[]): Project {
  if (owner.kind === "game") {
    const game = p.game;
    if (!game) throw gone();
    return { ...p, game: { ...game, data: { ...game.data, rules: f(game.data.rules) as GameFile["rules"] } } };
  }
  sceneOf(p, owner.scene);
  return updateScene(p, owner.scene, (s) => {
    if (owner.kind === "scene") return { ...s, rules: f(s.rules) as SceneFile["rules"] };
    const i = thingIndex(s, owner.list, owner.key);
    if (i < 0) throw gone();
    const list = [...s[owner.list]] as Thing[];
    list[i] = { ...list[i]!, rules: f(list[i]!.rules) };
    return { ...s, [owner.list]: list };
  });
}

/** The rule owner a scene-thing selection stands for, if that thing has rules. */
export function thingOwner(scene: string, list: string, key: string): RuleOwnerRef | null {
  return isRuleThingList(list) ? { kind: "thing", scene, list, key } : null;
}

/** A free rule ID in this list: `rule_<n>` one past the highest used. */
export function newRuleId(rules: readonly AnyRule[]): string {
  let max = 0;
  for (const r of rules) {
    const m = /^rule_(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `rule_${max + 1}`;
}
