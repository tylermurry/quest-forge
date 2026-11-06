// What each rule picker lists, and "+ Create new…" (spec 10, D123). DOM-free: the
// combobox only renders `pickerOptions` and calls `createForPicker` inside one
// Editor.apply, so creating something and using it is one undo step.
import { animationScope, type Project } from "@questforge/schema";
import { CommandError, createFlag, createNamedEntry, slugify, uniqueId } from "../commands.ts";
import { awardIds } from "./defaults.ts";
import type { Field, PickKind } from "./vocab.ts";

export interface PickOption {
  id: string;
  /** What the picker shows: a display name where there is one, else the ID. */
  label: string;
}

const named = (docs: { data: { id: string; name?: string } }[]): PickOption[] => docs.map((d) => ({ id: d.data.id, label: d.data.name ?? d.data.id }));
const plain = (ids: readonly string[]): PickOption[] => ids.map((id) => ({ id, label: id }));

/** Choices for a picker. `scope` is the scene (spawn, object), `<scene>/<object>` (animation) or character (slot). */
export function pickerOptions(p: Project, pick: PickKind, scope?: string): PickOption[] {
  switch (pick) {
    case "item":
      return named(p.items);
    case "flag":
    case "counter": {
      const type = pick === "flag" ? "bool" : "counter";
      return plain(p.flags?.data.flags.filter((f) => f.type === type).map((f) => f.id) ?? []);
    }
    case "scene":
      return named(p.scenes);
    case "character":
      return named(p.characters);
    case "dialogue":
      return named(p.dialogues);
    case "audio":
      return plain(p.assets?.data.audio.map((a) => a.id) ?? []);
    case "award":
      return plain(awardIds(p));
    case "spawn":
      return plain(Object.keys(p.scenes.find((s) => s.data.id === scope)?.data.spawns ?? {}));
    case "object": {
      const objects = p.scenes.find((s) => s.data.id === scope)?.data.objects ?? [];
      return objects.map((o) => ({ id: o.id, label: o.name ? `${o.name} (${o.id})` : o.id }));
    }
    case "animation": {
      const object = p.scenes.flatMap((s) => s.data.objects.map((o) => ({ key: animationScope(s.data.id, o.id), o }))).find((x) => x.key === scope)?.o;
      return plain((object?.animations ?? []).map((a) => a.id));
    }
    case "slot": {
      const c = p.characters.find((x) => x.data.id === scope)?.data;
      if (!c) return [];
      const filled = Object.entries(c.animations).flatMap(([slot, a]) => (a ? [slot] : []));
      const mirrored = c.mirrorLeft ? filled.filter((s) => s.endsWith("_right")).map((s) => s.replace(/_right$/, "_left")) : [];
      return plain([...new Set([...filled, ...mirrored])].sort());
    }
  }
}

/**
 * The picker a field really uses inside one condition or action: spawns and objects
 * come from the part's scene, and `play_animation` lists the object's one-shots or the
 * character's slots depending on its target.
 */
export function fieldPick(part: Record<string, unknown>, field: Extract<Field, { kind: "pick" }>): { pick: PickKind; scope?: string } {
  if (field.pick === "animation") {
    const t = part.target as { kind: "character"; character: string } | { kind: "object"; scene: string; object: string } | undefined;
    if (t?.kind === "character") return { pick: "slot", scope: t.character };
    if (t?.kind === "object") return { pick: "animation", scope: animationScope(t.scene, t.object) };
  }
  if (field.scopeKey) {
    const scope = part[field.scopeKey];
    return typeof scope === "string" ? { pick: field.pick, scope } : { pick: field.pick };
  }
  return { pick: field.pick };
}

/** Kinds "+ Create new…" can make (D123). Spawns and objects are made on the canvas; audio by import. */
export const CREATABLE: ReadonlySet<PickKind> = new Set(["item", "flag", "counter", "scene", "character", "dialogue", "award"]);

export const CREATE_NOUN: Partial<Record<PickKind, string>> = {
  item: "item",
  flag: "flag",
  counter: "counter",
  scene: "scene",
  character: "character",
  dialogue: "dialogue",
  award: "award",
};

/**
 * Makes a new thing named `name` for a picker and returns its ID. An award is only an
 * ID, so it changes nothing until it is used.
 */
export function createForPicker(p: Project, pick: PickKind, name: string): { project: Project; id: string } {
  if (!name.trim()) throw new CommandError("Type a name first.");
  switch (pick) {
    case "flag":
      return createFlag(p, name, "bool");
    case "counter":
      return createFlag(p, name, "counter");
    case "item":
    case "scene":
    case "character":
    case "dialogue":
      return createNamedEntry(p, pick, name);
    case "award":
      return { project: p, id: uniqueId(slugify(name, "award"), awardIds(p)) };
    default:
      throw new CommandError(`A new ${pick} can't be made here.`);
  }
}

/** "+ Create new…": makes the thing and uses it, for one Editor.apply (one undo step, D123). */
export function createAndUse(p: Project, pick: PickKind, name: string, use: (p: Project, id: string) => Project): Project {
  const { project, id } = createForPicker(p, pick, name);
  return use(project, id);
}
