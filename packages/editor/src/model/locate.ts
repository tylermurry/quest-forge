// Jump-to (spec 14, D89): which browser entry a problem's location points at.
import { ASSET_LAYOUT, allDocs, type AssetKind, type Location, type Project } from "@questforge/schema";
import type { EntryRef } from "./workspace.ts";

export function locate(project: Project, location: Location): EntryRef | null {
  const { file, path } = location;
  if (file === project.flags?.path && path[0] === "flags" && typeof path[1] === "number") {
    const flag = project.flags.data.flags[path[1]];
    return flag ? { section: "flag", id: flag.id } : null;
  }
  if (file === project.assets?.path && (path[0] === "images" || path[0] === "audio") && typeof path[1] === "number") {
    const list = path[0] === "images" ? project.assets.data.images : project.assets.data.audio;
    const a = list[path[1]];
    return a ? { section: path[0] === "images" ? "image" : "audio", id: a.id } : null;
  }
  for (const { kind, doc } of allDocs(project)) {
    if (doc.path !== file || !(kind in ASSET_LAYOUT)) continue;
    return { section: kind as AssetKind, id: (doc.data as { id: string }).id };
  }
  return null;
}
