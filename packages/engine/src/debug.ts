import { SCENE_WIDTH } from "@questforge/schema";
import type { Vec } from "./vec.ts";
import type { World } from "./world.ts";

// Playtest debug layers: what each toggle draws over the running
// game, as plain shapes so it is tested without a canvas. `render.ts` draws them.

export interface DebugFlags {
  /** Walkable outline, holes, visible obstacles and the nav graph's nodes. */
  walkable: boolean;
  hotspots: boolean;
  /** Walk-into regions. */
  regions: boolean;
  /** Each sprite's baseline and the far/near depth lines. */
  baselines: boolean;
  /** The player's last path (kept after arriving) and the feet readout. */
  path: boolean;
}

export const DEBUG_OFF: DebugFlags = { walkable: false, hotspots: false, regions: false, baselines: false, path: false };
export const DEBUG_ALL: DebugFlags = { walkable: true, hotspots: true, regions: true, baselines: true, path: true };

export type DebugShape =
  | { kind: "poly"; layer: keyof DebugFlags; points: readonly Vec[]; stroke: string; fill?: string; label?: string }
  | { kind: "line"; layer: keyof DebugFlags; points: readonly Vec[]; stroke: string; dashed?: boolean }
  | { kind: "dots"; layer: keyof DebugFlags; points: readonly Vec[]; color: string }
  | { kind: "text"; layer: keyof DebugFlags; at: Vec; text: string; color: string; align: "left" | "right" };

/** The shapes the turned-on layers draw for the world as it is now, back to front. */
export function debugShapes(world: World, flags: DebugFlags): DebugShape[] {
  const out: DebugShape[] = [];
  const { scene } = world;
  if (flags.walkable) {
    out.push({ kind: "poly", layer: "walkable", points: scene.walkable.outer, stroke: "#0f0", fill: "rgba(0,255,0,0.08)" });
    for (const h of scene.walkable.holes) out.push({ kind: "poly", layer: "walkable", points: h, stroke: "#f00", fill: "rgba(255,0,0,0.2)" });
    for (const o of scene.objects) {
      if (o.obstacle && world.isObjectVisible(o.id))
        out.push({ kind: "poly", layer: "walkable", points: o.obstacle, stroke: "#f80", fill: "rgba(255,128,0,0.25)" });
    }
    out.push({ kind: "dots", layer: "walkable", points: world.nav.nodes, color: "#0f0" });
  }
  if (flags.regions) {
    for (const r of scene.regions) out.push({ kind: "poly", layer: "regions", points: r.shape, stroke: "#c6f", fill: "rgba(200,100,255,0.15)", label: r.id });
  }
  if (flags.hotspots) {
    for (const h of scene.hotspots)
      out.push({ kind: "poly", layer: "hotspots", points: h.shape, stroke: "#0ff", fill: "rgba(0,255,255,0.08)", label: h.name ?? h.id });
  }
  if (flags.baselines) {
    for (const [label, line] of [
      ["far", scene.depth.far],
      ["near", scene.depth.near],
    ] as const) {
      out.push({
        kind: "line",
        layer: "baselines",
        points: [
          [0, line.y],
          [SCENE_WIDTH, line.y],
        ],
        stroke: "#f0f",
        dashed: true,
      });
      out.push({ kind: "text", layer: "baselines", at: [4, line.y - 1], text: `${label} ×${line.scale}`, color: "#f0f", align: "left" });
    }
    for (const d of world.drawList()) {
      const y = Math.round(d.baseline);
      out.push({
        kind: "line",
        layer: "baselines",
        points: [
          [d.dest.x, y],
          [d.dest.x + d.dest.w, y],
        ],
        stroke: d.kind === "character" ? "#ff0" : "#fff",
      });
    }
  }
  if (flags.path) {
    if (world.lastPath.length > 1) out.push({ kind: "line", layer: "path", points: world.lastPath, stroke: "rgba(255,255,0,0.45)", dashed: true });
    const route = [world.player.pos, ...world.route];
    if (route.length > 1) out.push({ kind: "line", layer: "path", points: route, stroke: "#ff0" });
    const feet = world.player.pos.map(Math.round).join(", ");
    out.push({
      kind: "text",
      layer: "path",
      at: [SCENE_WIDTH - 4, 6],
      text: `scale ${world.playerScale.toFixed(2)}  feet (${feet})`,
      color: "#ff0",
      align: "right",
    });
  }
  return out;
}
