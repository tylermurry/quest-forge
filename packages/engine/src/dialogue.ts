import type { Action, Condition, DialogueFile, DialogueNode } from "@questforge/schema";
import { checkCondition, type RuleContext } from "./rules.ts";
import { Sequence, type Done, type SequenceHost } from "./sequence.ts";
import { markFired, type GameState } from "./state.ts";
import type { Trace } from "./trace.ts";

// A dialogue being played: walks the graph from Start (or a
// given node). Lines show as text boxes, Choices as a list box, Actions run through
// the sequence runner, Branch checks conditions through rules.ts, End fires
// `dialogue_end`. Pure logic: the session draws, and the player picks through it.

type LineNode = Extract<DialogueNode, { type: "line" }>;
type ChoicesNode = Extract<DialogueNode, { type: "choices" }>;

/**
 * Key of a dialogue option in `GameState.dialogueChoices`: dialogue, node and
 * option IDs, which are stable however the graph is moved or reordered.
 */
export const choiceKey = (dialogue: string, node: string, option: string) => `${dialogue}/${node}/${option}`;

/**
 * Key in `GameState.fired` for `first_time` inside a dialogue: an option is
 * fired once chosen, a Branch once passed.
 */
export const dialogueFiredKey = (dialogue: string, node: string, option?: string) => `dialogue:${dialogue}/${node}${option === undefined ? "" : `/${option}`}`;

/** Why an option is in the list box or not. */
export type OptionVerdict = { kind: "shown" } | { kind: "once_chosen" } | { kind: "condition_failed"; index: number; condition: Condition };

/** How a dialogue stopped. Only `end` and `dead_end` fire `dialogue_end`. */
export type DialogueEndReason =
  /** An End node. */
  | "end"
  /** A port with nothing connected, or a Choices node with every option hidden or none. */
  | "dead_end"
  /** A node came round again with no Line or Choices in between. */
  | "loop"
  /** A scene change, death, win or restart cut it short. */
  | "cut";

/** The options on screen: what the player can say, in file order. */
export interface ChoiceList {
  dialogue: string;
  node: string;
  options: { id: string; text: string }[];
  /**
   * The line said right before the list: the speaker's character id (null for narration) and the text. The styled
   * list box shows it above the separator. Null when the list is the first thing, or an Actions node came between.
   * It lives and dies with the list, so it is never saved.
   */
  prompt: { character: string | null; text: string } | null;
}

/** How a dialogue reaches the session. Actions run on the session as a SequenceHost. */
export interface DialogueHost extends SequenceHost {
  readonly ctx: RuleContext;
  /** Shows a line in a text box (and plays its animation); done when it closes. */
  showLine(node: LineNode): Done;
  /** The actions of the first matching `dialogue_end` game rule, marked fired; null if none matched. */
  endRule(dialogue: string): readonly Action[] | null;
  note(message: string): void;
  readonly trace: Trace | undefined;
}

export class DialogueRun {
  /** The node being shown or run; null once finished. */
  node: string | null = null;
  choices: ChoiceList | null = null;
  finished = false;
  private block: Done | null = null;
  private sub: Sequence | null = null;
  /** Running the `dialogue_end` rule's actions. */
  private ending = false;
  /** The last Line shown, until an Actions node or a choice; a Branch changes nothing visible, so it carries over. */
  private lastLine: ChoiceList["prompt"] = null;
  /** Nodes passed since the last Line or Choices. */
  private sinceInput = new Set<string>();
  private readonly byId: Map<string, DialogueNode>;

  constructor(
    private readonly host: DialogueHost,
    readonly dialogue: DialogueFile,
  ) {
    this.byId = new Map(dialogue.nodes.map((n) => [n.id, n]));
  }

  get id() {
    return this.dialogue.id;
  }

  private get state(): GameState {
    return this.host.state;
  }

  /** Begins at the Start node, or at `node` (playtest "Play from this node"). */
  begin(node?: string) {
    const start = node ?? this.dialogue.nodes.find((n) => n.type === "start")?.id ?? null;
    this.host.trace?.({ type: "dialogue_start", dialogue: this.id, node: node ?? null });
    if (start === null) return this.finish("dead_end");
    this.goto(start);
    this.advance();
  }

  /** Abandons the dialogue without `dialogue_end` (scene change, death, restart). */
  stop() {
    if (this.finished) return;
    this.sub?.stop();
    this.sub = null;
    this.block = null;
    this.choices = null;
    this.host.trace?.({ type: "dialogue_end", dialogue: this.id, reason: "cut" });
    this.done();
  }

  tick(dt: number) {
    if (this.finished) return;
    if (this.sub) {
      this.sub.tick(dt);
      if (!this.sub.done) return;
      this.sub = null;
      if (this.ending) return this.done();
      this.follow((this.current as { next: string | null }).next);
    }
    if (this.block) {
      if (!this.block()) return;
      this.block = null;
      this.follow((this.current as LineNode).next);
    }
    this.advance();
  }

  /** The player picked an option of the list box. */
  choose(optionId: string) {
    const list = this.choices;
    if (!list || this.finished) return;
    const node = this.current as ChoicesNode;
    const option = node.options.find((o) => o.id === optionId);
    if (!option || !list.options.some((o) => o.id === optionId)) return;
    this.choices = null;
    this.lastLine = null;
    if (option.once) {
      const key = choiceKey(this.id, node.id, option.id);
      if (!this.state.dialogueChoices.includes(key)) this.state.dialogueChoices.push(key);
    }
    markFired(this.state, dialogueFiredKey(this.id, node.id, option.id));
    this.host.trace?.({ type: "dialogue_choice", dialogue: this.id, node: node.id, option: option.id });
    this.follow(option.next);
    this.advance();
  }

  private get current(): DialogueNode {
    return this.byId.get(this.node!)!;
  }

  /** Runs nodes until one waits: a line, the list box or blocking actions. */
  private advance() {
    while (!this.finished && !this.block && !this.sub && !this.choices && this.node !== null) {
      const n = this.current;
      switch (n.type) {
        case "start":
          this.follow(n.next);
          break;
        case "line":
          this.sinceInput.clear();
          this.lastLine = { character: n.character ?? null, text: n.text };
          this.block = this.host.showLine(n);
          break;
        case "choices":
          this.sinceInput.clear();
          this.offer(n);
          break;
        case "actions": {
          this.lastLine = null;
          const seq = new Sequence(this.host, n.do);
          this.sub = seq;
          seq.tick(0);
          // A scene change, death or win inside stopped the dialogue.
          if (this.finished) return;
          if (seq.done) {
            this.sub = null;
            this.follow(n.next);
          }
          break;
        }
        case "branch": {
          const key = dialogueFiredKey(this.id, n.id);
          const failed = n.if.findIndex((c) => !checkCondition(c, this.host.ctx, key));
          markFired(this.state, key);
          const result = failed < 0;
          this.host.trace?.({ type: "dialogue_branch", dialogue: this.id, node: n.id, result, ...(failed >= 0 && { failed: { index: failed, condition: n.if[failed]! } }) });
          this.follow(result ? n.then : n.else);
          break;
        }
        case "end":
          this.finish("end");
          break;
      }
    }
  }

  /** Options whose conditions pass, minus `once` ones already chosen. */
  private offer(n: ChoicesNode) {
    const verdicts = n.options.map((o): { id: string; verdict: OptionVerdict } => {
      if (o.once && this.state.dialogueChoices.includes(choiceKey(this.id, n.id, o.id))) return { id: o.id, verdict: { kind: "once_chosen" } };
      const key = dialogueFiredKey(this.id, n.id, o.id);
      const failed = o.if.findIndex((c) => !checkCondition(c, this.host.ctx, key));
      return { id: o.id, verdict: failed < 0 ? { kind: "shown" } : { kind: "condition_failed", index: failed, condition: o.if[failed]! } };
    });
    this.host.trace?.({ type: "dialogue_options", dialogue: this.id, node: n.id, options: verdicts });
    const shown = n.options.filter((_, i) => verdicts[i]!.verdict.kind === "shown");
    if (shown.length === 0) {
      this.host.note(n.options.length ? `Every option of ${n.id} is hidden, so the dialogue ends.` : `${n.id} has no options, so the dialogue ends.`);
      return this.finish("dead_end");
    }
    this.choices = { dialogue: this.id, node: n.id, options: shown.map((o) => ({ id: o.id, text: o.text })), prompt: this.lastLine };
    this.lastLine = null;
  }

  /** Moves along a port. Nothing connected ends the dialogue. */
  private follow(next: string | null) {
    if (this.finished) return;
    if (next === null) return this.finish("dead_end");
    this.goto(next);
  }

  private goto(id: string) {
    const n = this.byId.get(id);
    if (!n) {
      this.host.note(`Node ${id} doesn't exist, so the dialogue ends.`);
      return this.finish("dead_end");
    }
    if (this.sinceInput.has(id)) {
      this.host.note(`The dialogue came back to ${id} without a Line or Choices in between, so it was stopped (it would never end).`);
      this.node = id;
      return this.finish("loop");
    }
    this.sinceInput.add(id);
    this.node = id;
    this.host.trace?.({ type: "dialogue_node", dialogue: this.id, node: n });
  }

  /** End of the dialogue: an End node or a loose port runs the `dialogue_end` rule first. */
  private finish(reason: Exclude<DialogueEndReason, "cut">) {
    this.choices = null;
    this.host.trace?.({ type: "dialogue_end", dialogue: this.id, reason });
    if (reason === "loop") return this.done();
    const actions = this.host.endRule(this.id);
    if (!actions?.length) return this.done();
    this.ending = true;
    const seq = new Sequence(this.host, actions);
    this.sub = seq;
    seq.tick(0);
    if (seq.done && this.sub === seq && !this.finished) this.done();
  }

  private done() {
    this.finished = true;
    this.node = null;
    this.sub = null;
    this.block = null;
    this.choices = null;
  }
}
