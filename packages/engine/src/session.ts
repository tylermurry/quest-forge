import type { Action, AnyRule, CharacterFile, Facing, GameFile, ItemFile, Project, SceneFile, Trigger } from "@questforge/schema";
import { defaultResponse, firstMatch, type RuleContext, type RuleOwner } from "./rules.ts";
import { Sequence, type Done, type SequenceHost } from "./sequence.ts";
import {
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
}

const MAX_LOG = 100;

export class Session implements SequenceHost {
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
  private sequence: Sequence | null = null;
  private readonly scenes: Map<string, SceneFile>;
  private readonly characters: Map<string, CharacterFile>;
  private readonly items: Map<string, ItemFile>;
  private readonly ctx: RuleContext;

  constructor(
    private readonly project: Project,
    private readonly images: ImageLookup,
    private readonly start: SessionStart = {},
  ) {
    this.game = project.game!.data;
    this.scenes = new Map(project.scenes.map((s) => [s.data.id, s.data]));
    this.characters = new Map(project.characters.map((c) => [c.data.id, c.data]));
    this.items = new Map(project.items.map((i) => [i.data.id, i.data]));
    this.ctx = { state: undefined as unknown as GameState, scene: (id) => this.scenes.get(id) };
    this.restart();
  }

  /** Input is locked (D72): a sequence is running or the game has ended. */
  get busy(): boolean {
    return this.sequence !== null || this.ending !== null;
  }

  get scene(): SceneFile {
    return this.world.scene;
  }

  itemFile(id: string): ItemFile | undefined {
    return this.items.get(id);
  }

  /** Back to the start (also the D71 Restart button). */
  restart() {
    this.sequence?.stop();
    this.sequence = null;
    const sceneId = this.start.scene ?? this.game.startScene;
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} doesn't exist`);
    const spawnId = this.start.spawn ?? (this.start.scene ? Object.keys(scene.spawns)[0]! : this.game.startSpawn);
    const spawn = scene.spawns[spawnId];
    if (!spawn) throw new Error(`Scene ${sceneId} has no spawn point ${spawnId}`);
    this.state = initialState(this.project.flags?.data ?? null, sceneId, spawn);
    this.ctx.state = this.state;
    this.verb = "walk";
    this.item = null;
    this.text = null;
    this.ending = null;
    this.enterScene(scene);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  /** Left-click or tap at a scene point with the current verb. */
  primaryClick(p: Vec) {
    if (this.ending) return;
    if (this.text) {
      this.closeText();
      return;
    }
    if (this.sequence) return;
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

  /** Skip the current text box. */
  skipText() {
    if (this.text) this.closeText();
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  tick(dt: number) {
    this.world.tick(dt);
    if (this.text) {
      this.text.timeLeft -= dt;
      if (this.text.timeLeft <= 0) this.closeText();
    }
    if (this.sequence) {
      this.sequence.tick(dt);
      if (this.sequence?.done) this.sequence = null;
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

  private enterScene(scene: SceneFile) {
    const s = this.state;
    s.scene = scene.id;
    this.world = new World(scene, this.characters, this.images, {
      player: this.game.player,
      spawn: s.player,
      objectVisible: (id) => s.objects[`${scene.id}/${id}`] ?? scene.objects.find((o) => o.id === id)!.visible,
      characterPosition: (id) => s.characters[`${scene.id}/${id}`],
    });
    markVisited(s, scene.id);
    this.fire({ kind: "scene", scene: scene.id }, scene.rules, { type: "scene_enter" });
  }

  /** Walk to the target (D74), face it, then fire the verb. A new click cancels the walk. */
  private approachThen(target: Target, p: Vec, trigger: Trigger) {
    const a = this.world.approach(target, p);
    this.world.walkTo(a.dest, () => {
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
  private fire(owner: RuleOwner, rules: readonly AnyRule[], trigger: Trigger) {
    const m = firstMatch(rules, owner, trigger, this.ctx);
    if (m) {
      markFired(this.state, m.key);
      this.run(m.rule.do);
      return;
    }
    const fallback = defaultResponse(this.game, trigger);
    if (fallback) this.run([{ type: "narrate", text: fallback }]);
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
    // Carry on at once, so a sequence that ends here unlocks input this tick.
    const seq = this.sequence;
    if (seq) {
      seq.tick(0);
      if (seq.done && this.sequence === seq) this.sequence = null;
    }
  }

  private note(message: string) {
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

  face(facing: Facing) {
    this.world.face(facing);
  }

  changeScene(scene: string, spawn: string) {
    this.note(`Can't change to scene ${scene} (${spawn}) yet.`);
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
      this.note(`Object animations aren't supported yet (${target.object}: ${animation}).`);
      return null;
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
    this.note(`Sound: ${sound}`);
  }

  playMusic(music: string | null) {
    this.note(music ? `Music: ${music}` : "Music stopped");
  }

  endGame(ending: Ending) {
    this.world.stop();
    this.text = null;
    this.ending = ending;
  }

  warn(message: string) {
    this.note(message);
  }
}
