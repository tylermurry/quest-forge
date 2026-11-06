import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { Viewport } from "./viewport.ts";
import type { World } from "./world.ts";

// Canvas 2D drawing (spec 03, D30). Everything draws into the 640×400 back buffer,
// which is then blitted to the screen with nearest-neighbor scaling (D31).

export type Ctx = CanvasRenderingContext2D;

const FONT = "10px monospace";
const LINE = 12;

export interface DebugFlags {
  /** Walkable outline, holes, obstacles, graph nodes, route, baselines, depth lines. */
  overlay: boolean;
}

/** Draws one frame of the world into the back buffer, in spec 03 order. */
export function drawWorld(ctx: Ctx, world: World, background: CanvasImageSource | undefined, debug: DebugFlags) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  if (background) ctx.drawImage(background, 0, 0);

  for (const d of world.drawList()) {
    const el = d.image.el;
    if (!el) continue;
    const { src, dest } = d;
    if (d.mirror) {
      ctx.save();
      ctx.translate(dest.x + dest.w, dest.y);
      ctx.scale(-1, 1);
      ctx.drawImage(el, src.x, src.y, src.w, src.h, 0, 0, dest.w, dest.h);
      ctx.restore();
    } else {
      ctx.drawImage(el, src.x, src.y, src.w, src.h, dest.x, dest.y, dest.w, dest.h);
    }
  }

  if (world.text) drawTextBox(ctx, world.text);
  drawVerb(ctx, world.verb);
  if (debug.overlay) drawDebug(ctx, world);
}

export function drawLoading(ctx: Ctx, progress: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  ctx.fillStyle = "#fff";
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Loading…", SCENE_WIDTH / 2, SCENE_HEIGHT / 2 - 10);
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(220.5, 205.5, 200, 8);
  ctx.fillRect(222, 207, Math.round(197 * progress), 5);
}

/** Copies the back buffer to the screen canvas, letterboxed (spec 03). */
export function present(screen: Ctx, back: CanvasImageSource, v: Viewport) {
  screen.imageSmoothingEnabled = false;
  screen.fillStyle = "#000";
  screen.fillRect(0, 0, v.width, v.height);
  screen.drawImage(back, v.offsetX, v.offsetY, SCENE_WIDTH * v.scale, SCENE_HEIGHT * v.scale);
}

/** Word-wraps to a pixel width using the context's current font. */
export function wrap(ctx: Pick<Ctx, "measureText">, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** M1 look text (D67): a plain centered Sierra-style box. */
function drawTextBox(ctx: Ctx, paragraphs: string[]) {
  ctx.font = FONT;
  const lines = paragraphs.flatMap((p, i) => (i === 0 ? wrap(ctx, p, 360) : ["", ...wrap(ctx, p, 360)]));
  const w = Math.min(380, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24);
  const h = lines.length * LINE + 20;
  const x = Math.round((SCENE_WIDTH - w) / 2);
  const y = Math.round((SCENE_HEIGHT - h) / 2) - 40;
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#a00";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, SCENE_WIDTH / 2, y + 10 + i * LINE));
}

function drawVerb(ctx: Ctx, verb: string) {
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const label = verb === "walk" ? "Walk" : "Look";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(4, 4, ctx.measureText(label).width + 8, 14);
  ctx.fillStyle = "#ff0";
  ctx.fillText(label, 8, 6);
}

function drawDebug(ctx: Ctx, world: World) {
  const poly = (pts: readonly (readonly [number, number])[], stroke: string, fill?: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  const { scene } = world;
  ctx.lineWidth = 1;
  poly(scene.walkable.outer, "#0f0", "rgba(0,255,0,0.08)");
  scene.walkable.holes.forEach((h) => poly(h, "#f00", "rgba(255,0,0,0.2)"));
  for (const o of scene.objects) {
    if (o.obstacle && world.isObjectVisible(o.id)) poly(o.obstacle, "#f80", "rgba(255,128,0,0.25)");
  }
  scene.hotspots.forEach((h) => poly(h.shape, "#0ff"));

  // Depth lines.
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  for (const [label, line] of [["far", scene.depth.far], ["near", scene.depth.near]] as const) {
    ctx.strokeStyle = "#f0f";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, line.y + 0.5);
    ctx.lineTo(SCENE_WIDTH, line.y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f0f";
    ctx.fillText(`${label} ×${line.scale}`, 4, line.y - 1);
  }

  // Baselines.
  for (const d of world.drawList()) {
    ctx.strokeStyle = d.kind === "character" ? "#ff0" : "#fff";
    ctx.beginPath();
    ctx.moveTo(d.dest.x, Math.round(d.baseline) + 0.5);
    ctx.lineTo(d.dest.x + d.dest.w, Math.round(d.baseline) + 0.5);
    ctx.stroke();
  }

  // Graph nodes and the current route.
  ctx.fillStyle = "#0f0";
  for (const [x, y] of world.nav.nodes) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  const route = [world.player.pos, ...world.route];
  if (route.length > 1) {
    ctx.strokeStyle = "#ff0";
    ctx.beginPath();
    route.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.fillStyle = "#ff0";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`scale ${world.playerScale.toFixed(2)}  feet (${world.player.pos.map(Math.round).join(", ")})`, SCENE_WIDTH - 4, 6);
}
