/** A path into a file's data, e.g. `["hotspots", 2, "rules", 1, "when", "item"]`. */
export type DataPath = (string | number)[];

/** Where a problem is. The editor maps `path` to a selection (jump-to). */
export interface Location {
  file: string;
  path: DataPath;
}

export type Severity = "error" | "warning";

export type ProblemCode =
  // Loading
  | "missing_file"
  | "yaml_syntax"
  | "invalid_data"
  | "unsupported_version"
  // Spec 14 errors
  | "missing_reference"
  | "no_walkable_area"
  | "spawn_outside_walkable"
  | "start_scene_missing"
  | "dialogue_without_start"
  | "dialogue_multiple_starts"
  | "invalid_polygon"
  | "duplicate_id"
  | "missing_image_file"
  // Sprites
  | "frame_out_of_range"
  | "origin_outside_frame"
  // Browser folders
  | "missing_folder"
  // Rule text
  | "empty_text"
  // Spec 14 warnings
  | "scene_unreachable"
  | "scene_no_background"
  | "item_never_given"
  | "flag_unused"
  | "flag_never_read"
  | "flag_never_set"
  | "dialogue_node_unreachable"
  // Dialogue graph
  | "dialogue_no_options"
  | "dialogue_dead_end"
  | "dialogue_silent_loop"
  | "hotspot_no_rules"
  | "award_total_mismatch"
  | "award_points_inconsistent";

export interface Problem {
  severity: Severity;
  code: ProblemCode;
  /** Human path to the spot, e.g. `Sunny Beach › Hotspot "door" › Rule 2`. */
  breadcrumb: string;
  /** Plain-English sentence, e.g. `uses item gold_key, which doesn't exist.` */
  message: string;
  location: Location;
}

/** `Sunny Beach › Hotspot "door" › Rule 2: uses item gold_key, which doesn't exist.` */
export const formatProblem = (p: Problem) => `${p.breadcrumb}: ${p.message}`;

export type FileKind = "game" | "flags" | "assets" | "scene" | "item" | "character" | "dialogue";

const get = (v: unknown, key: string | number): unknown =>
  typeof v === "object" && v !== null ? (v as Record<string | number, unknown>)[key] : undefined;
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);

const ROOT_LABEL: Record<FileKind, (data: unknown, file: string) => string> = {
  game: () => "Game settings",
  flags: () => "Flags",
  assets: () => "Assets",
  scene: (d, f) => str(get(d, "name")) ?? str(get(d, "id")) ?? f,
  item: (d, f) => `Item "${str(get(d, "name")) ?? str(get(d, "id")) ?? f}"`,
  character: (d, f) => `Character "${str(get(d, "name")) ?? str(get(d, "id")) ?? f}"`,
  dialogue: (d, f) => `Dialogue "${str(get(d, "name")) ?? str(get(d, "id")) ?? f}"`,
};

/** Labels for list items, keyed by the list's field name. */
const LIST_LABEL: Record<string, (item: unknown, index: number) => string> = {
  objects: (it, i) => `Object "${str(get(it, "id")) ?? i + 1}"`,
  hotspots: (it, i) => `Hotspot "${str(get(it, "id")) ?? i + 1}"`,
  regions: (it, i) => `Region "${str(get(it, "id")) ?? i + 1}"`,
  characters: (it, i) => `Character "${str(get(it, "character")) ?? i + 1}"`,
  nodes: (it, i) => `Node "${str(get(it, "id")) ?? i + 1}"`,
  options: (it, i) => `Choice "${str(get(it, "id")) ?? i + 1}"`,
  flags: (it, i) => `Flag "${str(get(it, "id")) ?? i + 1}"`,
  images: (it, i) => `Image "${str(get(it, "id")) ?? i + 1}"`,
  audio: (it, i) => `Sound "${str(get(it, "id")) ?? i + 1}"`,
  rules: (_it, i) => `Rule ${i + 1}`,
  if: (_it, i) => `Condition ${i + 1}`,
  do: (_it, i) => `Action ${i + 1}`,
  holes: (_it, i) => `Hole ${i + 1}`,
};

const FIELD_LABEL: Record<string, string> = {
  walkable: "Walkable area",
  obstacle: "Obstacle",
  depth: "Depth",
  defaultResponses: "Default responses",
};

/**
 * Builds the breadcrumb for a location. Descends through lists and labelled
 * containers; plain fields are left for the message to name.
 */
export function describePath(kind: FileKind, file: string, data: unknown, path: DataPath): string {
  const parts = [ROOT_LABEL[kind](data, file)];
  let cur = data;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]!;
    const next = get(cur, seg);
    if (typeof seg === "number") {
      const listKey = path[i - 1];
      const label = typeof listKey === "string" ? LIST_LABEL[listKey] : undefined;
      if (label) parts.push(label(next, seg));
    } else if (FIELD_LABEL[seg]) {
      parts.push(FIELD_LABEL[seg]);
    } else if (path[i - 1] === "spawns") {
      parts.push(`Spawn "${seg}"`);
    }
    cur = next;
  }
  return parts.join(" › ");
}
