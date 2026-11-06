// Character animation slots (spec 05, D39, D70) and frame picking (D115). Pure
// commands from one Project to the next; the character tab calls them through
// `editor.apply`. What a slot shows comes from the engine's own `resolveAnim`.
import { resolveAnim, type AnimKind } from "@questforge/engine";
import { ANIMATION_SLOTS, Animation, type AnimationSlot, type CharacterFile, type Facing, type ImageAsset, type Project } from "@questforge/schema";
import { CommandError, updateDoc } from "./commands.ts";
import { frameCountOf } from "./sprites.ts";

export const SLOT_KINDS = ["idle", "walk", "talk"] as const satisfies readonly AnimKind[];
export const SLOT_DIRS = ["down", "up", "left", "right"] as const satisfies readonly Facing[];

export const slotOf = (kind: AnimKind, dir: Facing) => `${kind}_${dir}` as AnimationSlot;
export const splitSlot = (slot: AnimationSlot) => slot.split("_") as [AnimKind, Facing];

const findCharacter = (p: Project, id: string): CharacterFile => {
  const c = p.characters.find((d) => d.data.id === id)?.data;
  if (!c) throw new CommandError(`There's no character with ID ${id}.`);
  return c;
};

/** Rebuilds `animations` in slot order (D54), dropping empty slots. */
const ordered = (anims: CharacterFile["animations"]): CharacterFile["animations"] =>
  Object.fromEntries(ANIMATION_SLOTS.flatMap((s) => (anims[s] ? [[s, anims[s]]] : [])));

/** Fills or empties (`null`) one slot. */
export function setSlot(p: Project, characterId: string, slot: AnimationSlot, anim: Animation | null): Project {
  findCharacter(p, characterId);
  if (anim) {
    const ok = Animation.safeParse(anim);
    if (!ok.success) throw new CommandError(describeInvalid(anim));
  }
  return updateDoc<CharacterFile>(p, "character", characterId, (c) => ({ ...c, animations: ordered({ ...c.animations, [slot]: anim ?? undefined }) }));
}

function describeInvalid(anim: Animation): string {
  if (anim.frames.length === 0) return "An animation needs at least one frame.";
  if (!(anim.fps > 0 && anim.fps <= 60)) return "Frames per second must be more than 0 and at most 60.";
  return "That animation isn't valid.";
}

/**
 * The image a new slot starts with: the image the character's other slots use most,
 * else the first sliced image, else the first image.
 */
export function defaultSlotImage(p: Project, characterId: string): string | undefined {
  const c = findCharacter(p, characterId);
  const counts = new Map<string, number>();
  for (const a of Object.values(c.animations)) if (a) counts.set(a.image, (counts.get(a.image) ?? 0) + 1);
  const used = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (used) return used;
  const images = p.assets?.data.images ?? [];
  return (images.find((i) => i.sheet) ?? images[0])?.id;
}

/**
 * Changes some fields of a slot, filling it first if it's empty (8 fps, looping,
 * frame 0 of the default image). Changing the image keeps only frames it has.
 */
export function patchSlot(p: Project, characterId: string, slot: AnimationSlot, patch: Partial<Animation>): Project {
  const c = findCharacter(p, characterId);
  const current = c.animations[slot];
  let base: Animation;
  if (current) base = current;
  else {
    const image = patch.image ?? defaultSlotImage(p, characterId);
    if (!image) throw new CommandError("Import an image first: animations are frames of an image.");
    base = { image, frames: [0], fps: 8, loop: true };
  }
  const next: Animation = { ...base, ...patch };
  if (patch.image && patch.image !== base.image && !patch.frames) {
    const img = p.assets?.data.images.find((i) => i.id === patch.image);
    const count = img ? frameCountOf(img) : 1;
    const kept = next.frames.filter((f) => f < count);
    next.frames = kept.length ? kept : [0];
  }
  return setSlot(p, characterId, slot, { image: next.image, frames: next.frames, fps: next.fps, loop: next.loop });
}

export function setMirrorLeft(p: Project, characterId: string, mirrorLeft: boolean): Project {
  findCharacter(p, characterId);
  return updateDoc<CharacterFile>(p, "character", characterId, (c) => ({ ...c, mirrorLeft }));
}

/** What a slot shows in the game, and where it comes from. */
export interface SlotView {
  /** The slot's own animation, if it has one. */
  own: Animation | undefined;
  /** What the engine plays for this kind and facing (spec 05 fallbacks, D39, D70), or null. */
  shown: { anim: Animation; mirror: boolean; still: boolean; from: AnimationSlot } | null;
}

/** What one slot shows: its own animation, a mirrored right, or a fallback. */
export function slotView(c: Pick<CharacterFile, "animations" | "mirrorLeft">, slot: AnimationSlot): SlotView {
  const [kind, dir] = splitSlot(slot);
  const resolved = resolveAnim(c, kind, dir);
  const from = resolved && ANIMATION_SLOTS.find((s) => c.animations[s] === resolved.anim);
  return { own: c.animations[slot], shown: resolved && from ? { ...resolved, from } : null };
}

/** A short line for a slot card, e.g. "4 frames · 8 fps" or "Mirrors walk_right". */
export function slotLabel(view: SlotView, slot: AnimationSlot): string {
  if (view.own) return `${view.own.frames.length} frame${view.own.frames.length === 1 ? "" : "s"} · ${view.own.fps} fps${view.own.loop ? "" : " · once"}`;
  if (!view.shown) return "Empty";
  const { from, mirror, still } = view.shown;
  if (mirror && from === slot.replace(/_left$/, "_right")) return `Mirrors ${from}`;
  return `Empty: uses ${still ? `first frame of ${from}` : from}${mirror ? " (mirrored)" : ""}`;
}

// ── Frame picking (D115) ─────────────────────────────────────────────────────

export interface PickMods {
  /** Extend from the anchor (shift-click). */
  range?: boolean;
  /** Add or remove one frame (Cmd/Ctrl-click). */
  toggle?: boolean;
}

/**
 * The frames after clicking `cell` in the picker. A plain click picks just that frame;
 * shift-click picks the run from `anchor` to it (in either direction); Cmd/Ctrl-click
 * adds the frame at the end or removes it (never the last one).
 */
export function pickFrames(current: readonly number[], cell: number, mods: PickMods = {}, anchor?: number): number[] {
  if (mods.range && anchor !== undefined) {
    const step = cell >= anchor ? 1 : -1;
    return Array.from({ length: Math.abs(cell - anchor) + 1 }, (_, i) => anchor + i * step);
  }
  if (mods.toggle) {
    if (!current.includes(cell)) return [...current, cell];
    const rest = current.filter((f) => f !== cell);
    return rest.length ? rest : [...current];
  }
  return [cell];
}

/** Every frame of one sheet row, left to right (a walk cycle is usually one row). */
export function rowFrames(img: ImageAsset, row: number): number[] {
  if (!img.sheet) return [0];
  if (row < 0 || row >= img.sheet.rows) throw new CommandError(`The sheet has rows 1 to ${img.sheet.rows}.`);
  return Array.from({ length: img.sheet.columns }, (_, i) => row * img.sheet!.columns + i);
}
