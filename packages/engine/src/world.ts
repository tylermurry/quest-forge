import type { CharacterFile, Facing, GameFile, ImageAsset, SceneFile } from "@questforge/schema";
import { objectBaseline, scaleAt, sortByBaseline, walkSpeedAt } from "./depth.ts";
import { lookText } from "./look.ts";
import { NavMesh, sceneNav } from "./nav.ts";
import { facingFor, frameAt, frameRect, frameSize, originOf, resolveAnim, spriteRect, type AnimKind, type Rect, type Size } from "./sprite.ts";
import { dist, sub, type Vec } from "./vec.ts";
import { pointInPolygon } from "@questforge/schema";

// The playing scene: player movement, depth, draw order, hit-testing and M1 look text.
// Pure logic with no DOM, so it runs in tests; `render.ts` draws it.

export interface LoadedImage {
  asset: ImageAsset;
  size: Size;
  /** The decoded image; absent in headless tests. */
  el?: CanvasImageSource;
}

/** What the world needs to know about images: their asset entry and decoded size. */
export type ImageLookup = (id: string) => LoadedImage | undefined;

/** M1 verbs (D67). M2 adds Hand, Talk and items. */
export type Verb = "walk" | "look";

interface Actor {
  /** Character ID. */
  id: string;
  character: CharacterFile;
  pos: Vec;
  facing: Facing;
  kind: AnimKind;
  /** Seconds since the current animation started. */
  animTime: number;
  visible: boolean;
}

/** Something that can be looked at (D69 hit-test result). */
export type Target =
  | { kind: "hotspot"; id: string; name: string }
  | { kind: "object"; id: string; name: string }
  | { kind: "character"; id: string; name: string };

/** One sprite in the frame, in draw order. */
export interface Drawable {
  kind: "object" | "character";
  id: string;
  /** Interactive name, if any. */
  name?: string;
  image: LoadedImage;
  /** Source rectangle in the image. */
  src: Rect;
  /** Destination rectangle in scene space. */
  dest: Rect;
  mirror: boolean;
  baseline: number;
}

interface Pending {
  target: Target;
  facing: Facing | null;
  /** Point to face toward when no facing is given. */
  toward: Vec;
}

export class World {
  readonly scene: SceneFile;
  verb: Verb = "walk";
  /** The look text being shown (D67); input waits for a click to dismiss it. */
  text: string[] | null = null;
  readonly player: Actor;
  readonly npcs: Actor[];
  private readonly objectVisible: Map<string, boolean>;
  private navMesh: NavMesh;
  private path: Vec[] = [];
  private pending: Pending | null = null;

  constructor(
    private readonly game: GameFile,
    scene: SceneFile,
    private readonly characters: Map<string, CharacterFile>,
    private readonly images: ImageLookup,
    spawnId: string,
  ) {
    this.scene = scene;
    this.objectVisible = new Map(scene.objects.map((o) => [o.id, o.visible]));
    this.navMesh = this.buildNav();
    const spawn = scene.spawns[spawnId];
    if (!spawn) throw new Error(`Scene ${scene.id} has no spawn point ${spawnId}`);
    this.player = this.actor(game.player, [spawn.x, spawn.y], spawn.facing, true);
    this.npcs = scene.characters.filter((c) => c.character !== game.player).map((c) => this.actor(c.character, [c.x, c.y], c.facing, c.visible));
  }

  get nav(): NavMesh {
    return this.navMesh;
  }

  /** Remaining waypoints of the player's walk (for the debug overlay). */
  get route(): readonly Vec[] {
    return this.path;
  }

  isObjectVisible(id: string): boolean {
    return this.objectVisible.get(id) ?? false;
  }

  /** Show or hide an object; its obstacle joins or leaves the walkable area (D42). */
  setObjectVisible(id: string, visible: boolean) {
    if (!this.objectVisible.has(id) || this.objectVisible.get(id) === visible) return;
    this.objectVisible.set(id, visible);
    this.navMesh = this.buildNav();
    // Re-plan an ongoing walk against the new area.
    const dest = this.path.at(-1);
    if (dest) this.walkTo(dest, this.pending);
  }

  /** Depth scale at the player's feet. */
  get playerScale(): number {
    return scaleAt(this.scene.depth, this.player.pos[1]);
  }

  /** Right-click: cycle verbs (D32, D67). */
  secondaryClick() {
    if (this.text) return;
    this.verb = this.verb === "walk" ? "look" : "walk";
  }

  /** Left-click or tap at a scene point with the current verb. */
  primaryClick(p: Vec) {
    if (this.text) {
      this.text = null;
      return;
    }
    if (this.verb === "walk") {
      this.walkTo(p, null);
      return;
    }
    const target = this.hitTest(p);
    if (!target) return;
    const hotspot = target.kind === "hotspot" ? this.scene.hotspots.find((h) => h.id === target.id) : undefined;
    const walkTo = hotspot?.walkTo;
    this.walkTo(walkTo ? [walkTo.x, walkTo.y] : p, { target, facing: walkTo?.facing ?? null, toward: p });
  }

  /** Advance one logic tick (spec 03: fixed 60 Hz). */
  tick(dt: number) {
    for (const a of [this.player, ...this.npcs]) a.animTime += dt;
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

  /** Every visible sprite, back to front (spec 04 baseline sort). */
  drawList(): Drawable[] {
    const out: Drawable[] = [];
    for (const o of this.scene.objects) {
      if (!this.isObjectVisible(o.id)) continue;
      const image = this.images(o.image);
      if (!image) continue;
      // Objects draw their whole image in M1 (D66).
      const src = { x: 0, y: 0, w: image.size.w, h: image.size.h };
      out.push({
        kind: "object",
        id: o.id,
        ...(o.name ? { name: o.name } : {}),
        image,
        src,
        dest: { x: o.x, y: o.y, w: src.w, h: src.h },
        mirror: false,
        baseline: objectBaseline(o, image.size.h),
      });
    }
    for (const a of [...this.npcs, this.player]) {
      if (!a.visible) continue;
      const d = this.actorDrawable(a);
      if (d) out.push(d);
    }
    return sortByBaseline(out);
  }

  /** What's under a scene point (D69): hotspots first, then named sprites, topmost first. */
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

  private walkTo(p: Vec, pending: Pending | null) {
    this.pending = pending;
    this.path = this.navMesh.findPath(this.player.pos, p).slice(1);
    if (this.path.length === 0) this.arrive();
  }

  private arrive() {
    this.setAnim(this.player, "idle", this.player.facing);
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    const facing = pending.facing ?? facingFor(sub(pending.toward, this.player.pos), this.player.facing);
    this.setAnim(this.player, "idle", facing);
    this.text = lookText(this.rulesOf(pending.target), this.game.defaultResponses);
  }

  private rulesOf(t: Target) {
    switch (t.kind) {
      case "hotspot":
        return this.scene.hotspots.find((h) => h.id === t.id)?.rules ?? [];
      case "object":
        return this.scene.objects.find((o) => o.id === t.id)?.rules ?? [];
      case "character":
        return this.scene.characters.find((c) => c.character === t.id)?.rules ?? [];
    }
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
    return { id, character, pos, facing, kind: "idle", animTime: 0, visible };
  }

  private actorDrawable(a: Actor): Drawable | null {
    const resolved = resolveAnim(a.character, a.kind, a.facing);
    if (!resolved) return null;
    const image = this.images(resolved.anim.image);
    if (!image) return null;
    const frame = resolved.still ? resolved.anim.frames[0]! : frameAt(resolved.anim, a.animTime);
    const size = frameSize(image.asset, image.size);
    const scale = scaleAt(this.scene.depth, a.pos[1]);
    return {
      kind: "character",
      id: a.id,
      name: a.character.name,
      image,
      src: frameRect(image.asset, image.size, frame),
      dest: spriteRect(a.pos, originOf(image.asset, size), size, scale, resolved.mirror),
      mirror: resolved.mirror,
      baseline: a.pos[1],
    };
  }

  private buildNav() {
    return sceneNav(this.scene, (id) => this.isObjectVisible(id));
  }
}
