import type { DialogueFile } from "./dialogue.ts";
import type { DataPath, FileKind, ProblemCode } from "./problems.ts";
import type { Project } from "./project.ts";
import type { Action, AnyRule, Condition } from "./rules.ts";
import type { SceneFile } from "./scene.ts";

// Spec 14 warnings (D122) and the empty-text error (D119). Warnings never block
// playtest or export; they point at things that are probably mistakes.

/** Where validate.ts collects problems. `crumbPath` defaults to the parent of `path`. */
export interface Report {
  error(code: ProblemCode, fileKind: FileKind, file: string, path: DataPath, message: string, crumbPath?: DataPath): void;
  warning(code: ProblemCode, fileKind: FileKind, file: string, path: DataPath, message: string, crumbPath?: DataPath): void;
}

/** One place that holds conditions and actions: a rule, or a dialogue node or choice. */
export interface LogicBlock {
  fileKind: FileKind;
  file: string;
  /** The scene whose file holds it; absent for game-level rules and dialogues. */
  scene?: string;
  conditions: { c: Condition; path: DataPath }[];
  actions: { a: Action; path: DataPath }[];
}

function ruleBlocks(fileKind: FileKind, file: string, scene: string | undefined, rules: AnyRule[], at: DataPath): LogicBlock[] {
  return rules.map((r, i) => ({
    fileKind,
    file,
    ...(scene !== undefined && { scene }),
    conditions: r.if.map((c, j) => ({ c, path: [...at, i, "if", j] })),
    actions: r.do.map((a, j) => ({ a, path: [...at, i, "do", j] })),
  }));
}

function sceneBlocks(file: string, s: SceneFile): LogicBlock[] {
  return [
    ...s.objects.flatMap((o, i) => ruleBlocks("scene", file, s.id, o.rules, ["objects", i, "rules"])),
    ...s.characters.flatMap((c, i) => ruleBlocks("scene", file, s.id, c.rules, ["characters", i, "rules"])),
    ...s.hotspots.flatMap((h, i) => ruleBlocks("scene", file, s.id, h.rules, ["hotspots", i, "rules"])),
    ...s.regions.flatMap((r, i) => ruleBlocks("scene", file, s.id, r.rules, ["regions", i, "rules"])),
    ...ruleBlocks("scene", file, s.id, s.rules, ["rules"]),
  ];
}

function dialogueBlocks(file: string, d: DialogueFile): LogicBlock[] {
  const block = (conditions: LogicBlock["conditions"], actions: LogicBlock["actions"]): LogicBlock => ({ fileKind: "dialogue", file, conditions, actions });
  return d.nodes.flatMap((n, i): LogicBlock[] => {
    const at = ["nodes", i];
    if (n.type === "actions") return [block([], n.do.map((a, j) => ({ a, path: [...at, "do", j] })))];
    if (n.type === "branch") return [block(n.if.map((c, j) => ({ c, path: [...at, "if", j] })), [])];
    if (n.type === "choices") return n.options.map((o, k) => block(o.if.map((c, j) => ({ c, path: [...at, "options", k, "if", j] })), []));
    return [];
  });
}

/** Every rule and dialogue node with logic in it, in file order. */
export function logicBlocks(project: Project): LogicBlock[] {
  return [
    ...(project.game ? ruleBlocks("game", project.game.path, undefined, project.game.data.rules, ["rules"]) : []),
    ...project.scenes.flatMap((s) => sceneBlocks(s.path, s.data)),
    ...project.dialogues.flatMap((d) => dialogueBlocks(d.path, d.data)),
  ];
}

const actionsOf = (blocks: LogicBlock[]) => blocks.flatMap((b) => b.actions.map((x) => ({ ...x, block: b })));
const conditionsOf = (blocks: LogicBlock[]) => blocks.flatMap((b) => b.conditions.map((x) => ({ ...x, block: b })));

/** Narration, lines and death messages need words (D119). */
function checkEmptyText(project: Project, blocks: LogicBlock[], out: Report) {
  const names = new Map(project.characters.map((c) => [c.data.id, c.data.name]));
  for (const { a, path, block } of actionsOf(blocks)) {
    if (a.type === "narrate" && a.text === "") out.error("empty_text", block.fileKind, block.file, [...path, "text"], "narrates nothing. Type what the narrator says.", path);
    if (a.type === "say" && a.text === "") out.error("empty_text", block.fileKind, block.file, [...path, "text"], `has ${names.get(a.character) ?? a.character} say nothing. Type the line.`, path);
    if (a.type === "die" && a.message === "") out.error("empty_text", block.fileKind, block.file, [...path, "message"], "ends the game with no message. Type what the player is told.", path);
  }
}

/** Scenes the player can never get to from the start scene (D122). */
function checkReachableScenes(project: Project, blocks: LogicBlock[], out: Report) {
  const start = project.game?.data.startScene;
  const ids = new Set(project.scenes.map((s) => s.data.id));
  if (start === undefined || !ids.has(start)) return; // start_scene_missing is reported
  const targets = new Map<string | undefined, string[]>();
  for (const { a, block } of actionsOf(blocks)) {
    if (a.type !== "change_scene") continue;
    targets.set(block.scene, [...(targets.get(block.scene) ?? []), a.scene]);
  }
  // Game-level rules and dialogues can run anywhere, so their targets count from the start.
  const reached = new Set<string>();
  const queue = [start, ...(targets.get(undefined) ?? [])];
  while (queue.length) {
    const id = queue.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    queue.push(...(targets.get(id) ?? []));
  }
  for (const { path, data } of project.scenes) {
    if (!reached.has(data.id)) {
      out.warning("scene_unreachable", "scene", path, [], "can't be reached: no Change scene leads here from the start scene.", []);
    }
  }
}

function checkBackgrounds(project: Project, out: Report) {
  for (const { path, data } of project.scenes) {
    if (data.background === undefined) out.warning("scene_no_background", "scene", path, ["background"], "has no background image, so it shows black.", []);
  }
}

function checkItemsGiven(project: Project, blocks: LogicBlock[], out: Report) {
  const given = new Set(actionsOf(blocks).flatMap(({ a }) => (a.type === "give_item" ? [a.item] : [])));
  for (const { path, data } of project.items) {
    if (!given.has(data.id)) out.warning("item_never_given", "item", path, [], "is never given to the player: no rule or dialogue gives it.", []);
  }
}

function checkFlagsUsed(project: Project, blocks: LogicBlock[], out: Report) {
  const flags = project.flags;
  if (!flags) return;
  const read = new Set(conditionsOf(blocks).flatMap(({ c }) => (c.type === "flag_is" ? [c.flag] : c.type === "counter" ? [c.counter] : [])));
  const set = new Set(actionsOf(blocks).flatMap(({ a }) => (a.type === "set_flag" ? [a.flag] : a.type === "add_to_counter" ? [a.counter] : [])));
  flags.data.flags.forEach((f, i) => {
    const noun = f.type === "bool" ? "flag" : "counter";
    const at = ["flags", i];
    if (!read.has(f.id) && !set.has(f.id)) out.warning("flag_unused", "flags", flags.path, at, `isn't used anywhere: no rule checks or changes this ${noun}.`, at);
    else if (!read.has(f.id)) out.warning("flag_never_read", "flags", flags.path, at, `is changed but never checked: no condition uses this ${noun}.`, at);
    else if (!set.has(f.id)) {
      const how = f.type === "bool" ? "Set flag" : "Add to counter";
      out.warning("flag_never_set", "flags", flags.path, at, `is checked but never changed, so it stays ${String(f.initial)}: no rule uses ${how} on it.`, at);
    }
  });
}

function checkDialogueNodes(project: Project, out: Report) {
  for (const { path, data } of project.dialogues) {
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const start = data.nodes.find((n) => n.type === "start");
    if (!start) continue; // dialogue_without_start is reported
    const reached = new Set<string>();
    const queue = [start.id];
    while (queue.length) {
      const id = queue.pop()!;
      const n = byId.get(id);
      if (!n || reached.has(id)) continue;
      reached.add(id);
      if (n.type === "choices") queue.push(...n.options.flatMap((o) => (o.next ? [o.next] : [])));
      else if (n.type === "branch") queue.push(...[n.then, n.else].filter((x): x is string => x !== null));
      else if (n.type !== "end" && n.next) queue.push(n.next);
    }
    data.nodes.forEach((n, i) => {
      if (!reached.has(n.id)) out.warning("dialogue_node_unreachable", "dialogue", path, ["nodes", i], "can't be reached from the Start node.", ["nodes", i]);
    });
  }
}

function checkHotspotRules(project: Project, out: Report) {
  for (const { path, data } of project.scenes) {
    data.hotspots.forEach((h, i) => {
      if (h.rules.length === 0) out.warning("hotspot_no_rules", "scene", path, ["hotspots", i, "rules"], "has no rules, so clicking it only gives the default responses.", ["hotspots", i]);
    });
  }
}

/** Each award ID counts once (spec 07), so the total is per unique ID. */
function checkAwards(project: Project, blocks: LogicBlock[], out: Report) {
  const points = new Map<string, number>();
  for (const { a, path, block } of actionsOf(blocks)) {
    if (a.type !== "award_points") continue;
    const first = points.get(a.award);
    if (first === undefined) points.set(a.award, a.points);
    else if (first !== a.points) {
      out.warning(
        "award_points_inconsistent",
        block.fileKind,
        block.file,
        [...path, "points"],
        `gives ${a.points} points for award ${a.award}, but another rule gives ${first} for it. An award counts once, so give it the same points everywhere.`,
        path,
      );
    }
  }
  const game = project.game;
  if (!game) return;
  const { total, awards: count } = awardTotal(project, blocks);
  if (total !== game.data.maxScore) {
    const awards = count === 1 ? "1 award" : `${count} awards`;
    out.warning("award_total_mismatch", "game", game.path, ["maxScore"], `The max score is ${game.data.maxScore}, but the awards add up to ${total} (${awards}).`, []);
  }
}

export function checkLogic(project: Project, out: Report) {
  const blocks = logicBlocks(project);
  checkEmptyText(project, blocks, out);
  checkReachableScenes(project, blocks, out);
  checkBackgrounds(project, out);
  checkItemsGiven(project, blocks, out);
  checkFlagsUsed(project, blocks, out);
  checkDialogueNodes(project, out);
  checkHotspotRules(project, out);
  checkAwards(project, blocks, out);
}

/**
 * What all awards add up to, each award ID counted once (spec 07). With mismatched
 * points for one ID the largest counts; the mismatch is a warning of its own.
 */
export function awardTotal(project: Project, blocks = logicBlocks(project)): { total: number; awards: number } {
  const best = new Map<string, number>();
  for (const { a } of actionsOf(blocks)) if (a.type === "award_points") best.set(a.award, Math.max(best.get(a.award) ?? 0, a.points));
  return { total: [...best.values()].reduce((s, n) => s + n, 0), awards: best.size };
}
