import { pointInPolygon, type Action, type AnyRule, type CharacterFile, type DialogueFile, type DialogueNode, type Facing, type GameFile, type ItemFile, type Project, type SceneFile, type Trigger } from "@questforge/schema";
import { DialogueRun, type ChoiceList, type DialogueHost } from "./dialogue.ts";
import { defaultResponse, firstMatch, type RuleContext, type RuleOwner } from "./rules.ts";
import { sanitizeState } from "./restore.ts";
import { Sequence, type Done } from "./sequence.ts";
import type { Trace } from "./trace.ts";
import {
  cloneState,
  initialState,
  markFired,
  markVisited,
  setCharacterPosition,
  setObjectVisible,
  type GameState,
  type Position,
} from "./state.ts";
import { narrateBox, sayBox, type TextBox } from "./ui/textbox.ts";
import type { Vec } from "./vec.ts";
import { World, type ImageLookup, type Target } from "./world.ts";

// A game being played (spec 02, 06): game state, the current scene's world, verbs,
// rule evaluation, the running sequence and the text box. Pure logic, no DOM.

/** Player verbs (spec 06). `item` uses the current inventory item. */
export type Verb = "walk" | "look" | "hand" | "talk" | "item";
/** Right-click order (D32): Walk → Look → Hand → Talk → current item (if any). */
export const VERB_CYCLE: readonly Verb[] = ["walk", "look", "hand", "talk", "item"];

export type Ending = { kind: "die"; message: string } | { kind: "win" };

export interface SessionStart {
  scene?: string;
  spawn?: string;
  /**
   * Start from this state instead (playtest presets and Restart scene, D126, D128):
   * its scene, at its player position. Copied, never changed. Wins over `scene`/`spawn`.
   */
  state?: GameState;
  /** Play this dialogue once the scene is entered (playtest "Play from this node", D142), at `node` or its Start. */
  dialogue?: { id: string; node?: string };
}

/** Playtest-only hooks (D129). The exported game passes none. */
export interface SessionHooks {
  /** Hears rule verdicts, default responses, actions, scene changes and notes. */
  trace?: Trace;
  /** Replaces what the in-game Restart button does (playtest restarts the run's original start, D132). */
  restart?: () => void;
}

/** Scene asset loading, owned by the host (spec 03). Headless sessions use `ALWAYS_READY`. */
export interface SceneAssets {
  /** Every image the scene needs is loaded. */
  ready(scene: SceneFile): boolean;
  /** Start loading a scene's images in the background (no-op if loaded or loading). */
  prefetch(scene: SceneFile): void;
}
export const ALWAYS_READY: SceneAssets = { ready: () => true, prefetch: () => {} };

/** Most sounds waiting for the host at once; older ones are dropped (a headless session never drains them). */
const MAX_SOUNDS = 8;

/** A scene change in progress (D72): the old scene's exit rule, then loading. */
interface SceneChange {
  scene: SceneFile;
  spawn: string;
  phase: "exit" | "load";
}

/** Every scene a scene's rules can `change_scene` to (D75 prefetch). */
export function linkedScenes(scene: SceneFile): string[] {
  const lists = [
    scene.rules,
    ...scene.hotspots.map((h) => h.rules),
    ...scene.objects.map((o) => o.rules),
    ...scene.characters.map((c) => c.rules),
    ...scene.regions.map((r) => r.rules),
  ];
  const out = new Set<string>();
  for (const rules of lists) for (const r of rules) for (const a of r.do) if (a.type === "change_scene" && a.scene !== scene.id) out.add(a.scene);
  return [...out];
}

const MAX_LOG = 100;

export class Session implements DialogueHost {
  state!: GameState;
  world!: World;
  verb: Verb = "walk";
  /** The current inventory item (UI state, D75). */
  item: string | null = null;
  text: TextBox | null = null;
  ending: Ending | null = null;
  /** Warnings and audio events, newest last (for the dev page and later the event log). */
  readonly log: string[] = [];
  readonly game: GameFile;
  /** `play_sound` IDs not yet played, oldest first. The host drains them (spec 07). */
  readonly sounds: string[] = [];
  private sequence: Sequence | null = null;
  /** The dialogue being played (spec 11). */
  private _dialogue: DialogueRun | null = null;
  /** A dialogue waiting for the scene's enter rule to finish (D142). */
  private pendingDialogue: { id: string; node?: string } | null = null;
  private change: SceneChange | null = null;
  /** Regions the player's feet are in, so `enter_region` fires on crossing in (D72). */
  private inside = new Set<string>();
  private readonly scenes: Map<string, SceneFile>;
  private readonly characters: Map<string, CharacterFile>;
  private readonly items: Map<string, ItemFile>;
  private readonly dialogues: Map<string, DialogueFile>;
  readonly ctx: RuleContext;
  readonly trace: Trace | undefined;
  private readonly onRestart: (() => void) | undefined;
  /** The auto-snapshot of the current scene's entry (D43, D128). `enter`: Try again re-runs its `scene_enter` rule. */
  private _entry!: { state: GameState; spawn: string | null; enter: boolean };

  constructor(
    private readonly project: Project,
    private readonly images: ImageLookup,
    private readonly start: SessionStart = {},
    private readonly assets: SceneAssets = ALWAYS_READY,
    hooks: SessionHooks = {},
  ) {
    this.trace = hooks.trace;
    this.onRestart = hooks.restart;
    this.game = project.game!.data;
    this.scenes = new Map(project.scenes.map((s) => [s.data.id, s.data]));
    this.characters = new Map(project.characters.map((c) => [c.data.id, c.data]));
    this.items = new Map(project.items.map((i) => [i.data.id, i.data]));
    this.dialogues = new Map(project.dialogues.map((d) => [d.data.id, d.data]));
    // `state` is a placeholder: restart() on the next line sets it before anything reads it.
    this.ctx = { state: undefined as unknown as GameState, scene: (id) => this.scenes.get(id) };
    this.restart();
  }

  /** Input is locked (D72): a sequence or scene change is running, or the game has ended. */
  get busy(): boolean {
    return this.sequence !== null || this._dialogue !== null || this.pendingDialogue !== null || this.change !== null || this.ending !== null;
  }

  /** The scene being loaded, while its images aren't ready yet. */
  get loading(): SceneFile | null {
    return this.change?.phase === "load" && !this.assets.ready(this.change.scene) ? this.change.scene : null;
  }

  get scene(): SceneFile {
    return this.world.scene;
  }

  /** The list box while a Choices node waits for the player (spec 06). */
  get choices(): ChoiceList | null {
    return this._dialogue?.choices ?? null;
  }

  /** The dialogue playing and its current node, for the playtest state panel. */
  get dialogue(): { id: string; node: string | null } | null {
    const d = this._dialogue;
    return d ? { id: d.id, node: d.node } : null;
  }

  dialogueFile(id: string): DialogueFile | undefined {
    return this.dialogues.get(id);
  }

  sceneFile(id: string): SceneFile | undefined {
    return this.scenes.get(id);
  }

  itemFile(id: string): ItemFile | undefined {
    return this.items.get(id);
  }

  /**
   * The state as the current scene was entered (before its `scene_enter` rule) and
   * the spawn used, null when play began from a given state (D128). A copy.
   */
  get entry(): { state: GameState; spawn: string | null } {
    return { state: cloneState(this._entry.state), spawn: this._entry.spawn };
  }

  /** The in-game Restart button (D71): the host's restart if it has one, else `restart()`. */
  requestRestart() {
    if (this.onRestart) this.onRestart();
    else this.restart();
  }

  /** Stops whatever runs and clears UI state, before a restart or a load. */
  private reset() {
    this.sequence?.stop();
    this.sequence = null;
    this._dialogue?.stop();
    this._dialogue = null;
    this.pendingDialogue = null;
    this.change = null;
    this.verb = "walk";
    this.item = null;
    this.text = null;
    this.ending = null;
  }

  /** Back to the start. */
  restart() {
    this.reset();
    this.pendingDialogue = this.start.dialogue ?? null;
    if (this.start.state) {
      const state = cloneState(this.start.state);
      const scene = this.scenes.get(state.scene);
      if (!scene) throw new Error(`Scene ${state.scene} doesn't exist`);
      this.state = state;
      this.ctx.state = state;
      this.enterScene(scene, null, null);
      return;
    }
    const sceneId = this.start.scene ?? this.game.startScene;
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} doesn't exist`);
    const spawnId = this.start.spawn ?? (this.start.scene ? Object.keys(scene.spawns)[0]! : this.game.startSpawn);
    const spawn = scene.spawns[spawnId];
    if (!spawn) throw new Error(`Scene ${sceneId} has no spawn point ${spawnId}`);
    this.state = initialState(this.project.flags?.data ?? null, sceneId, spawn);
    this.ctx.state = this.state;
    this.enterScene(scene, spawnId, null);
  }

  /**
   * Loads a saved state (spec 07, D43, D147): IDs the project no longer has are
   * dropped (listed in the result, and the player is told), then play goes on exactly
   * where it was saved. The scene's `scene_enter` rule does not run again.
   */
  load(saved: GameState): { dropped: string[] } {
    const { state, dropped } = sanitizeState(this.project, saved);
    const scene = this.scenes.get(state.scene);
    if (!scene) throw new Error(`Scene ${state.scene} doesn't exist`);
    this.reset();
    this.state = state;
    this.ctx.state = state;
    this.enterScene(scene, null, null, false);
    if (dropped.length) {
      this.note(`Loaded a save without ${dropped.join(", ")}, which no longer ${dropped.length === 1 ? "exists" : "exist"}.`);
      this.run([{ type: "narrate", text: "This saved game is from an older version of the game. A few things in it no longer exist and were left out." }]);
    }
    return { dropped };
  }

  /** "Try again" after a death (spec 07): back to the current scene's entry snapshot. */
  tryAgain() {
    const entry = this._entry;
    const scene = this.scenes.get(entry.state.scene)!;
    this.reset();
    this.state = cloneState(entry.state);
    this.ctx.state = this.state;
    this.enterScene(scene, entry.spawn, null, entry.enter);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  /** Left-click or tap at a scene point with the current verb. */
  primaryClick(p: Vec) {
    if (this.ending) return;
    if (this.text) {
      this.closeText();
      return;
    }
    if (this.busy) return;
    const target = this.world.hitTest(p);
    switch (this.verb) {
      case "walk": {
        if (target && this.rulesOf(target).some((r) => r.when.type === "walk")) this.approachThen(target, p, { type: "walk" });
        else this.world.walkTo(p);
        return;
      }
      case "look":
        if (!target) return;
        // Look runs where the player stands (D74).
        this.world.stop();
        this.world.faceToward(p);
        this.fireAt(target, { type: "look" });
        return;
      case "hand":
      case "talk":
        if (target) this.approachThen(target, p, { type: this.verb });
        return;
      case "item":
        if (target && this.item) this.approachThen(target, p, { type: "use_item", item: this.item });
        return;
    }
  }

  /** Right-click (D32): cycle verbs. */
  secondaryClick() {
    if (this.busy || this.text) return;
    const cycle = VERB_CYCLE.filter((v) => v !== "item" || this.item);
    this.verb = cycle[(cycle.indexOf(this.verb) + 1) % cycle.length]!;
  }

  selectVerb(v: Verb) {
    if (v === "item" && !this.item) return;
    this.verb = v;
  }

  /** Make an inventory item the current item (D80). */
  selectItem(id: string) {
    if (!this.state.inventory.includes(id)) return;
    this.item = id;
    this.verb = "item";
  }

  /** Look at an inventory item: its description (D80). */
  lookAtItem(id: string) {
    if (this.busy) return;
    const item = this.items.get(id);
    if (item) this.run([{ type: "narrate", text: item.description }]);
  }

  /** Use item `held` on inventory item `target`: the game-level combine rules (D80). */
  combineItems(held: string, target: string) {
    if (this.busy || held === target) return;
    this.fire({ kind: "game" }, this.game.rules, { type: "combine", item: held, with: target });
  }

  /** Pick an option of the dialogue list box (spec 06). */
  choose(optionId: string) {
    if (this.text || !this._dialogue) return;
    this._dialogue.choose(optionId);
    this.continueNow();
  }

  /** Skip the current text box. */
  skipText() {
    if (this.text) this.closeText();
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  tick(dt: number) {
    this.world.tick(dt);
    this.checkRegions();
    if (this.text) {
      this.text.timeLeft -= dt;
      if (this.text.timeLeft <= 0) this.closeText();
    }
    if (this._dialogue) {
      this._dialogue.tick(dt);
      this.settleDialogue();
    }
    if (this.sequence) {
      this.sequence.tick(dt);
      if (this.sequence?.done) this.sequence = null;
    }
    this.advanceChange();
    // Play from this node (D142): once the scene's enter rule is done.
    const pending = this.pendingDialogue;
    if (pending && !this.sequence && !this.change && !this.ending && !this._dialogue) {
      this.pendingDialogue = null;
      this.startDialogue(pending.id, pending.node);
    }
    const { player } = this.world;
    this.state.player = { x: player.pos[0], y: player.pos[1], facing: player.facing };
    // A taken item can't stay selected.
    if (this.item && !this.state.inventory.includes(this.item)) {
      this.item = null;
      if (this.verb === "item") this.verb = "walk";
    }
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  /** `enter` false (a load): the scene's music and `scene_enter` rule don't run, so the saved state stays exact. */
  private enterScene(scene: SceneFile, spawn: string | null, from: string | null, enter = true) {
    const s = this.state;
    s.scene = scene.id;
    this._entry = { state: cloneState(s), spawn, enter };
    this.trace?.({ type: "scene", from, to: scene.id, spawn });
    this.world = new World(scene, this.characters, this.images, {
      player: this.game.player,
      spawn: s.player,
      objectVisible: (id) => s.objects[`${scene.id}/${id}`] ?? scene.objects.find((o) => o.id === id)!.visible,
      characterPosition: (id) => s.characters[`${scene.id}/${id}`],
    });
    // Characters moved here by set_character_position from elsewhere.
    for (const [key, p] of Object.entries(s.characters)) {
      const [sceneId, id] = key.split("/") as [string, string];
      if (sceneId === scene.id && !this.world.actorById(id)) this.world.placeCharacter(id, p);
    }
    this.inside = this.regionsAt();
    markVisited(s, scene.id);
    for (const id of linkedScenes(scene)) {
      const next = this.scenes.get(id);
      if (next) this.assets.prefetch(next);
    }
    if (!enter) return;
    // Scene music (spec 07, D148): the same track carries on; no music field leaves it as it is.
    if (scene.music !== undefined && s.music !== scene.music) {
      s.music = scene.music;
      this.note(`Music: ${scene.music} (the scene's music)`);
    }
    this.fire({ kind: "scene", scene: scene.id }, scene.rules, { type: "scene_enter" });
  }

  /** Step a scene change along: after the exit rule, wait for assets, then enter (D72). */
  private advanceChange() {
    const c = this.change;
    if (!c) return;
    if (c.phase === "exit") {
      if (this.sequence) return;
      c.phase = "load";
      this.assets.prefetch(c.scene);
    }
    if (!this.assets.ready(c.scene)) return;
    this.change = null;
    const spawn = c.scene.spawns[c.spawn]!;
    this.state.player = { x: spawn.x, y: spawn.y, facing: spawn.facing };
    this.text = null;
    this.enterScene(c.scene, c.spawn, this.scene.id);
  }

  private regionsAt(): Set<string> {
    const p = this.world.player.pos;
    return new Set(this.scene.regions.filter((r) => pointInPolygon(p, r.shape)).map((r) => r.id));
  }

  /** `enter_region` fires when a player-started walk crosses into a region (D72, D81). */
  private checkRegions() {
    if (this.scene.regions.length === 0) return;
    const now = this.regionsAt();
    const entered = this.scene.regions.filter((r) => now.has(r.id) && !this.inside.has(r.id));
    this.inside = now;
    if (this.busy) return;
    for (const r of entered) {
      if (this.fire({ kind: "region", scene: this.scene.id, id: r.id }, r.rules, { type: "enter_region" })) {
        this.world.stop();
        return;
      }
    }
  }

  /** Walk to the target (D74), face it, then fire the verb. A new click cancels the walk. */
  private approachThen(target: Target, p: Vec, trigger: Trigger) {
    const a = this.world.approach(target, p);
    this.world.walkTo(a.dest, () => {
      if (this.busy) return;
      if (a.facing) this.world.face(a.facing);
      else this.world.faceToward(a.toward);
      this.fireAt(target, trigger);
    });
  }

  private fireAt(target: Target, trigger: Trigger) {
    const scene = this.scene.id;
    this.fire({ kind: target.kind, scene, id: target.id }, this.rulesOf(target), trigger);
  }

  /** First match runs (D40); otherwise the verb's default response, if it has one. */
  /** Returns whether a rule matched. */
  private fire(owner: RuleOwner, rules: readonly AnyRule[], trigger: Trigger): boolean {
    const m = this.match(owner, rules, trigger);
    if (m.actions) this.run(m.actions);
    return m.matched;
  }

  /** The first match's actions (marked fired), else the default response; traced (D129). */
  private match(owner: RuleOwner, rules: readonly AnyRule[], trigger: Trigger): { matched: boolean; actions: readonly Action[] | null } {
    const trace = this.trace;
    trace?.({ type: "trigger", owner, trigger });
    const m = firstMatch(rules, owner, trigger, this.ctx, trace && ((rule, index, key, verdict) => trace({ type: "rule", owner, trigger, rule, index, key, verdict })));
    if (m) {
      markFired(this.state, m.key);
      return { matched: true, actions: m.rule.do };
    }
    const fallback = defaultResponse(this.game, trigger);
    trace?.({ type: "no_match", owner, trigger, response: fallback });
    return { matched: false, actions: fallback ? [{ type: "narrate", text: fallback }] : null };
  }

  /** Drops a dialogue that has ended, so input unlocks this tick. */
  private settleDialogue() {
    if (this._dialogue?.finished) this._dialogue = null;
  }

  private run(actions: readonly Action[]) {
    if (actions.length === 0) return;
    const seq = new Sequence(this, actions);
    this.sequence = seq;
    seq.tick(0);
    if (seq.done && this.sequence === seq) this.sequence = null;
  }

  private rulesOf(t: Target): readonly AnyRule[] {
    const scene = this.scene;
    switch (t.kind) {
      case "hotspot":
        return scene.hotspots.find((h) => h.id === t.id)?.rules ?? [];
      case "object":
        return scene.objects.find((o) => o.id === t.id)?.rules ?? [];
      case "character":
        return scene.characters.find((c) => c.character === t.id)?.rules ?? [];
    }
  }

  private closeText() {
    const t = this.text;
    this.text = null;
    if (t?.speaker) this.world.setTalking(t.speaker.id, false);
    this.continueNow();
  }

  /** Carry on at once, so a dialogue or sequence that ends here unlocks input this tick. */
  private continueNow() {
    if (this._dialogue) {
      this._dialogue.tick(0);
      this.settleDialogue();
    }
    const seq = this.sequence;
    if (seq) {
      seq.tick(0);
      if (seq.done && this.sequence === seq) this.sequence = null;
    }
  }

  note(message: string) {
    this.trace?.({ type: "note", message });
    this.log.push(message);
    if (this.log.length > MAX_LOG) this.log.shift();
  }

  // ── SequenceHost ──────────────────────────────────────────────────────────

  narrate(text: string): Done {
    const box = narrateBox(text);
    this.text = box;
    return () => this.text !== box;
  }

  say(character: string, text: string): Done {
    const c = this.characters.get(character);
    const sprite = this.world.drawList().find((d) => d.kind === "character" && d.id === character);
    const box = sayBox(text, { id: character, name: c?.name ?? character, color: c?.textColor ?? "#ffffff", anchor: sprite?.dest ?? null });
    this.text = box;
    this.world.setTalking(character, true);
    return () => this.text !== box;
  }

  walkPlayerTo(x: number, y: number): Done {
    this.world.walkTo([x, y]);
    return () => !this.world.walking;
  }

  walkCharacterTo(character: string, x: number, y: number): Done | null {
    if (character === this.world.player.id) return this.walkPlayerTo(x, y);
    const scene = this.scene.id;
    const arrived = () => {
      const a = this.world.actorById(character);
      if (a) setCharacterPosition(this.state, scene, character, { x: a.pos[0], y: a.pos[1], facing: a.facing });
    };
    if (!this.world.walkNpcTo(character, [x, y], arrived)) {
      this.note(`Character ${character} isn't in ${scene}, so it can't walk.`);
      return null;
    }
    return () => !this.world.isNpcWalking(character);
  }

  face(facing: Facing) {
    this.world.face(facing);
  }

  /** D72: the old scene's exit rule, then load, place at the spawn, mark visited, enter rule. */
  changeScene(scene: string, spawn: string) {
    if (this.change) {
      this.note(`Ignored a scene change to ${scene} while leaving ${this.scene.id}.`);
      return;
    }
    const next = this.scenes.get(scene);
    if (!next || !next.spawns[spawn]) {
      this.note(`Scene ${scene} has no spawn point ${spawn}.`);
      return;
    }
    this.world.stop();
    // A scene change inside a dialogue ends it and the rule that started it (D72, D141).
    if (this._dialogue) {
      this._dialogue.stop();
      this._dialogue = null;
      this.sequence?.stop();
      this.sequence = null;
    }
    this.change = { scene: next, spawn, phase: "exit" };
    this.assets.prefetch(next);
    this.fire({ kind: "scene", scene: this.scene.id }, this.scene.rules, { type: "scene_exit" });
    this.advanceChange();
  }

  setObjectVisible(scene: string, object: string, visible: boolean) {
    setObjectVisible(this.state, scene, object, visible);
    if (scene === this.scene.id) this.world.setObjectVisible(object, visible);
  }

  setCharacterPosition(character: string, scene: string, p: Position) {
    setCharacterPosition(this.state, scene, character, p);
    if (scene === this.scene.id) this.world.placeCharacter(character, p);
  }

  playAnimation(target: Extract<Action, { type: "play_animation" }>["target"], animation: string): Done | null {
    if (target.kind === "object") {
      // Objects in other scenes or hidden ones don't animate (D112).
      const length = target.scene === this.scene.id ? this.world.playObjectAnimation(target.object, animation) : null;
      if (length === null) {
        const why = target.scene !== this.scene.id ? "isn't in this scene" : !this.world.isObjectVisible(target.object) ? "is hidden" : `has no animation ${animation}`;
        this.note(`Object ${target.object} ${why}, so it can't play ${animation}.`);
        return null;
      }
      const playing = this.world.objectOneShot(target.object);
      return () => this.world.objectOneShot(target.object) !== playing;
    }
    const actor = this.world.actorById(target.character);
    const length = actor ? this.world.playSlot(target.character, animation) : null;
    if (length === null) {
      this.note(`${target.character} has no animation ${animation} here.`);
      return null;
    }
    if (length === 0) return null;
    const playing = actor!.special;
    return () => actor!.special !== playing;
  }

  playSound(sound: string) {
    this.sounds.push(sound);
    if (this.sounds.length > MAX_SOUNDS) this.sounds.shift();
  }

  /** The track lives in `state.music` (set by the sequence); the host's audio follows it. */
  playMusic() {}

  endGame(ending: Ending) {
    this.world.stop();
    this._dialogue?.stop();
    this._dialogue = null;
    this.sequence?.stop();
    this.sequence = null;
    this.text = null;
    this.ending = ending;
  }

  warn(message: string) {
    this.note(message);
  }

  /** Starts a dialogue (spec 11). One plays at a time: another start is ignored with a note (D136). */
  startDialogue(id: string, node?: string): Done | null {
    const d = this.dialogues.get(id);
    if (!d) {
      this.note(`Dialogue ${id} doesn't exist.`);
      return null;
    }
    if (this._dialogue) {
      this.note(`Ignored starting dialogue ${id} while ${this._dialogue.id} is playing.`);
      return null;
    }
    const run = new DialogueRun(this, d);
    this._dialogue = run;
    for (const n of d.nodes) {
      if (n.type !== "actions") continue;
      for (const a of n.do) if (a.type === "change_scene") {
        const next = this.scenes.get(a.scene);
        if (next) this.assets.prefetch(next);
      }
    }
    run.begin(node);
    this.settleDialogue();
    return () => run.finished;
  }

  /** A Line node: the speaker's say box (or the narrator's), plus its animation (D139). */
  showLine(node: Extract<DialogueNode, { type: "line" }>): Done {
    if (node.character === undefined) return this.narrate(node.text);
    const done = this.say(node.character, node.text);
    const box = this.text;
    if (node.animation === undefined) return done;
    const character = node.character;
    const length = this.world.actorById(character) ? this.world.playSlot(character, node.animation) : null;
    if (length === null) this.note(`${character} has no animation ${node.animation} here.`);
    const special = this.world.actorById(character)?.special ?? null;
    return () => {
      if (this.text === box) return false;
      // A looping animation stops with the line; a one-shot finishes by itself.
      const actor = this.world.actorById(character);
      if (actor && special && actor.special === special) actor.special = null;
      return true;
    };
  }

  /** The `dialogue_end` game rules (spec 02) for a dialogue that reached its end (D136). */
  endRule(dialogue: string): readonly Action[] | null {
    return this.match({ kind: "game" }, this.game.rules, { type: "dialogue_end", dialogue }).actions;
  }

  onAction(action: Action) {
    this.trace?.({ type: "action", action });
  }
}
