import { inWalkable, polygonIssue, polygonWithin, type PolygonIssue } from "./geometry.ts";
import { describePath, type DataPath, type FileKind, type Problem, type ProblemCode } from "./problems.ts";
import { allDocs, filesAfterSave, type Doc, type Project } from "./project.ts";
import { animationScope, collectReferences, type RefKind, type Reference } from "./references.ts";
import type { CharacterFile } from "./character.ts";
import type { Polygon } from "./common.ts";
import type { SceneFile } from "./scene.ts";
import type { DialogueFile } from "./dialogue.ts";
import { checkLogic } from "./warnings.ts";

// Validation: the errors that block playtest and export, plus
// the warnings and empty-text errors in warnings.ts.

const KIND_NOUN: Record<RefKind, string> = {
  scene: "scene",
  item: "item",
  character: "character",
  dialogue: "dialogue",
  flag: "flag",
  counter: "counter",
  image: "image",
  audio: "sound",
  spawn: "spawn point",
  object: "object",
  node: "node",
  animation: "animation",
  slot: "animation",
};

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** The closest existing ID, if it's close enough to be a likely typo. */
export function suggest(id: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(id, c);
    if (d < bestDist || (d === bestDist && best !== undefined && c < best)) {
      best = c;
      bestDist = d;
    }
  }
  return best !== undefined && bestDist <= Math.max(1, Math.floor(id.length / 4)) ? best : undefined;
}

class Collector {
  readonly problems: Problem[] = [];
  constructor(private readonly project: Project) {}

  private dataOf(file: string) {
    return [...allDocs(this.project)].find((d) => d.doc.path === file)?.doc.data;
  }

  /** `crumbPath` is where the breadcrumb stops; defaults to the parent of `path`. */
  error(code: ProblemCode, fileKind: FileKind, file: string, path: DataPath, message: string, crumbPath = path.slice(0, -1)) {
    this.push("error", code, fileKind, file, path, message, crumbPath);
  }

  warning(code: ProblemCode, fileKind: FileKind, file: string, path: DataPath, message: string, crumbPath = path.slice(0, -1)) {
    this.push("warning", code, fileKind, file, path, message, crumbPath);
  }

  private push(severity: Problem["severity"], code: ProblemCode, fileKind: FileKind, file: string, path: DataPath, message: string, crumbPath: DataPath) {
    this.problems.push({
      severity,
      code,
      breadcrumb: describePath(fileKind, file, this.dataOf(file), crumbPath),
      message,
      location: { file, path },
    });
  }
}

const didYouMean = (s: string | undefined) => (s ? ` Did you mean ${s}?` : "");

function checkReferences(project: Project, out: Collector) {
  const ids = (docs: Doc<{ id: string }>[]) => new Set(docs.map((d) => d.data.id));
  const flags = project.flags?.data.flags ?? [];
  const known: Record<Exclude<RefKind, "spawn" | "object" | "node" | "animation" | "slot">, Set<string>> = {
    scene: ids(project.scenes),
    item: ids(project.items),
    character: ids(project.characters),
    dialogue: ids(project.dialogues),
    flag: new Set(flags.filter((f) => f.type === "bool").map((f) => f.id)),
    counter: new Set(flags.filter((f) => f.type === "counter").map((f) => f.id)),
    image: new Set(project.assets?.data.images.map((a) => a.id)),
    audio: new Set(project.assets?.data.audio.map((a) => a.id)),
  };
  const sceneById = new Map(project.scenes.map((s) => [s.data.id, s.data]));
  const dialogueById = new Map(project.dialogues.map((d) => [d.data.id, d.data]));
  const characterById = new Map(project.characters.map((c) => [c.data.id, c.data]));
  const objectByScope = new Map(project.scenes.flatMap((s) => s.data.objects.map((o) => [animationScope(s.data.id, o.id), o] as const)));

  const scopedIds = (ref: Reference): Set<string> | null => {
    if (ref.kind === "spawn" || ref.kind === "object") {
      const scene = sceneById.get(ref.scope!);
      if (!scene) return null; // the scene reference itself is reported
      return new Set(ref.kind === "spawn" ? Object.keys(scene.spawns) : scene.objects.map((o) => o.id));
    }
    if (ref.kind === "node") {
      const d = dialogueById.get(ref.scope!);
      return d ? new Set(d.nodes.map((n) => n.id)) : null;
    }
    if (ref.kind === "animation") {
      const o = objectByScope.get(ref.scope!);
      return o ? new Set((o.animations ?? []).map((a) => a.id)) : null; // a missing object is reported itself
    }
    if (ref.kind === "slot") {
      const c = characterById.get(ref.scope!);
      return c ? playableSlots(c) : null;
    }
    return known[ref.kind];
  };

  for (const ref of collectReferences(project)) {
    const { file, path } = ref.location;
    if (ref.fileKind === "game" && path[0] === "startScene") {
      if (!known.scene.has(ref.id)) {
        out.error("start_scene_missing", "game", file, path, `the start scene ${ref.id} doesn't exist.${didYouMean(suggest(ref.id, known.scene))}`);
      }
      continue;
    }
    const pool = scopedIds(ref);
    if (!pool || pool.has(ref.id)) continue;
    const noun = KIND_NOUN[ref.kind];
    let message: string;
    if (ref.kind === "flag" && known.counter.has(ref.id)) message = `uses ${ref.id} as a flag, but it's a counter.`;
    else if (ref.kind === "counter" && known.flag.has(ref.id)) message = `uses ${ref.id} as a counter, but it's a flag.`;
    else if (ref.kind === "spawn") {
      const sceneName = sceneById.get(ref.scope!)?.name ?? ref.scope;
      message = `uses spawn point ${ref.id} in ${sceneName}, which doesn't exist.${didYouMean(suggest(ref.id, pool))}`;
    } else if (ref.kind === "object") {
      const sceneName = sceneById.get(ref.scope!)?.name ?? ref.scope;
      message = `uses object ${ref.id} in ${sceneName}, which doesn't exist.${didYouMean(suggest(ref.id, pool))}`;
    } else if (ref.kind === "node") {
      message = `connects to node ${ref.id}, which doesn't exist.`;
    } else if (ref.kind === "animation") {
      const objectId = ref.scope!.slice(ref.scope!.indexOf("/") + 1);
      message = `plays animation ${ref.id} on object ${objectId}, which has no animation with that ID.${didYouMean(suggest(ref.id, pool))}`;
    } else if (ref.kind === "slot") {
      const name = characterById.get(ref.scope!)?.name ?? ref.scope;
      message = `plays animation ${ref.id} on ${name}, who has no animation in that slot.${didYouMean(suggest(ref.id, pool))}`;
    } else {
      message = `uses ${noun} ${ref.id}, which doesn't exist.${didYouMean(suggest(ref.id, pool))}`;
    }
    out.error("missing_reference", ref.fileKind, file, path, message);
  }
}

function checkDuplicates(project: Project, out: Collector) {
  const dupes = <T>(items: T[], idOf: (t: T) => string, report: (t: T, index: number, firstIndex: number) => void) => {
    const first = new Map<string, number>();
    items.forEach((t, i) => {
      const id = idOf(t);
      const f = first.get(id);
      if (f === undefined) first.set(id, i);
      else report(t, i, f);
    });
  };

  // Asset IDs are unique per type across all files.
  const lists = [
    ["scene", project.scenes],
    ["item", project.items],
    ["character", project.characters],
    ["dialogue", project.dialogues],
  ] as const;
  for (const [kind, docs] of lists) {
    const all = docs as readonly Doc<{ id: string }>[];
    dupes(
      [...all],
      (d) => d.data.id,
      (d, _i, f) => {
        out.error("duplicate_id", kind, d.path, ["id"], `uses the ID ${d.data.id}, which ${all[f]!.path} already uses. IDs must be unique.`, []);
      },
    );
  }

  const inList = (fileKind: FileKind, file: string, listPath: DataPath, items: { id: string }[], noun: string) =>
    dupes(
      items,
      (t) => t.id,
      (t, i) => {
        out.error("duplicate_id", fileKind, file, [...listPath, i, "id"], `uses the ID ${t.id}, which another ${noun} already uses. IDs must be unique.`, [
          ...listPath,
          i,
        ]);
      },
    );

  if (project.flags) inList("flags", project.flags.path, ["flags"], project.flags.data.flags, "flag or counter");
  if (project.assets) {
    inList("assets", project.assets.path, ["images"], project.assets.data.images, "image");
    inList("assets", project.assets.path, ["audio"], project.assets.data.audio, "sound");
  }
  for (const { path, data } of project.scenes) {
    inList("scene", path, ["objects"], data.objects, "object in this scene");
    inList("scene", path, ["hotspots"], data.hotspots, "hotspot in this scene");
    inList("scene", path, ["regions"], data.regions, "region in this scene");
    data.objects.forEach((o, i) => inList("scene", path, ["objects", i, "animations"], o.animations ?? [], "animation of this object"));
    dupes(
      data.characters,
      (c) => c.character,
      (c, i) => {
        out.error("duplicate_id", "scene", path, ["characters", i, "character"], `places ${c.character} in this scene twice.`, ["characters", i]);
      },
    );
  }
  // Rule IDs are unique within their list, so fired keys stay unique.
  if (project.game) inList("game", project.game.path, ["rules"], project.game.data.rules, "rule in this list");
  for (const { path, data } of project.scenes) {
    inList("scene", path, ["rules"], data.rules, "rule in this list");
    for (const list of ["objects", "characters", "hotspots", "regions"] as const) {
      data[list].forEach((t, i) => inList("scene", path, [list, i, "rules"], t.rules, "rule in this list"));
    }
  }
  for (const { path, data } of project.dialogues) {
    inList("dialogue", path, ["nodes"], data.nodes, "node in this dialogue");
    const options = data.nodes.flatMap((n, i) => (n.type === "choices" ? n.options.map((o, j) => ({ id: o.id, at: [i, j] as const })) : []));
    dupes(
      options,
      (o) => o.id,
      (o) => {
        const at = ["nodes", o.at[0], "options", o.at[1]];
        out.error(
          "duplicate_id",
          "dialogue",
          path,
          [...at, "id"],
          `uses the ID ${o.id}, which another choice in this dialogue already uses. IDs must be unique.`,
          at,
        );
      },
    );
  }
}

const POLYGON_MESSAGE: Record<PolygonIssue, string> = {
  too_few_points: "has fewer than 3 points.",
  self_intersecting: "crosses itself.",
  no_area: "is flat (it has no area).",
};

function checkScene(doc: Doc<SceneFile>, out: Collector) {
  const { path: file, data } = doc;
  const polygon = (poly: Polygon, at: DataPath, what: string, crumb: DataPath) => {
    const issue = polygonIssue(poly);
    if (issue) out.error("invalid_polygon", "scene", file, at, `${what} ${POLYGON_MESSAGE[issue]}`, crumb);
    return issue === null;
  };

  let outerOk = false;
  if (data.walkable.outer.length === 0) {
    out.error("no_walkable_area", "scene", file, ["walkable"], "has no walkable area. Draw where the player can walk.", []);
  } else {
    outerOk = polygon(data.walkable.outer, ["walkable", "outer"], "The walkable area's outline", ["walkable"]);
  }
  data.walkable.holes.forEach((h, i) => {
    const ok = polygon(h, ["walkable", "holes", i], "This hole", ["walkable", "holes", i]);
    // A hole must sit inside the outline, or walking around it makes no sense.
    if (ok && outerOk && !polygonWithin(h, data.walkable.outer)) {
      out.error("invalid_polygon", "scene", file, ["walkable", "holes", i], "This hole sticks out of the walkable area. Move its points inside the outline.", [
        "walkable",
        "holes",
        i,
      ]);
    }
  });
  data.objects.forEach((o, i) => {
    if (o.obstacle) polygon(o.obstacle, ["objects", i, "obstacle"], "The obstacle", ["objects", i, "obstacle"]);
  });
  data.hotspots.forEach((h, i) => polygon(h.shape, ["hotspots", i, "shape"], "The shape", ["hotspots", i]));
  data.regions.forEach((r, i) => polygon(r.shape, ["regions", i, "shape"], "The shape", ["regions", i]));

  if (outerOk) {
    for (const [id, s] of Object.entries(data.spawns)) {
      if (!inWalkable([s.x, s.y], data.walkable.outer, data.walkable.holes)) {
        out.error("spawn_outside_walkable", "scene", file, ["spawns", id], `is at (${s.x}, ${s.y}), outside the walkable area.`, ["spawns", id]);
      }
    }
  }
}

function checkDialogue(doc: Doc<DialogueFile>, out: Collector) {
  const starts = doc.data.nodes.flatMap((n, i) => (n.type === "start" ? [i] : []));
  if (starts.length === 0) {
    out.error("dialogue_without_start", "dialogue", doc.path, ["nodes"], "has no Start node, so it can never begin.", []);
  }
  for (const i of starts.slice(1)) {
    out.error("dialogue_multiple_starts", "dialogue", doc.path, ["nodes", i], "is a second Start node. A dialogue has exactly one.", ["nodes", i]);
  }
}

function checkImageFiles(project: Project, out: Collector) {
  if (!project.assets) return;
  const files = filesAfterSave(project);
  project.assets.data.images.forEach((img, i) => {
    if (!files.has(img.path)) {
      out.error("missing_image_file", "assets", project.assets!.path, ["images", i, "path"], `points to ${img.path}, which isn't in the project folder.`, [
        "images",
        i,
      ]);
    }
  });
}

/** Frames must exist in their sheet, and origins must sit inside a frame. */
function checkSprites(project: Project, out: Collector) {
  const assets = project.assets;
  if (!assets) return;
  const images = new Map(assets.data.images.map((img) => [img.id, img]));
  assets.data.images.forEach((img, i) => {
    if (!img.sheet || !img.origin) return;
    const [x, y] = img.origin;
    if (x > img.sheet.cellWidth || y > img.sheet.cellHeight) {
      out.error(
        "origin_outside_frame",
        "assets",
        assets.path,
        ["images", i, "origin"],
        `has its origin at (${x}, ${y}), outside its ${img.sheet.cellWidth}×${img.sheet.cellHeight} frames.`,
        ["images", i],
      );
    }
  });
  const frames = (fileKind: FileKind, file: string, at: DataPath, crumb: DataPath, name: string, anim: { image: string; frames: number[] }) => {
    const img = images.get(anim.image);
    if (!img) return; // reported as a missing reference
    const count = img.sheet ? img.sheet.columns * img.sheet.rows : 1;
    anim.frames.forEach((f, j) => {
      if (f < count) return;
      const has = count === 1 ? "has only 1 frame (it isn't sliced into a sheet)" : `has only ${count} frames (0 to ${count - 1})`;
      out.error("frame_out_of_range", fileKind, file, [...at, "frames", j], `${name} uses frame ${f}, but image ${img.id} ${has}.`, crumb);
    });
  };
  for (const { path, data } of project.characters) {
    for (const [slot, anim] of Object.entries(data.animations)) {
      if (anim) frames("character", path, ["animations", slot], [], `animation ${slot}`, anim);
    }
  }
  for (const { path, data } of project.scenes) {
    data.objects.forEach((o, i) => {
      if (o.animation) frames("scene", path, ["objects", i, "animation"], ["objects", i], "its looping animation", o.animation);
      o.animations?.forEach((a, j) => frames("scene", path, ["objects", i, "animations", j], ["objects", i], `animation ${a.id}`, a));
    });
  }
}

/** A flag's folder must be listed in `flags.yaml`, with its parents. Doesn't block play. */
function checkFlagFolders(project: Project, out: Collector) {
  const flags = project.flags;
  if (!flags) return;
  const folders = new Set(flags.data.folders ?? []);
  (flags.data.folders ?? []).forEach((f, i) => {
    const parent = f.split("/").slice(0, -1).join("/");
    if (parent && !folders.has(parent)) {
      out.warning("missing_folder", "flags", flags.path, ["folders", i], `lists folder ${f} without its parent folder ${parent}.`, []);
    }
  });
  flags.data.flags.forEach((flag, i) => {
    if (flag.folder !== undefined && !folders.has(flag.folder)) {
      out.warning("missing_folder", "flags", flags.path, ["flags", i, "folder"], `is in folder ${flag.folder}, which isn't in the folder list.`);
    }
  });
}

/** Errors and warnings in a loaded project. Load problems come from `loadProject`. */
export function validateProject(project: Project): Problem[] {
  const out = new Collector(project);
  checkDuplicates(project, out);
  checkReferences(project, out);
  project.scenes.forEach((s) => checkScene(s, out));
  project.dialogues.forEach((d) => checkDialogue(d, out));
  checkImageFiles(project, out);
  checkSprites(project, out);
  checkFlagFolders(project, out);
  checkLogic(project, out);
  return out.problems;
}

/** True if any problem blocks playtest/export. */
export const hasBlockingErrors = (problems: Problem[]) => problems.some((p) => p.severity === "error");

/** Slots `play_animation` can play on a character: filled ones, plus mirrored lefts. */
function playableSlots(c: CharacterFile): Set<string> {
  const slots = new Set(Object.entries(c.animations).flatMap(([slot, a]) => (a ? [slot] : [])));
  if (c.mirrorLeft) for (const s of [...slots]) if (s.endsWith("_right")) slots.add(s.replace(/_right$/, "_left"));
  return slots;
}
