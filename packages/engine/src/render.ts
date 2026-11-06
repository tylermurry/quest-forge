import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { PlayerUi } from "./ui/controller.ts";
import { drawUi, type IconImage } from "./ui/draw.ts";
import { TEXT_FONT, TEXT_LINE, layoutTextBox, type TextBox } from "./ui/textbox.ts";
import type { Viewport } from "./viewport.ts";
import type { Drawable } from "./drawables.ts";
import type { World } from "./world.ts";

// Canvas 2D drawing (spec 03, D30). Everything draws into the 640×400 back buffer,
// which is then blitted to the screen with nearest-neighbor scaling (D31).

export type Ctx = CanvasRenderingContext2D;

const FONT = TEXT_FONT;

export interface DebugFlags {
  /** Walkable outline, holes, obstacles, graph nodes, route, baselines, depth lines. */
  overlay: boolean;
}

/** Draws one frame of play into the back buffer, in spec 03 order. */
export function drawSession(ctx: Ctx, ui: PlayerUi, icons: IconImage, background: CanvasImageSource | undefined, debug: DebugFlags) {
  const session = ui.session;
  const world = session.world;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  if (background) ctx.drawImage(background, 0, 0);
  drawSprites(ctx, world.drawList());

  if (debug.overlay) drawDebug(ctx, world);
  drawUi(ctx, ui, icons, () => session.text && drawTextBox(ctx, session.text));
}

/** Blits sprites in the order given (back to front), mirroring flipped ones (D39). Shared with the editor (D93). */
export function drawSprites(ctx: Ctx, list: readonly Drawable[]) {
  for (const d of list) {
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

/** A `narrate` or `say` box (spec 06, D78). */
function drawTextBox(ctx: Ctx, box: TextBox) {
  ctx.font = FONT;
  const l = layoutTextBox(box, (t) => ctx.measureText(t).width);
  ctx.lineWidth = 1;
  ctx.textBaseline = "top";
  if (box.kind === "narrate") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.strokeStyle = "#a00";
    ctx.strokeRect(l.x + 2.5, l.y + 2.5, l.w - 5, l.h - 5);
    ctx.strokeRect(l.x + 4.5, l.y + 4.5, l.w - 9, l.h - 9);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    l.lines.forEach((line, i) => ctx.fillText(line, l.x + l.w / 2, l.textY + i * TEXT_LINE));
    return;
  }
  const color = box.speaker?.color ?? "#fff";
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fillRect(l.x, l.y, l.w, l.h);
  ctx.strokeStyle = color;
  ctx.strokeRect(l.x + 1.5, l.y + 1.5, l.w - 3, l.h - 3);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  if (l.name) {
    ctx.font = `bold ${FONT}`;
    ctx.fillText(l.name, l.x + l.w / 2, l.textY - TEXT_LINE);
    ctx.font = FONT;
  }
  l.lines.forEach((line, i) => ctx.fillText(line, l.x + l.w / 2, l.textY + i * TEXT_LINE));
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
