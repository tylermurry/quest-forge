import { Id } from "./common.ts";
import type { DialogueFile } from "./dialogue.ts";
import type { GameFile } from "./game.ts";
import type { CharacterFile } from "./character.ts";
import type { ItemFile } from "./item.ts";
import { describePath, type DataPath, type FileKind, type Location } from "./problems.ts";
import { ASSET_LAYOUT, allDocs, assetPath, folderOf, type AssetKind, type Doc, type Project } from "./project.ts";
import type { Action, AnyRule, Condition, Trigger } from "./rules.ts";
import type { SceneFile } from "./scene.ts";
import { ICON_IDS } from "./style.ts";

/**
 * What an ID points at. `spawn` and `object` IDs are scoped to a scene; `node` to a dialogue;
 * `animation` (an object's one-shot) to `<scene>/<object>`; `slot` (a character's
 * animation slot played by `play_animation`) to the character.
 */
export type RefKind =
  | "scene"
  | "item"
  | "character"
  | "dialogue"
  | "flag"
  | "counter"
  | "image"
  | "audio"
  | "spawn"
  | "object"
  | "node"
  | "animation"
  | "slot";

export interface Reference {
  kind: RefKind;
  id: string;
  /** Scene ID for spawn/object refs, dialogue ID for node refs, `<scene>/<object>` for animation refs, character ID for slot refs. */
  scope?: string;
  fileKind: FileKind;
  location: Location;
}

/** The scope of an object's one-shot animation IDs. */
export const animationScope = (scene: string, object: string) => `${scene}/${object}`;

type Push = (kind: RefKind, id: string, path: DataPath, scope?: string) => void;

function triggerRefs(t: Trigger, at: DataPath, push: Push) {
  if (t.type === "use_item") push("item", t.item, [...at, "item"]);
  else if (t.type === "combine") {
    push("item", t.item, [...at, "item"]);
    push("item", t.with, [...at, "with"]);
  } else if (t.type === "dialogue_end") push("dialogue", t.dialogue, [...at, "dialogue"]);
}

function conditionRefs(c: Condition, at: DataPath, push: Push) {
  switch (c.type) {
    case "has_item":
    case "not_has_item":
      return push("item", c.item, [...at, "item"]);
    case "flag_is":
      return push("flag", c.flag, [...at, "flag"]);
    case "counter":
      return push("counter", c.counter, [...at, "counter"]);
    case "visited":
      return push("scene", c.scene, [...at, "scene"]);
    case "object_visible":
      push("scene", c.scene, [...at, "scene"]);
      return push("object", c.object, [...at, "object"], c.scene);
    case "first_time":
      return;
  }
}

function actionRefs(a: Action, at: DataPath, push: Push) {
  switch (a.type) {
    case "say":
      return push("character", a.character, [...at, "character"]);
    case "change_scene":
      push("scene", a.scene, [...at, "scene"]);
      return push("spawn", a.spawn, [...at, "spawn"], a.scene);
    case "give_item":
    case "take_item":
      return push("item", a.item, [...at, "item"]);
    case "set_flag":
      return push("flag", a.flag, [...at, "flag"]);
    case "add_to_counter":
      return push("counter", a.counter, [...at, "counter"]);
    case "show_object":
    case "hide_object":
      push("scene", a.scene, [...at, "scene"]);
      return push("object", a.object, [...at, "object"], a.scene);
    case "play_animation":
      if (a.target.kind === "character") {
        push("character", a.target.character, [...at, "target", "character"]);
        return push("slot", a.animation, [...at, "animation"], a.target.character);
      }
      push("scene", a.target.scene, [...at, "target", "scene"]);
      push("object", a.target.object, [...at, "target", "object"], a.target.scene);
      return push("animation", a.animation, [...at, "animation"], animationScope(a.target.scene, a.target.object));
    case "walk_character_to":
      return push("character", a.character, [...at, "character"]);
    case "set_character_position":
      push("character", a.character, [...at, "character"]);
      return push("scene", a.scene, [...at, "scene"]);
    case "play_sound":
      return push("audio", a.sound, [...at, "sound"]);
    case "play_music":
      return push("audio", a.music, [...at, "music"]);
    case "start_dialogue":
      return push("dialogue", a.dialogue, [...at, "dialogue"]);
    default:
      return;
  }
}

const conditionsRefs = (cs: Condition[], at: DataPath, push: Push) => cs.forEach((c, i) => conditionRefs(c, [...at, i], push));
const actionsRefs = (as: Action[], at: DataPath, push: Push) => as.forEach((a, i) => actionRefs(a, [...at, i], push));

function rulesRefs(rules: AnyRule[], at: DataPath, push: Push) {
  rules.forEach((r, i) => {
    triggerRefs(r.when, [...at, i, "when"], push);
    conditionsRefs(r.if, [...at, i, "if"], push);
    actionsRefs(r.do, [...at, i, "do"], push);
  });
}

function sceneRefs(s: SceneFile, push: Push) {
  if (s.background !== undefined) push("image", s.background, ["background"]);
  if (s.music !== undefined) push("audio", s.music, ["music"]);
  s.objects.forEach((o, i) => {
    push("image", o.image, ["objects", i, "image"]);
    if (o.animation) push("image", o.animation.image, ["objects", i, "animation", "image"]);
    o.animations?.forEach((a, j) => push("image", a.image, ["objects", i, "animations", j, "image"]));
    rulesRefs(o.rules, ["objects", i, "rules"], push);
  });
  s.characters.forEach((c, i) => {
    push("character", c.character, ["characters", i, "character"]);
    rulesRefs(c.rules, ["characters", i, "rules"], push);
  });
  s.hotspots.forEach((h, i) => rulesRefs(h.rules, ["hotspots", i, "rules"], push));
  s.regions.forEach((r, i) => rulesRefs(r.rules, ["regions", i, "rules"], push));
  rulesRefs(s.rules, ["rules"], push);
}

function dialogueRefs(d: DialogueFile, push: Push) {
  const next = (id: string | null, path: DataPath) => {
    if (id !== null) push("node", id, path, d.id);
  };
  d.nodes.forEach((n, i) => {
    const at = ["nodes", i];
    switch (n.type) {
      case "start":
        return next(n.next, [...at, "next"]);
      case "line":
        if (n.character !== undefined) {
          push("character", n.character, [...at, "character"]);
          // The speaker's slot; a narrator line has no one to animate.
          if (n.animation !== undefined) push("slot", n.animation, [...at, "animation"], n.character);
        }
        return next(n.next, [...at, "next"]);
      case "choices":
        return n.options.forEach((o, j) => {
          conditionsRefs(o.if, [...at, "options", j, "if"], push);
          next(o.next, [...at, "options", j, "next"]);
        });
      case "actions":
        actionsRefs(n.do, [...at, "do"], push);
        return next(n.next, [...at, "next"]);
      case "branch":
        conditionsRefs(n.if, [...at, "if"], push);
        next(n.then, [...at, "then"]);
        return next(n.else, [...at, "else"]);
      case "end":
        return;
    }
  });
}

/**
 * Image IDs the skin uses. `typography.font` is not pushed yet: #45 adds the font asset kind,
 * its RefKind and one push for it here.
 */
function styleRefs(style: NonNullable<GameFile["style"]>, push: Push) {
  const at = ["style"];
  if (style.sharedFrame?.image !== undefined) push("image", style.sharedFrame.image, [...at, "sharedFrame", "image"]);
  const bar = style.iconBar;
  if (bar?.frame?.image !== undefined) push("image", bar.frame.image, [...at, "iconBar", "frame", "image"]);
  for (const icon of ICON_IDS) {
    const id = bar?.icons?.[icon];
    if (id !== undefined) push("image", id, [...at, "iconBar", "icons", icon]);
  }
}

function gameRefs(g: GameFile, push: Push) {
  push("scene", g.startScene, ["startScene"]);
  push("spawn", g.startSpawn, ["startSpawn"], g.startScene);
  push("character", g.player, ["player"]);
  rulesRefs(g.rules, ["rules"], push);
  if (g.style) styleRefs(g.style, push);
}

function characterRefs(c: CharacterFile, push: Push) {
  for (const [slot, anim] of Object.entries(c.animations)) {
    if (anim) push("image", anim.image, ["animations", slot, "image"]);
  }
}

/** Every ID reference in the project, in file order, each with its exact location. */
export function collectReferences(project: Project): Reference[] {
  const refs: Reference[] = [];
  for (const { kind: fileKind, doc } of allDocs(project)) {
    const push: Push = (kind, id, path, scope) =>
      refs.push({ kind, id, ...(scope !== undefined && { scope }), fileKind, location: { file: doc.path, path } });
    const data = doc.data;
    if (fileKind === "game") gameRefs(data as GameFile, push);
    else if (fileKind === "scene") sceneRefs(data as SceneFile, push);
    else if (fileKind === "dialogue") dialogueRefs(data as DialogueFile, push);
    else if (fileKind === "item") push("image", (data as ItemFile).icon, ["icon"]);
    else if (fileKind === "character") characterRefs(data as CharacterFile, push);
  }
  return refs;
}

/** References to one ID, e.g. for the delete warning "Used by 3 rules in 2 scenes". */
export function findReferences(project: Project, kind: RefKind, id: string): Reference[] {
  const kinds: RefKind[] = kind === "flag" || kind === "counter" ? ["flag", "counter"] : [kind];
  return collectReferences(project).filter((r) => kinds.includes(r.kind) && r.id === id);
}

/** Human breadcrumb for a reference's spot. */
export function describeReference(project: Project, ref: Reference): string {
  const doc = [...allDocs(project)].find((d) => d.doc.path === ref.location.file);
  return describePath(ref.fileKind, ref.location.file, doc?.doc.data, ref.location.path.slice(0, -1));
}

/** Kinds the project-wide Rename command handles. Flags and counters share one namespace. */
export type RenameKind = AssetKind | "flag" | "image" | "audio";

export class RenameError extends Error {}

function setAt(root: unknown, path: DataPath, value: unknown) {
  let cur = root as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
  cur[path[path.length - 1]!] = value;
}

/** IDs currently defined for a kind. */
export function definedIds(project: Project, kind: RenameKind): string[] {
  switch (kind) {
    case "flag":
      return project.flags?.data.flags.map((f) => f.id) ?? [];
    case "image":
      return project.assets?.data.images.map((a) => a.id) ?? [];
    case "audio":
      return project.assets?.data.audio.map((a) => a.id) ?? [];
    default:
      return (project[ASSET_LAYOUT[kind].list] as Doc<{ id: string }>[]).map((d) => d.data.id);
  }
}

/**
 * The Rename command: changes an ID and updates every reference to it
 * across the project. An asset's file is renamed to match, in the same folder.
 * Only files that contain the ID change.
 */
export function renameId(project: Project, kind: RenameKind, from: string, to: string): Project {
  if (!Id.safeParse(to).success) throw new RenameError(`"${to}" isn't a valid ID`);
  const ids = definedIds(project, kind);
  if (!ids.includes(from)) throw new RenameError(`No ${kind} with ID ${from}`);
  if (from === to) return project;
  if (ids.includes(to)) throw new RenameError(`A ${kind} with ID ${to} already exists`);

  const refKinds: RefKind[] = kind === "flag" ? ["flag", "counter"] : [kind];
  const byFile = new Map<string, DataPath[]>();
  for (const ref of collectReferences(project)) {
    if (!refKinds.includes(ref.kind) || ref.id !== from) continue;
    byFile.set(ref.location.file, [...(byFile.get(ref.location.file) ?? []), ref.location.path]);
  }

  const edit = <T>(doc: Doc<T>, extra?: (data: T) => void): Doc<T> => {
    const paths = byFile.get(doc.path);
    if (!paths && !extra) return doc;
    const data = structuredClone(doc.data);
    for (const p of paths ?? []) setAt(data, p, to);
    extra?.(data);
    return { ...doc, data };
  };

  const next: Project = { ...project };
  next.game = project.game && edit(project.game);
  next.flags =
    project.flags &&
    edit(project.flags, kind === "flag" ? (d) => d.flags.forEach((f) => f.id === from && (f.id = to)) : undefined);
  next.assets =
    project.assets &&
    edit(
      project.assets,
      kind === "image" || kind === "audio"
        ? (d) => d[kind === "image" ? "images" : "audio"].forEach((a) => a.id === from && (a.id = to))
        : undefined,
    );
  for (const assetKind of Object.keys(ASSET_LAYOUT) as AssetKind[]) {
    const list = ASSET_LAYOUT[assetKind].list;
    // `list` is one of the asset list names chosen at run time, so TypeScript can't type the
    // key; every one of them holds Docs with an `id`.
    (next as unknown as Record<string, Doc<{ id: string }>[]>)[list] = (project[list] as Doc<{ id: string }>[]).map((doc) => {
      if (assetKind === kind && doc.data.id === from) {
        const renamed = edit(doc, (d) => (d.id = to));
        return { ...renamed, path: assetPath(assetKind, to, folderOf(doc.path)) };
      }
      return edit(doc);
    });
  }
  return next;
}

/** Things whose IDs live inside one scene. Objects and spawns can be referenced. */
export type SceneIdKind = "object" | "spawn" | "hotspot" | "region";

/**
 * Changes the ID of an object, spawn point, hotspot or region in one scene, and every
 * reference to it (`{ scene, object }` and `{ scene, spawn }` pairs anywhere).
 */
export function renameSceneId(project: Project, sceneId: string, kind: SceneIdKind, from: string, to: string): Project {
  if (!Id.safeParse(to).success) throw new RenameError(`"${to}" isn't a valid ID`);
  const doc = project.scenes.find((s) => s.data.id === sceneId);
  if (!doc) throw new RenameError(`No scene with ID ${sceneId}`);
  const s = doc.data;
  const ids =
    kind === "spawn" ? Object.keys(s.spawns) : kind === "object" ? s.objects.map((o) => o.id) : kind === "hotspot" ? s.hotspots.map((h) => h.id) : s.regions.map((r) => r.id);
  if (!ids.includes(from)) throw new RenameError(`No ${kind} with ID ${from}`);
  if (from === to) return project;
  if (ids.includes(to)) throw new RenameError(`This scene already has a ${kind} with ID ${to}`);

  const byFile = new Map<string, DataPath[]>();
  if (kind === "object" || kind === "spawn") {
    for (const ref of collectReferences(project)) {
      if (ref.kind !== kind || ref.scope !== sceneId || ref.id !== from) continue;
      byFile.set(ref.location.file, [...(byFile.get(ref.location.file) ?? []), ref.location.path]);
    }
  }
  const edit = <T>(d: Doc<T>, extra?: (data: T) => void): Doc<T> => {
    const paths = byFile.get(d.path);
    if (!paths && !extra) return d;
    const data = structuredClone(d.data);
    for (const p of paths ?? []) setAt(data, p, to);
    extra?.(data);
    return { ...d, data };
  };
  const define = (data: SceneFile) => {
    if (kind === "spawn") {
      // Keep the spawn's place in key order.
      data.spawns = Object.fromEntries(Object.entries(data.spawns).map(([k, v]) => [k === from ? to : k, v]));
    } else {
      const list = (kind === "object" ? data.objects : kind === "hotspot" ? data.hotspots : data.regions) as { id: string }[];
      list.forEach((x) => x.id === from && (x.id = to));
    }
  };
  const next: Project = { ...project };
  next.game = project.game && edit(project.game);
  next.scenes = project.scenes.map((d) => edit(d, d.data.id === sceneId ? define : undefined));
  next.dialogues = project.dialogues.map((d) => edit(d));
  next.items = project.items.map((d) => edit(d));
  next.characters = project.characters.map((d) => edit(d));
  return next;
}

/**
 * Changes the ID of one of an object's one-shot animations and every
 * `play_animation` that plays it.
 */
export function renameObjectAnimation(project: Project, sceneId: string, objectId: string, from: string, to: string): Project {
  if (!Id.safeParse(to).success) throw new RenameError(`"${to}" isn't a valid ID`);
  const doc = project.scenes.find((s) => s.data.id === sceneId);
  const object = doc?.data.objects.find((o) => o.id === objectId);
  if (!doc || !object) throw new RenameError(`No object ${objectId} in scene ${sceneId}`);
  const ids = (object.animations ?? []).map((a) => a.id);
  if (!ids.includes(from)) throw new RenameError(`No animation with ID ${from}`);
  if (from === to) return project;
  if (ids.includes(to)) throw new RenameError(`This object already has an animation with ID ${to}`);

  const scope = animationScope(sceneId, objectId);
  const byFile = new Map<string, DataPath[]>();
  for (const ref of collectReferences(project)) {
    if (ref.kind !== "animation" || ref.scope !== scope || ref.id !== from) continue;
    byFile.set(ref.location.file, [...(byFile.get(ref.location.file) ?? []), ref.location.path]);
  }
  const edit = <T>(d: Doc<T>, extra?: (data: T) => void): Doc<T> => {
    const paths = byFile.get(d.path);
    if (!paths && !extra) return d;
    const data = structuredClone(d.data);
    for (const p of paths ?? []) setAt(data, p, to);
    extra?.(data);
    return { ...d, data };
  };
  const define = (data: SceneFile) =>
    data.objects.find((o) => o.id === objectId)!.animations!.forEach((a) => a.id === from && (a.id = to));
  const next: Project = { ...project };
  next.game = project.game && edit(project.game);
  next.scenes = project.scenes.map((d) => edit(d, d.data.id === sceneId ? define : undefined));
  next.dialogues = project.dialogues.map((d) => edit(d));
  next.items = project.items.map((d) => edit(d));
  next.characters = project.characters.map((d) => edit(d));
  return next;
}
