import { nodePorts, reachableNodes, silentLoops, type DialogueFile } from "./dialogue.ts";
import type { DataPath, FileKind, ProblemCode } from "./problems.ts";
import type { Project } from "./project.ts";
import type { Action, AnyRule, Condition } from "./rules.ts";
import type { SceneFile } from "./scene.ts";

// Spec 14 warnings and the empty-text error. Warnings never block
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

/** Narration, lines and death messages need words. */
function checkEmptyText(project: Project, blocks: LogicBlock[], out: Report) {
  const names = new Map(project.characters.map((c) => [c.data.id, c.data.name]));
  for (const { a, path, block } of actionsOf(blocks)) {
    if (a.type === "narrate" && a.text === "") out.error("empty_text", block.fileKind, block.file, [...path, "text"], "narrates nothing. Type what the narrator says.", path);
    if (a.type === "say" && a.text === "") out.error("empty_text", block.fileKind, block.file, [...path, "text"], `has ${names.get(a.character) ?? a.character} say nothing. Type the line.`, path);
    if (a.type === "die" && a.message === "") out.error("empty_text", block.fileKind, block.file, [...path, "message"], "ends the game with no message. Type what the player is told.", path);
  }
}

/** Scenes the player can never get to from the start scene. */
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

const NODE_NOUN: Record<string, string> = { start: "Start", line: "Line", choices: "Choices", actions: "Actions", branch: "Branch", end: "End" };

/**
 * Dialogue graph warnings: nodes Start can't reach, Choices with no
 * options, ports that lead nowhere (the dialogue just ends there) and loops with no
 * Line or Choices. Empty line, question and option text is an error.
 */
function checkDialogueNodes(project: Project, out: Report) {
  for (const { path, data } of project.dialogues) {
    const hasStart = data.nodes.some((n) => n.type === "start");
    const reached = reachableNodes(data);
    const index = new Map(data.nodes.map((n, i) => [n.id, i]));
    data.nodes.forEach((n, i) => {
      const at = ["nodes", i];
      // Without a Start, dialogue_without_start is reported instead.
      if (hasStart && !reached.has(n.id)) out.warning("dialogue_node_unreachable", "dialogue", path, at, "can't be reached from the Start node.", at);
      if (n.type === "line" && n.text === "") out.error("empty_text", "dialogue", path, [...at, "text"], "says nothing. Type the line.", at);
      if (n.type === "choices") {
        if (n.text === "") out.error("empty_text", "dialogue", path, [...at, "text"], "asks nothing. Type the question.", at);
        if (n.options.length === 0) out.warning("dialogue_no_options", "dialogue", path, [...at, "options"], "has no options, so the dialogue ends when it gets here.", at);
        n.options.forEach((o, j) => {
          if (o.text === "") out.error("empty_text", "dialogue", path, [...at, "options", j, "text"], "is an option with no text. Type what the player can say.", [...at, "options", j]);
        });
      }
      for (const p of nodePorts(n)) {
        if (p.next !== null) continue;
        const what = p.port === "next" ? "Its output" : p.port === "then" ? "Its true output" : p.port === "else" ? "Its false output" : "This option";
        const crumb = p.port.startsWith("option:") ? [...at, "options", p.path[1]!] : at;
        out.warning("dialogue_dead_end", "dialogue", path, [...at, ...p.path], `${what} isn't connected, so the dialogue ends there. Connect it, or to end on purpose, connect it to an End node.`, crumb);
      }
    });
    for (const loop of silentLoops(data)) {
      const i = index.get(loop[0]!)!;
      const names = loop.map((id) => `${NODE_NOUN[data.nodes[index.get(id)!]!.type]} ${id}`).join(", ");
      out.warning("dialogue_silent_loop", "dialogue", path, ["nodes", i], `is in a loop with no Line or Choices (${names}), so it would repeat forever without the player. The game stops the dialogue there.`, ["nodes", i]);
    }
  }
}

function checkHotspotRules(project: Project, out: Report) {
  for (const { path, data } of project.scenes) {
    data.hotspots.forEach((h, i) => {
      if (h.rules.length === 0) out.warning("hotspot_no_rules", "scene", path, ["hotspots", i, "rules"], "has no rules, so clicking it only gives the default responses.", ["hotspots", i]);
    });
  }
}

/** Each award ID counts once, so the total is per unique ID. */
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
 * What all awards add up to, each award ID counted once. With mismatched
 * points for one ID the largest counts; the mismatch is a warning of its own.
 */
export function awardTotal(project: Project, blocks = logicBlocks(project)): { total: number; awards: number } {
  const best = new Map<string, number>();
  for (const { a } of actionsOf(blocks)) if (a.type === "award_points") best.set(a.award, Math.max(best.get(a.award) ?? 0, a.points));
  return { total: [...best.values()].reduce((s, n) => s + n, 0), awards: best.size };
}
