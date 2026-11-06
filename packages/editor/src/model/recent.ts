// Recent projects on the start screen (spec 08, D87).

export interface RecentProject {
  /** Folder path (absolute in the app, sandbox-relative on the dev page). */
  root: string;
  title: string;
  openedAt: number;
}

export const MAX_RECENT = 10;

/** Puts a project at the top of the list (once), keeping at most 10. */
export function addRecent(list: RecentProject[], entry: RecentProject): RecentProject[] {
  return [entry, ...list.filter((r) => r.root !== entry.root)].slice(0, MAX_RECENT);
}

export const removeRecent = (list: RecentProject[], root: string) => list.filter((r) => r.root !== root);

/** Reads a stored list defensively (it may be missing or from an older version). */
export function parseRecent(raw: unknown): RecentProject[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is RecentProject =>
        typeof r === "object" && r !== null && typeof r.root === "string" && typeof r.title === "string" && typeof r.openedAt === "number",
    )
    .slice(0, MAX_RECENT);
}
