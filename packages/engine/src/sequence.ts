import type { Action, Facing } from "@questforge/schema";
import { award, giveItem, takeItem, type GameState, type Position } from "./state.ts";

// Runs a rule's actions in order (spec 02, D71, D72). Text, movement, waits,
// one-shot animations and scene changes block until they finish; everything else
// happens at once. Pure logic: the world and UI are reached through `SequenceHost`.

/** Polled each tick until it returns true. */
export type Done = () => boolean;

type AnimationTarget = Extract<Action, { type: "play_animation" }>["target"];

/** How a sequence reaches the world. State-only actions change `state` directly. */
export interface SequenceHost {
  readonly state: GameState;
  narrate(text: string): Done;
  say(character: string, text: string): Done;
  /** Walk the player there (or the nearest reachable point). */
  walkPlayerTo(x: number, y: number): Done;
  face(facing: Facing): void;
  /** Leaves the scene; the sequence ends here (D72). */
  changeScene(scene: string, spawn: string): void;
  setObjectVisible(scene: string, object: string, visible: boolean): void;
  setCharacterPosition(character: string, scene: string, p: Position): void;
  /** Null when nothing plays or the animation loops (doesn't block). */
  playAnimation(target: AnimationTarget, animation: string): Done | null;
  playSound(sound: string): void;
  /** Null stops the music. */
  playMusic(music: string | null): void;
  /** `die` / `win_game` (D71). The sequence ends. */
  endGame(ending: { kind: "die"; message: string } | { kind: "win" }): void;
  /** Plays a dialogue (spec 11); done when it ends. Null when it can't start (D136). */
  startDialogue(dialogue: string): Done | null;
  /** Something the engine can't do yet (D71), with the milestone that owns it. */
  warn(message: string, milestone?: "M8"): void;
  /** An action is about to run (playtest event log, D129). */
  onAction?(action: Action): void;
}

export class Sequence {
  private next = 0;
  private block: Done | null = null;
  private waitLeft = 0;
  private stopped = false;

  constructor(
    private readonly host: SequenceHost,
    private readonly actions: readonly Action[],
  ) {}

  get done(): boolean {
    return this.stopped || (this.block === null && this.waitLeft <= 0 && this.next >= this.actions.length);
  }

  /** Abandon the rest (scene change, restart). */
  stop() {
    this.stopped = true;
  }

  /** Advance: finish the current block if it's done, then run actions until the next block. */
  tick(dt: number) {
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      if (this.waitLeft > 1e-9) return;
      this.waitLeft = 0;
    }
    if (this.block) {
      if (!this.block()) return;
      this.block = null;
    }
    while (!this.stopped && this.next < this.actions.length) {
      this.run(this.actions[this.next++]!);
      if (this.block || this.waitLeft > 0) return;
    }
  }

  private run(a: Action) {
    const { host } = this;
    const s = host.state;
    host.onAction?.(a);
    switch (a.type) {
      case "narrate":
        this.block = host.narrate(a.text);
        return;
      case "say":
        this.block = host.say(a.character, a.text);
        return;
      case "walk_player_to":
        this.block = host.walkPlayerTo(a.x, a.y);
        return;
      case "face":
        host.face(a.facing);
        return;
      case "change_scene":
        this.stopped = true;
        host.changeScene(a.scene, a.spawn);
        return;
      case "give_item":
        giveItem(s, a.item);
        return;
      case "take_item":
        takeItem(s, a.item);
        return;
      case "set_flag":
        s.flags[a.flag] = a.value;
        return;
      case "add_to_counter":
        s.counters[a.counter] = (s.counters[a.counter] ?? 0) + a.amount;
        return;
      case "award_points":
        award(s, a.award, a.points);
        return;
      case "show_object":
      case "hide_object":
        host.setObjectVisible(a.scene, a.object, a.type === "show_object");
        return;
      case "play_animation":
        this.block = host.playAnimation(a.target, a.animation);
        return;
      case "set_character_position":
        host.setCharacterPosition(a.character, a.scene, { x: a.x, y: a.y, facing: a.facing });
        return;
      case "play_sound":
        host.playSound(a.sound);
        return;
      case "play_music":
        s.music = a.music;
        host.playMusic(a.music);
        return;
      case "stop_music":
        s.music = null;
        host.playMusic(null);
        return;
      case "start_dialogue":
        // Blocks like a text box; the rule's later actions run after it ends (D136).
        this.block = host.startDialogue(a.dialogue);
        return;
      case "wait":
        this.waitLeft = a.seconds;
        return;
      case "die":
        this.stopped = true;
        host.endGame({ kind: "die", message: a.message });
        return;
      case "win_game":
        this.stopped = true;
        host.endGame({ kind: "win" });
        return;
    }
  }
}
