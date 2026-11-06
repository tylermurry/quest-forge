import { drawSprites, type Vec } from "@questforge/engine";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Frame } from "../../model/scene/frame.ts";
import { sameThing, type ThingRef } from "../../model/scene/things.ts";
import { gridVisible, toScreen, type Transform } from "../../model/scene/view.ts";

// Scene canvas drawing (D93). The background and sprites go through the engine's
// own drawing at the zoom scale; overlays (shapes, handles, guides, grid) are drawn
// in screen pixels on top, so lines stay 1 px sharp at any zoom. The only DOM code
// besides SceneCanvas.tsx.

type Ctx = CanvasRenderingContext2D;

export const COLORS = {
  walkable: "#4ade80",
  hole: "#f87171",
  hotspot: "#22d3ee",
  region: "#fbbf24",
  obstacle: "#fb923c",
  guide: "#e879f9",
  spawn: "#f8fafc",
  selected: "#60a5fa",
  invalid: "#ef4444",
  path: "#facc15",
};

const BACKDROP = "#151517";

function checkerboard(ctx: Ctx) {
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = "#323237";
  for (let y = 0; y < SCENE_HEIGHT; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < SCENE_WIDTH; x += 32) ctx.fillRect(x, y, 16, 16);
}

/** Draws one frame of the scene editor. `dpr` is device px per CSS px. */
export function drawFrame(ctx: Ctx, f: Frame, dpr: number, size: { w: number; h: number }) {
  const { t, scene, ui } = f;
  const shown = (l: Parameters<typeof ui.hidden.includes>[0]) => !ui.hidden.includes(l);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, size.w * dpr, size.h * dpr);

  // Scene space, through the engine's drawing (D93).
  ctx.setTransform(dpr * t.scale, 0, 0, dpr * t.scale, dpr * t.x, dpr * t.y);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.clip();
  const bg = scene.background ? f.images(scene.background)?.el : undefined;
  if (bg && shown("background")) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    ctx.drawImage(bg, 0, 0);
  } else checkerboard(ctx);
  // Sprites in the engine's order; the ghost shows even with the Objects layer hidden.
  for (const s of f.sprites) {
    if (!s.ghost && !shown("objects")) continue;
    ctx.globalAlpha = s.alpha;
    drawSprites(ctx, [s.d]);
  }
  ctx.globalAlpha = 1;
  if (f.ghostBox) {
    const b = f.ghostBox;
    ctx.fillStyle = "rgba(250,204,21,0.45)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.restore();

  // Overlays in screen space.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  const scr = (p: Vec): Vec => toScreen(t, p);
  // Shape edges run through pixel centres at high zoom, so points sit on the pixel they name.
  const half = t.scale >= 2 ? t.scale / 2 : 0;
  const at = (p: Vec): Vec => {
    const [x, y] = scr(p);
    return [Math.round(x + half) + 0.5, Math.round(y + half) + 0.5];
  };
  const path = (pts: readonly Vec[], close = true) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = at(p);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    if (close) ctx.closePath();
  };
  const isSel = (ref: ThingRef) => sameThing(f.selection, ref);
  const invalid = (ref: ThingRef) => f.invalid.has(`${ref.list}:${ref.key}`);
  const shape = (pts: readonly Vec[], ref: ThingRef, color: string, fill?: string) => {
    if (pts.length === 0) return;
    path(pts);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill("evenodd");
    }
    const bad = invalid(ref);
    ctx.strokeStyle = bad ? COLORS.invalid : isSel(ref) ? COLORS.selected : color;
    ctx.lineWidth = isSel(ref) ? 2 : 1;
    if (bad) ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    if (isSel(ref)) handles(pts);
  };
  const handles = (pts: readonly Vec[]) => {
    for (const p of pts) {
      const [x, y] = at(p);
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      ctx.strokeStyle = COLORS.selected;
      ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
  };

  if (gridVisible(t)) drawGrid(ctx, t, size);

  // Bottom of the stack first, so higher layers draw on top (D15).
  if (shown("objects")) {
    scene.objects.forEach((o) => {
      if (o.obstacle) shape(o.obstacle, { list: "objects", key: o.id }, COLORS.obstacle, "rgba(251,146,60,0.18)");
    });
    for (const s of f.sprites) {
      const ref = { list: s.d.kind === "object" ? "objects" : "characters", key: s.d.id } as const;
      if (!isSel(ref)) continue;
      const [x0, y0] = scr([s.d.dest.x, s.d.dest.y]);
      const [x1, y1] = scr([s.d.dest.x + s.d.dest.w, s.d.dest.y + s.d.dest.h]);
      ctx.strokeStyle = COLORS.selected;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
      ctx.setLineDash([]);
      // Baseline handle (spec 09): a line across the sprite with a grab knob.
      const by = Math.round(scr([0, s.d.baseline])[1]) + 0.5;
      ctx.strokeStyle = COLORS.guide;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x0) - 6, by);
      ctx.lineTo(Math.round(x1) + 6, by);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = COLORS.guide;
      ctx.fillRect(Math.round(x1) + 4, by - 5, 10, 10);
      ctx.font = "11px system-ui, sans-serif";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";
      ctx.fillText(`baseline ${Math.round(s.d.baseline)}`, Math.round(x1) + 16, by + 5);
    }
  }
  if (shown("walkable")) {
    const { outer, holes } = scene.walkable;
    if (outer.length && ui.aids.shading) {
      ctx.beginPath();
      for (const poly of [outer, ...holes]) {
        poly.forEach((p, i) => {
          const [x, y] = at(p);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = "rgba(74,222,128,0.16)";
      ctx.fill("evenodd");
    }
    shape(outer, { list: "walkable", key: "outer" }, COLORS.walkable);
    holes.forEach((h, i) => shape(h, { list: "walkable", key: `hole:${i}` }, COLORS.hole, "rgba(248,113,113,0.12)"));
  }
  if (shown("hotspots")) {
    for (const h of scene.hotspots) {
      const ref = { list: "hotspots", key: h.id } as const;
      shape(h.shape, ref, COLORS.hotspot, "rgba(34,211,238,0.10)");
      label(ctx, at, h.shape, h.name, invalid(ref) ? COLORS.invalid : COLORS.hotspot);
      if (h.walkTo && (isSel(ref) || f.ui.tool === "walkto")) marker(ctx, at([h.walkTo.x, h.walkTo.y]), h.walkTo.facing, COLORS.hotspot, "walk to");
    }
  }
  if (shown("regions")) {
    for (const r of scene.regions) {
      const ref = { list: "regions", key: r.id } as const;
      shape(r.shape, ref, COLORS.region, "rgba(251,191,36,0.12)");
      label(ctx, at, r.shape, r.id, invalid(ref) ? COLORS.invalid : COLORS.region);
    }
  }
  if (shown("guides")) {
    ctx.font = "11px system-ui, sans-serif";
    for (const key of ["far", "near"] as const) {
      const line = scene.depth[key];
      const sel = isSel({ list: "depth", key });
      const y = at([0, line.y])[1];
      const [x0] = scr([0, 0]);
      const [x1] = scr([SCENE_WIDTH, 0]);
      ctx.strokeStyle = sel ? COLORS.selected : COLORS.guide;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = sel ? COLORS.selected : COLORS.guide;
      ctx.fillRect(x0 - 12, y - 6, 12, 12);
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${key} y ${line.y} ×${line.scale}`, x0 + 4, y - 3);
    }
    for (const [id, s] of Object.entries(scene.spawns)) {
      const ref = { list: "spawns", key: id } as const;
      marker(ctx, at([s.x, s.y]), s.facing, invalid(ref) ? COLORS.invalid : isSel(ref) ? COLORS.selected : COLORS.spawn, id);
    }
  }

  // Live aids (spec 09).
  if (f.path && f.path.length > 1) {
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 3]);
    path(f.path, false);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  // A shape being drawn: points so far, the rubber band to the cursor and the closing edge.
  if (f.drawing) {
    const { points, cursor, closeInvalid } = f.drawing;
    const pts = cursor ? [...points, cursor] : points;
    if (pts.length > 1) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      path(pts, false);
      ctx.stroke();
      if (pts.length > 2) {
        ctx.strokeStyle = closeInvalid ? COLORS.invalid : "rgba(96,165,250,0.6)";
        ctx.setLineDash([4, 4]);
        path([pts[pts.length - 1]!, pts[0]!], false);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 1;
    }
    handles(points);
  }
  if (f.snap) {
    const [x, y] = at(f.snap);
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  if (f.crosshair) {
    const [x, y] = scr(f.crosshair);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, y - 6);
    ctx.lineTo(Math.round(x) + 0.5, y + 6);
    ctx.moveTo(x - 6, Math.round(y) + 0.5);
    ctx.lineTo(x + 6, Math.round(y) + 0.5);
    ctx.stroke();
  }
}

function drawGrid(ctx: Ctx, t: Transform, size: { w: number; h: number }) {
  const x0 = Math.max(0, Math.floor(-t.x / t.scale));
  const x1 = Math.min(SCENE_WIDTH, Math.ceil((size.w - t.x) / t.scale));
  const y0 = Math.max(0, Math.floor(-t.y / t.scale));
  const y1 = Math.min(SCENE_HEIGHT, Math.ceil((size.h - t.y) / t.scale));
  // Dark lines with a faint light edge read on both light and dark art.
  const lines = (dx: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const sx = Math.round(t.x + x * t.scale) + 0.5 + dx;
      ctx.moveTo(sx, t.y + y0 * t.scale);
      ctx.lineTo(sx, t.y + y1 * t.scale);
    }
    for (let y = y0; y <= y1; y++) {
      const sy = Math.round(t.y + y * t.scale) + 0.5 + dx;
      ctx.moveTo(t.x + x0 * t.scale, sy);
      ctx.lineTo(t.x + x1 * t.scale, sy);
    }
    ctx.stroke();
  };
  lines(0, "rgba(0,0,0,0.28)");
  lines(1, "rgba(255,255,255,0.10)");
}

function label(ctx: Ctx, at: (p: Vec) => Vec, pts: readonly Vec[], text: string, color: string) {
  if (pts.length === 0) return;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const [x, y] = at([cx, cy]);
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - w / 2, y - 8, w, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A standing point with a facing arrow (spawns, walk-to points). */
function marker(ctx: Ctx, [x, y]: Vec, facing: string, color: string, text: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();
  const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[facing as "down"] ?? [0, 1];
  ctx.beginPath();
  ctx.moveTo(x + d[0]! * 5, y + d[1]! * 5);
  ctx.lineTo(x + d[0]! * 13, y + d[1]! * 13);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 9, y - 9);
}
