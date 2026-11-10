// The playtest event log: the engine's trace events in plain
// English, worded like the rule cards (vocab.ts). Each line about a rule can jump
// to it (and to the failed condition) in the rule inspector through `ws.jumpTo`.
import type { RuleOwner, TraceEvent } from "@questforge/engine";
import type { Action, Condition, DataPath, DialogueNode, Project, Trigger } from "@questforge/schema";
import { locate, type Jump } from "../locate.ts";
import { ownerRules, type RuleOwnerRef } from "../rules/owner.ts";
import { pickerOptions } from "../rules/pickers.ts";
import { ACTION_LABEL, ACTION_PARTS, CONDITION_LABEL, CONDITION_PARTS, TRIGGER_LABEL, TRIGGER_PARTS, type Part } from "../rules/vocab.ts";

/** The log keeps this many lines. */
const LOG_LIMIT = 500;

export type LogTone = "trigger" | "match" | "skip" | "default" | "action" | "scene" | "note";

export interface LogLine {
  text: string;
  tone: LogTone;
  /** 0 = what the player did, 1 = rule verdicts and actions under it. */
  depth: 0 | 1;
  /** Where the line's rule (or failed condition) is, in the project as it is now. */
  jump?: Jump;
}

/** The editor's name for an engine rule owner. */
function ownerRef(o: RuleOwner): RuleOwnerRef {
  switch (o.kind) {
    case "game":
      return { kind: "game" };
    case "scene":
      return { kind: "scene", scene: o.scene };
    default:
      return { kind: "thing", scene: o.scene, list: `${o.kind}s` as "hotspots" | "objects" | "characters" | "regions", key: o.id };
  }
}

const quote = (t: string) => `“${t.length > 70 ? `${t.slice(0, 69)}…` : t}”`;

/** A sentence from vocab parts with the values filled in, e.g. `Player has Fishing rod`. */
function sentence(p: Project, label: string, parts: Part[], values: Record<string, unknown>): string {
  const words = [label];
  for (const part of parts) {
    if (typeof part === "string") {
      words.push(part);
      continue;
    }
    switch (part.kind) {
      case "pick": {
        const id = String(values[part.key] ?? "");
        const scope = part.scopeKey ? String(values[part.scopeKey] ?? "") : undefined;
        words.push(pickerOptions(p, part.pick, scope).find((o) => o.id === id)?.label ?? id);
        break;
      }
      case "text":
        words.push(quote(String(values[part.key] ?? "")));
        break;
      case "int":
      case "number":
        words.push(String(values[part.key]));
        break;
      case "bool":
        words.push(values[part.key] ? part.on : part.off);
        break;
      case "enum":
        words.push(part.options.find((o) => o.value === values[part.key])?.label ?? String(values[part.key]));
        break;
      case "point":
        words.push(`(${String(values.x)}, ${String(values.y)})`);
        break;
      case "animTarget": {
        const t = values.target as { kind: string; character?: string; object?: string } | undefined;
        words.push(t?.kind === "character" ? String(t.character) : String(t?.object));
        break;
      }
    }
  }
  return words.filter((w) => w !== "").join(" ");
}

export const conditionText = (p: Project, c: Condition) =>
  sentence(p, CONDITION_LABEL[c.type], CONDITION_PARTS[c.type], c as unknown as Record<string, unknown>);
export const actionText = (p: Project, a: Action) => sentence(p, ACTION_LABEL[a.type], ACTION_PARTS[a.type], a as unknown as Record<string, unknown>);
const triggerText = (p: Project, t: Trigger) => sentence(p, TRIGGER_LABEL[t.type], TRIGGER_PARTS[t.type], t as unknown as Record<string, unknown>);

/** What the player clicked or walked into, e.g. `pond`, `Gardener`, `region exit_shed`, `Game`. */
function ownerName(p: Project, o: RuleOwner): string {
  if (o.kind === "game") return "Game";
  const scene = p.scenes.find((s) => s.data.id === o.scene)?.data;
  switch (o.kind) {
    case "scene":
      return scene?.name ?? o.scene;
    case "hotspot":
      return scene?.hotspots.find((h) => h.id === o.id)?.name ?? o.id;
    case "object":
      return scene?.objects.find((x) => x.id === o.id)?.name ?? o.id;
    case "character":
      return p.characters.find((c) => c.data.id === o.id)?.data.name ?? o.id;
    case "region":
      return `region ${o.id}`;
  }
}

const sceneName = (p: Project, id: string) => p.scenes.find((s) => s.data.id === id)?.data.name ?? id;

/** Jump to a rule by ID (it may have moved since the run started), or into one of its conditions. */
function ruleJump(now: Project, o: RuleOwner, ruleId: string, condition?: number): Jump | undefined {
  const owned = ownerRules(now, ownerRef(o));
  const i = owned?.rules.findIndex((r) => r.id === ruleId) ?? -1;
  if (!owned || i < 0) return undefined;
  const path = [...owned.path, i, ...(condition === undefined ? [] : ["if", condition])];
  return locate(now, { file: owned.file, path }) ?? undefined;
}

/** "Look → pond", "Use Fishing rod → door", "Player walks in → region exit_shed". */
function triggerLine(p: Project, owner: RuleOwner, t: Trigger): string {
  const what = triggerText(p, t).replace(/^Use with /, "Use ");
  if (t.type === "scene_enter" || t.type === "scene_exit" || t.type === "combine" || t.type === "dialogue_end") return `${what} (${ownerName(p, owner)})`;
  return `${what} → ${ownerName(p, owner)}`;
}

// ── Dialogues ─────────────────────────────────────────────────────

const dialogueName = (p: Project, id: string) => p.dialogues.find((d) => d.data.id === id)?.data.name ?? id;

/** Jump to a node (or a spot inside it) by ID, in the project as it is now. */
function nodeJump(now: Project, dialogue: string, node: string, sub: DataPath = []): Jump | undefined {
  const doc = now.dialogues.find((d) => d.data.id === dialogue);
  const i = doc?.data.nodes.findIndex((n) => n.id === node) ?? -1;
  if (!doc || i < 0) return undefined;
  return locate(now, { file: doc.path, path: ["nodes", i, ...sub] }) ?? undefined;
}

function optionOf(p: Project, dialogue: string, node: string, option: string) {
  const n = p.dialogues.find((d) => d.data.id === dialogue)?.data.nodes.find((x) => x.id === node);
  const i = n?.type === "choices" ? n.options.findIndex((o) => o.id === option) : -1;
  return n?.type === "choices" && i >= 0 ? { index: i, text: n.options[i]!.text || option } : { index: -1, text: option };
}

function nodeLine(ran: Project, now: Project, dialogue: string, n: DialogueNode): LogLine | null {
  const jump = nodeJump(now, dialogue, n.id);
  switch (n.type) {
    case "line": {
      const who = n.character === undefined ? "Narrator" : (ran.characters.find((c) => c.data.id === n.character)?.data.name ?? n.character);
      return { text: `${who}: ${quote(n.text)}`, tone: "action", depth: 1, jump };
    }
    case "actions":
      return { text: `Actions (${n.id})`, tone: "action", depth: 1, jump };
    case "end":
      return { text: "End node", tone: "action", depth: 1, jump };
    default:
      // Start says nothing; Choices and Branch have lines of their own.
      return null;
  }
}

const END_TEXT = {
  end: "ends",
  dead_end: "ends: nothing is connected there",
  loop: "was stopped: it looped with no Line or Choices",
  cut: "was cut short",
} as const;

/**
 * Turns trace events into log lines. `ran` is the project the run played (rule
 * numbers and names as they were); `now` is the editor's project, for jump-to.
 */
export function formatLog(events: readonly TraceEvent[], ran: Project, now: Project): LogLine[] {
  const out: LogLine[] = [];
  /** Rules for other triggers since the last trigger, folded into one line. */
  let otherVerbs = 0;
  let pending: { owner: RuleOwner; trigger: Trigger; index: number; sameType: number } | null = null;
  const flushOthers = () => {
    if (otherVerbs > 0) out.push({ text: `${otherVerbs} ${otherVerbs === 1 ? "rule" : "rules"} for other verbs`, tone: "skip", depth: 1 });
    otherVerbs = 0;
  };
  for (const e of events) {
    switch (e.type) {
      case "trigger": {
        flushOthers();
        pending = { owner: e.owner, trigger: e.trigger, index: out.length, sameType: 0 };
        out.push({ text: triggerLine(ran, e.owner, e.trigger), tone: "trigger", depth: 0 });
        break;
      }
      case "rule": {
        const n = `Rule ${e.index + 1}`;
        const v = e.verdict;
        if (v.kind === "wrong_trigger" && e.rule.when.type !== e.trigger.type) {
          otherVerbs++;
          break;
        }
        if (pending) pending.sameType++;
        flushOthers();
        if (v.kind === "matched") {
          out.push({ text: `${n} matched`, tone: "match", depth: 1, jump: ruleJump(now, e.owner, e.rule.id) });
        } else if (v.kind === "wrong_trigger") {
          out.push({ text: `${n} skipped: it's for ${triggerText(ran, e.rule.when)}`, tone: "skip", depth: 1, jump: ruleJump(now, e.owner, e.rule.id) });
        } else if (v.kind === "once_fired") {
          out.push({ text: `${n} skipped: it runs once and already ran`, tone: "skip", depth: 1, jump: ruleJump(now, e.owner, e.rule.id) });
        } else {
          const why =
            v.condition.type === "first_time"
              ? "it's for the first time only, and it already ran"
              : `condition ${v.index + 1} failed: ${conditionText(ran, v.condition)}`;
          out.push({ text: `${n} skipped: ${why}`, tone: "skip", depth: 1, jump: ruleJump(now, e.owner, e.rule.id, v.index) });
        }
        break;
      }
      case "no_match": {
        flushOthers();
        const quiet = !e.response && pending?.sameType === 0 && (e.trigger.type === "scene_enter" || e.trigger.type === "scene_exit");
        if (quiet && pending) {
          // Entering or leaving a scene with no rules for it: nothing to explain.
          out.splice(pending.index);
        } else {
          out.push({ text: e.response ? `No rule matched → default response` : "No rule matched", tone: "default", depth: 1 });
        }
        pending = null;
        break;
      }
      case "action":
        flushOthers();
        out.push({ text: actionText(ran, e.action), tone: "action", depth: 1 });
        break;
      case "scene":
        flushOthers();
        out.push({
          text: e.from
            ? `${sceneName(ran, e.from)} → ${sceneName(ran, e.to)}${e.spawn ? ` (at ${e.spawn})` : ""}`
            : `Start in ${sceneName(ran, e.to)}${e.spawn ? ` (at ${e.spawn})` : ""}`,
          tone: "scene",
          depth: 0,
        });
        break;
      case "note":
        flushOthers();
        out.push({ text: e.message, tone: "note", depth: 1 });
        break;
      case "dialogue_start":
        flushOthers();
        out.push({
          text: `Dialogue ${quote(dialogueName(ran, e.dialogue))} starts${e.node ? ` at ${e.node}` : ""}`,
          tone: "trigger",
          depth: 0,
          jump: e.node ? nodeJump(now, e.dialogue, e.node) : undefined,
        });
        break;
      case "dialogue_node": {
        flushOthers();
        const line = nodeLine(ran, now, e.dialogue, e.node);
        if (line) out.push(line);
        break;
      }
      case "dialogue_options": {
        flushOthers();
        const shown = e.options.filter((o) => o.verdict.kind === "shown").length;
        out.push({ text: `Choices: ${shown} of ${e.options.length} options shown`, tone: "match", depth: 1, jump: nodeJump(now, e.dialogue, e.node) });
        for (const o of e.options) {
          const v = o.verdict;
          if (v.kind === "shown") continue;
          const { index, text } = optionOf(ran, e.dialogue, e.node, o.id);
          const sub: DataPath = index < 0 ? [] : v.kind === "condition_failed" ? ["options", index, "if", v.index] : ["options", index];
          const why =
            v.kind === "once_chosen"
              ? "it's once-only and was already chosen"
              : v.condition.type === "first_time"
                ? "it's for the first time only, and it was already chosen"
                : `condition ${v.index + 1} failed: ${conditionText(ran, v.condition)}`;
          out.push({ text: `Option ${quote(text)} hidden: ${why}`, tone: "skip", depth: 1, jump: nodeJump(now, e.dialogue, e.node, sub) });
        }
        break;
      }
      case "dialogue_choice": {
        flushOthers();
        const { index, text } = optionOf(ran, e.dialogue, e.node, e.option);
        out.push({
          text: `Player chose ${quote(text)}`,
          tone: "trigger",
          depth: 0,
          jump: nodeJump(now, e.dialogue, e.node, index < 0 ? [] : ["options", index]),
        });
        break;
      }
      case "dialogue_branch": {
        flushOthers();
        const why = e.failed ? `: condition ${e.failed.index + 1} failed: ${conditionText(ran, e.failed.condition)}` : "";
        out.push({
          text: `Branch → ${e.result ? "true" : "false"}${why}`,
          tone: e.result ? "match" : "skip",
          depth: 1,
          jump: nodeJump(now, e.dialogue, e.node, e.failed ? ["if", e.failed.index] : []),
        });
        break;
      }
      case "dialogue_end":
        flushOthers();
        out.push({
          text: `Dialogue ${quote(dialogueName(ran, e.dialogue))} ${END_TEXT[e.reason]}`,
          tone: e.reason === "loop" || e.reason === "cut" ? "note" : "scene",
          depth: 0,
        });
        break;
    }
  }
  flushOthers();
  return out.slice(-LOG_LIMIT);
}
