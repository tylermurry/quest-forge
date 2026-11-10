import {
  ANIMATION_SLOTS,
  pointInPolygon,
  type Animation,
  type AnimationSlot,
  type CharacterFile,
  type Facing,
  type ObjectAnimation,
  type SceneFile,
} from "@questforge/schema";
import { scaleAt, walkSpeedAt } from "./depth.ts";
import { actorDrawable, sceneDrawables, type Drawable, type ImageLookup, type LoadedImage, type ObjectPose } from "./drawables.ts";
import { NavMesh, sceneNav } from "./nav.ts";
import { facingFor, resolveAnim, type AnimKind } from "./sprite.ts";
import type { Position } from "./state.ts";
import { dist, sub, type Vec } from "./vec.ts";

// The playing scene: movement, depth, draw order and hit-testing. Verbs, rules and
// text live in `session.ts`. Pure logic with no DOM, so it runs in tests; `render.ts`
// draws it.

export type { Drawable, ImageLookup, LoadedImage };

export interface Actor {
  /** Character ID. */
  id: string;
  character: CharacterFile;
  pos: Vec;
  facing: Facing;
  kind: AnimKind;
  /** Seconds since the current animation started. */
  animTime: number;
  visible: boolean;
  /** A slot played by `play_animation`, shown until it ends or the actor walks. */
  special: { anim: Animation; mirror: boolean; time: number } | null;
}

/** Something that can be clicked (hit-test result). */
export type Target =
  | { kind: "hotspot"; id: string; name: string }
  | { kind: "object"; id: string; name: string }
  | { kind: "character"; id: string; name: string };

export interface WorldOptions {
  /** Character ID of the player. */
  player: string;
  /** Where the player stands. */
  spawn: Position;
  /** Object visibility at entry (from game state); defaults to the scene file. */
  objectVisible?: (id: string) => boolean;
  /** Overridden NPC positions (from game state). */
  characterPosition?: (id: string) => Position | undefined;
}

/** Where the player stands to use a verb on a target, and which way they then face. */
export interface Approach {
  dest: Vec;
  facing: Facing | null;
  /** Point to face toward when there's no facing. */
  toward: Vec;
}

export class World {
  readonly scene: SceneFile;
  readonly player: Actor;
  readonly npcs: Actor[];
  private readonly objectVisible: Map<string, boolean>;
  /** Seconds since the scene started: the clock of objects' looping animations. */
  private clock = 0;
  /** One-shots playing on objects; each ends back at rest. */
  private readonly oneShots = new Map<string, { anim: ObjectAnimation; time: number }>();
  private navMesh: NavMesh;
  private path: Vec[] = [];
  private _lastPath: Vec[] = [];
  private onArrive: (() => void) | null = null;
  /** Walks of NPCs started by `walk_character_to`, by character ID. */
  private readonly npcWalks = new Map<string, { path: Vec[]; onArrive: (() => void) | null }>();

  constructor(
    scene: SceneFile,
    private readonly characters: Map<string, CharacterFile>,
    private readonly images: ImageLookup,
    opts: WorldOptions,
  ) {
    this.scene = scene;
    this.objectVisible = new Map(scene.objects.map((o) => [o.id, opts.objectVisible ? opts.objectVisible(o.id) : o.visible]));
    this.navMesh = this.buildNav();
    this.player = this.actor(opts.player, [opts.spawn.x, opts.spawn.y], opts.spawn.facing, true);
    this.npcs = scene.characters
      .filter((c) => c.character !== opts.player)
      .map((c) => {
        const at = opts.characterPosition?.(c.character) ?? c;
        return this.actor(c.character, [at.x, at.y], at.facing, c.visible);
      });
  }

  get nav(): NavMesh {
    return this.navMesh;
  }

  /** The player's most recent walk, start to end, kept after arriving (playtest debug). */
  get lastPath(): readonly Vec[] {
    return this._lastPath;
  }

  /** Remaining waypoints of the player's walk (for the debug overlay). */
  get route(): readonly Vec[] {
    return this.path;
  }

  isObjectVisible(id: string): boolean {
    return this.objectVisible.get(id) ?? false;
  }

  /** Show or hide an object; its obstacle joins or leaves the walkable area. */
  setObjectVisible(id: string, visible: boolean) {
    if (!this.objectVisible.has(id) || this.objectVisible.get(id) === visible) return;
    this.objectVisible.set(id, visible);
    this.navMesh = this.buildNav();
    // Re-plan an ongoing walk against the new area.
    const dest = this.path.at(-1);
    if (dest) this.walkTo(dest, this.onArrive);
  }

  /** Depth scale at the player's feet. */
  get playerScale(): number {
    return scaleAt(this.scene.depth, this.player.pos[1]);
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  /** The player or an NPC in this scene. */
  actorById(id: string): Actor | undefined {
    return id === this.player.id ? this.player : this.npcs.find((a) => a.id === id);
  }

  /**
   * Walk the player to `p` (or the nearest reachable point). `onArrive` runs when
   * they get there; a later walk replaces it.
   */
  walkTo(p: Vec, onArrive: (() => void) | null = null) {
    this.onArrive = onArrive;
    this.player.special = null;
    const full = this.navMesh.findPath(this.player.pos, p);
    this.path = full.slice(1);
    if (full.length > 1) this._lastPath = full;
    if (this.path.length === 0) this.arrive();
  }

  /** Whether an NPC is mid-walk from `walkNpcTo`. */
  isNpcWalking(id: string): boolean {
    return this.npcWalks.has(id);
  }

  /**
   * Walk an NPC to `p` (or the nearest reachable point). Returns false when the
   * character isn't an NPC here. `onArrive` runs when they get there; a later walk replaces it.
   */
  walkNpcTo(id: string, p: Vec, onArrive: (() => void) | null = null): boolean {
    const a = this.npcs.find((n) => n.id === id);
    if (!a) return false;
    a.special = null;
    const path = this.navMesh.findPath(a.pos, p).slice(1);
    if (path.length === 0) {
      this.npcWalks.delete(id);
      this.setAnim(a, "idle", a.facing);
      onArrive?.();
      return true;
    }
    this.npcWalks.set(id, { path, onArrive });
    return true;
  }

  private tickNpcWalks(dt: number) {
    for (const [id, walk] of this.npcWalks) {
      const a = this.npcs.find((n) => n.id === id)!;
      let budget = walkSpeedAt(this.scene.depth, a.pos[1], a.character.walkSpeed) * dt;
      while (budget > 0 && walk.path.length > 0) {
        const next = walk.path[0]!;
        const d = dist(a.pos, next);
        if (d > 0) {
          // A character with no walk animation slides in its idle pose instead of vanishing.
          const facing = facingFor(sub(next, a.pos), a.facing);
          this.setAnim(a, resolveAnim(a.character, "walk", facing) ? "walk" : "idle", facing);
        }
        if (d <= budget) {
          a.pos = next;
          walk.path.shift();
          budget -= d;
        } else {
          const k = budget / d;
          a.pos = [a.pos[0] + (next[0] - a.pos[0]) * k, a.pos[1] + (next[1] - a.pos[1]) * k];
          budget = 0;
        }
      }
      if (walk.path.length === 0) {
        this.npcWalks.delete(id);
        this.setAnim(a, "idle", a.facing);
        walk.onArrive?.();
      }
    }
  }

  /** Stop where the player is, dropping any arrival callback. */
  stop() {
    this.path = [];
    this.onArrive = null;
    this.setAnim(this.player, "idle", this.player.facing);
  }

  face(facing: Facing) {
    this.setAnim(this.player, this.player.kind === "walk" ? "walk" : "idle", facing);
  }

  faceToward(p: Vec) {
    this.face(facingFor(sub(p, this.player.pos), this.player.facing));
  }

  /** Where to stand to use a verb on `target` clicked at `p`. */
  approach(target: Target, p: Vec): Approach {
    const hotspot = target.kind === "hotspot" ? this.scene.hotspots.find((h) => h.id === target.id) : undefined;
    const walkTo = hotspot?.walkTo;
    const dest: Vec = walkTo ? [walkTo.x, walkTo.y] : target.kind === "character" ? this.besideCharacter(target.id) : p;
    return { dest, facing: walkTo?.facing ?? null, toward: p };
  }

  /** Set an actor talking (while a `say` box shows) or back to idle. */
  setTalking(id: string, talking: boolean) {
    const a = this.actorById(id);
    if (!a || a.kind === "walk") return;
    this.setAnim(a, talking ? "talk" : "idle", a.facing);
  }

  /** Move an NPC (adding it to this scene if it isn't here yet). */
  placeCharacter(id: string, p: Position) {
    const a = this.actorById(id);
    if (a && a !== this.player) {
      this.npcWalks.delete(id);
      a.pos = [p.x, p.y];
      this.setAnim(a, "idle", p.facing);
      return;
    }
    if (!a) this.npcs.push(this.actor(id, [p.x, p.y], p.facing, true));
  }

  /**
   * Play one of a character's animation slots. Returns its length in seconds
   * if it's one-shot, 0 if it loops, null if there's no such slot.
   */
  playSlot(id: string, slot: string): number | null {
    const a = this.actorById(id);
    if (!a || !(ANIMATION_SLOTS as readonly string[]).includes(slot)) return null;
    const anims = a.character.animations;
    let anim = anims[slot as AnimationSlot];
    let mirror = false;
    if (!anim && slot.endsWith("_left") && a.character.mirrorLeft) {
      anim = anims[slot.replace(/_left$/, "_right") as AnimationSlot];
      mirror = true;
    }
    if (!anim) return null;
    a.special = { anim, mirror, time: 0 };
    return anim.loop ? 0 : anim.frames.length / anim.fps;
  }

  /**
   * Play one of an object's one-shot animations. Returns its length in seconds,
   * or null if the object is hidden or has no such animation. Replaces a one-shot
   * already playing on it.
   */
  playObjectAnimation(id: string, name: string): number | null {
    const anim = this.scene.objects.find((o) => o.id === id)?.animations?.find((a) => a.id === name);
    if (!anim || !this.isObjectVisible(id)) return null;
    this.oneShots.set(id, { anim, time: 0 });
    return anim.frames.length / anim.fps;
  }

  /** The one-shot playing on an object (an identity to wait on), or null at rest. */
  objectOneShot(id: string): object | null {
    return this.oneShots.get(id) ?? null;
  }

  /** Where an object's animations are, for drawing. */
  objectPose(id: string): ObjectPose {
    return { time: this.clock, oneShot: this.oneShots.get(id) ?? null };
  }

  /** Characters have no walk-to point: stand beside them, on the side the player is on. */
  private besideCharacter(id: string): Vec {
    const npc = this.npcs.find((a) => a.id === id)!;
    const sprite = this.actorDrawable(npc);
    const gap = (sprite ? sprite.dest.w : 20) * 0.75 + 4;
    const side = this.player.pos[0] <= npc.pos[0] ? -1 : 1;
    const spot: Vec = [npc.pos[0] + side * gap, npc.pos[1]];
    return this.navMesh.isWalkable(spot) ? spot : [npc.pos[0] - side * gap, npc.pos[1]];
  }

  /** Advance one logic tick (fixed 60 Hz). */
  tick(dt: number) {
    this.clock += dt;
    for (const [id, shot] of this.oneShots) {
      shot.time += dt;
      if (shot.time >= shot.anim.frames.length / shot.anim.fps) this.oneShots.delete(id);
    }
    for (const a of [this.player, ...this.npcs]) {
      a.animTime += dt;
      if (a.special) {
        a.special.time += dt;
        const { anim } = a.special;
        if (!anim.loop && a.special.time >= anim.frames.length / anim.fps) a.special = null;
      }
    }
    this.tickNpcWalks(dt);
    if (this.path.length === 0) return;
    let budget = walkSpeedAt(this.scene.depth, this.player.pos[1], this.player.character.walkSpeed) * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const d = dist(this.player.pos, next);
      if (d > 0) this.setAnim(this.player, "walk", facingFor(sub(next, this.player.pos), this.player.facing));
      if (d <= budget) {
        this.player.pos = next;
        this.path.shift();
        budget -= d;
      } else {
        const k = budget / d;
        this.player.pos = [this.player.pos[0] + (next[0] - this.player.pos[0]) * k, this.player.pos[1] + (next[1] - this.player.pos[1]) * k];
        budget = 0;
      }
    }
    if (this.path.length === 0) this.arrive();
  }

  /** Every visible sprite, back to front (sorted by baseline). */
  drawList(): Drawable[] {
    const actors = [...this.npcs, this.player].filter((a) => a.visible);
    return sceneDrawables(
      this.scene,
      this.images,
      (id) => this.isObjectVisible(id),
      actors,
      (id) => this.objectPose(id),
    );
  }

  /** What's under a scene point: hotspots first, then named sprites, topmost first. */
  hitTest(p: Vec): Target | null {
    for (const h of [...this.scene.hotspots].reverse()) {
      if (pointInPolygon(p, h.shape)) return { kind: "hotspot", id: h.id, name: h.name };
    }
    for (const d of this.drawList().reverse()) {
      if (d.id === this.player.id && d.kind === "character") continue;
      if (!d.name) continue;
      const r = d.dest;
      if (p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h) {
        return { kind: d.kind, id: d.id, name: d.name };
      }
    }
    return null;
  }

  private arrive() {
    this.setAnim(this.player, "idle", this.player.facing);
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  private setAnim(a: Actor, kind: AnimKind, facing: Facing) {
    if (a.kind === kind && a.facing === facing) return;
    a.kind = kind;
    a.facing = facing;
    a.animTime = 0;
  }

  private actor(id: string, pos: Vec, facing: Facing, visible: boolean): Actor {
    const character = this.characters.get(id);
    if (!character) throw new Error(`Character ${id} doesn't exist`);
    return { id, character, pos, facing, kind: "idle", animTime: 0, visible, special: null };
  }

  private actorDrawable(a: Actor): Drawable | null {
    return actorDrawable(a, this.scene.depth, this.images);
  }

  private buildNav() {
    return sceneNav(this.scene, (id) => this.isObjectVisible(id));
  }
}
