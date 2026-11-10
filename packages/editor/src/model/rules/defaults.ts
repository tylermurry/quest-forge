// What a new trigger, condition or action starts as. Pickers start on the
// first existing choice, so most new parts are valid at once. When nothing exists yet
// they start on a placeholder ID that validation reports in red until the user picks
// or creates one; text starts empty and is an error until typed.
import { SCENE_HEIGHT, SCENE_WIDTH, logicBlocks, type Action, type Condition, type Project, type SceneFile, type Trigger } from "@questforge/schema";
import { uniqueId } from "../commands.ts";
import { ownerScene, type RuleOwnerRef, type TriggerType } from "./owner.ts";
import type { ActionType, ConditionType } from "./vocab.ts";

/** IDs a new part can start on, plus the owner's scene for scene-scoped parts. */
export class RuleDefaults {
  constructor(
    readonly project: Project,
    readonly owner: RuleOwnerRef,
  ) {}

  /** The owner's scene, else the start scene, else the first scene. */
  get scene(): SceneFile | undefined {
    const p = this.project;
    const id = ownerScene(this.owner) ?? p.game?.data.startScene;
    return p.scenes.find((s) => s.data.id === id)?.data ?? p.scenes[0]?.data;
  }

  private first(ids: string[], placeholder: string) {
    return ids[0] ?? placeholder;
  }
  item = () =>
    this.first(
      this.project.items.map((i) => i.data.id),
      "item",
    );
  flag = () => this.first(this.flagsOf("bool"), "flag");
  counter = () => this.first(this.flagsOf("counter"), "counter");
  character = () => {
    // A placed character's own rules speak as that character; otherwise the player.
    if (this.owner.kind === "thing" && this.owner.list === "characters") return this.owner.key;
    return (
      this.project.game?.data.player ??
      this.first(
        this.project.characters.map((c) => c.data.id),
        "player",
      )
    );
  };
  dialogue = () =>
    this.first(
      this.project.dialogues.map((d) => d.data.id),
      "dialogue",
    );
  sound = () => this.first(this.project.assets?.data.audio.map((a) => a.id) ?? [], "sound");
  sceneId = () => this.scene?.id ?? "scene";

  /** The scene's first spawn: `default` if it has one. */
  spawnIn(sceneId: string) {
    const s = this.project.scenes.find((d) => d.data.id === sceneId)?.data;
    const ids = Object.keys(s?.spawns ?? {});
    return ids.includes("default") ? "default" : this.first(ids, "default");
  }

  /** The owner itself when it is an object, else the scene's first object. */
  objectIn(sceneId: string) {
    if (this.owner.kind === "thing" && this.owner.list === "objects" && this.owner.scene === sceneId) return this.owner.key;
    const s = this.project.scenes.find((d) => d.data.id === sceneId)?.data;
    return this.first(s?.objects.map((o) => o.id) ?? [], "object");
  }

  /** Where `walk_player_to` starts: the hotspot's walk-to point, else the scene's default spawn, else the middle. */
  point(): { x: number; y: number } {
    const s = this.scene;
    if (this.owner.kind === "thing" && this.owner.list === "hotspots" && s) {
      const key = this.owner.key;
      const w = s.hotspots.find((h) => h.id === key)?.walkTo;
      if (w) return { x: w.x, y: w.y };
    }
    const spawn = s?.spawns.default ?? Object.values(s?.spawns ?? {})[0];
    return spawn ? { x: spawn.x, y: spawn.y } : { x: SCENE_WIDTH / 2, y: SCENE_HEIGHT / 2 };
  }

  private flagsOf(type: "bool" | "counter") {
    return this.project.flags?.data.flags.filter((f) => f.type === type).map((f) => f.id) ?? [];
  }

  trigger(type: TriggerType): Trigger {
    switch (type) {
      case "use_item":
        return { type, item: this.item() };
      case "combine": {
        const items = this.project.items.map((i) => i.data.id);
        return { type, item: items[0] ?? "item", with: items[1] ?? items[0] ?? "item" };
      }
      case "dialogue_end":
        return { type, dialogue: this.dialogue() };
      default:
        return { type };
    }
  }

  condition(type: ConditionType): Condition {
    switch (type) {
      case "has_item":
      case "not_has_item":
        return { type, item: this.item() };
      case "flag_is":
        return { type, flag: this.flag(), value: true };
      case "counter":
        return { type, counter: this.counter(), op: "eq", value: 0 };
      case "visited":
        return { type, scene: this.sceneId() };
      case "object_visible": {
        const scene = this.sceneId();
        return { type, scene, object: this.objectIn(scene), visible: true };
      }
      case "first_time":
        return { type };
    }
  }

  action(type: ActionType): Action {
    switch (type) {
      case "narrate":
        return { type, text: "" };
      case "say":
        return { type, character: this.character(), text: "" };
      case "walk_player_to":
        return { type, ...this.point() };
      case "walk_character_to":
        return { type, character: this.character(), ...this.point() };
      case "face":
        return { type, facing: "down" };
      case "change_scene": {
        // Usually somewhere else: the first scene that isn't this one.
        const here = ownerScene(this.owner);
        const scene = this.project.scenes.find((s) => s.data.id !== here)?.data.id ?? this.sceneId();
        return { type, scene, spawn: this.spawnIn(scene) };
      }
      case "give_item":
      case "take_item":
        return { type, item: this.item() };
      case "set_flag":
        return { type, flag: this.flag(), value: true };
      case "add_to_counter":
        return { type, counter: this.counter(), amount: 1 };
      case "award_points":
        // A fresh award named after the owner: each award counts once.
        return {
          type,
          points: 1,
          award: uniqueId(this.owner.kind === "thing" ? this.owner.key : this.owner.kind === "scene" ? this.owner.scene : "award", awardIds(this.project)),
        };
      case "show_object":
      case "hide_object": {
        const scene = this.sceneId();
        return { type, scene, object: this.objectIn(scene) };
      }
      case "play_animation": {
        const scene = this.sceneId();
        const object = this.objectIn(scene);
        const o = this.project.scenes.find((s) => s.data.id === scene)?.data.objects.find((x) => x.id === object);
        return { type, target: { kind: "object", scene, object }, animation: o?.animations?.[0]?.id ?? "animation" };
      }
      case "set_character_position":
        return { type, character: this.character(), scene: this.sceneId(), ...this.point(), facing: "down" };
      case "play_sound":
        return { type, sound: this.sound() };
      case "play_music":
        return { type, music: this.sound() };
      case "start_dialogue":
        return { type, dialogue: this.dialogue() };
      case "wait":
        return { type, seconds: 1 };
      case "die":
        return { type, message: "" };
      case "stop_music":
      case "win_game":
        return { type };
    }
  }
}

/** Award IDs already given by some `award_points` (the award picker lists these). */
export function awardIds(p: Project): string[] {
  const ids = new Set<string>();
  for (const b of logicBlocks(p)) for (const { a } of b.actions) if (a.type === "award_points") ids.add(a.award);
  return [...ids];
}
