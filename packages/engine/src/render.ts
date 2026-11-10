import { SCENE_HEIGHT, SCENE_WIDTH } from "@questforge/schema";
import type { PlayerUi } from "./ui/controller.ts";
import { drawUi, type IconImage } from "./ui/draw.ts";
import { TEXT_FONT, TEXT_LINE, layoutTextBox, type TextBox } from "./ui/textbox.ts";
import type { Viewport } from "./viewport.ts";
import type { Drawable } from "./drawables.ts";
import { debugShapes, type DebugFlags, type DebugShape } from "./debug.ts";

// Canvas 2D drawing. Everything draws into the 640×400 back buffer,
// which is then blitted to the screen with nearest-neighbor scaling.

export type Ctx = CanvasRenderingContext2D;

const FONT = TEXT_FONT;

/** Draws one frame of play into the back buffer in layer order. */
export function drawSession(ctx: Ctx, ui: PlayerUi, icons: IconImage, background: CanvasImageSource | undefined, debug: DebugFlags) {
  const session = ui.session;
  const world = session.world;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  if (background) ctx.drawImage(background, 0, 0);
  drawSprites(ctx, world.drawList());

  const shapes = debugShapes(world, debug);
  if (shapes.length) drawDebug(ctx, shapes);
  drawUi(ctx, ui, icons, () => session.text && drawTextBox(ctx, session.text));
}

/** Blits sprites in the order given (back to front), mirroring flipped ones. Shared with the editor. */
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

/** Copies the back buffer to the screen canvas, letterboxed. */
export function present(screen: Ctx, back: CanvasImageSource, v: Viewport) {
  screen.imageSmoothingEnabled = false;
  screen.fillStyle = "#000";
  screen.fillRect(0, 0, v.width, v.height);
  screen.drawImage(back, v.offsetX, v.offsetY, SCENE_WIDTH * v.scale, SCENE_HEIGHT * v.scale);
}

/** A `narrate` or `say` box. */
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
    l.lines.forEach((line, i) => {
      ctx.fillText(line, l.x + l.w / 2, l.textY + i * TEXT_LINE);
    });
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
  l.lines.forEach((line, i) => {
    ctx.fillText(line, l.x + l.w / 2, l.textY + i * TEXT_LINE);
  });
}

function drawDebug(ctx: Ctx, shapes: readonly DebugShape[]) {
  ctx.lineWidth = 1;
  ctx.font = FONT;
  for (const sh of shapes) {
    switch (sh.kind) {
      case "poly": {
        ctx.beginPath();
        sh.points.forEach(([x, y], i) => {
          if (i) ctx.lineTo(x + 0.5, y + 0.5);
          else ctx.moveTo(x + 0.5, y + 0.5);
        });
        ctx.closePath();
        if (sh.fill) {
          ctx.fillStyle = sh.fill;
          ctx.fill();
        }
        ctx.strokeStyle = sh.stroke;
        ctx.stroke();
        if (sh.label && sh.points[0]) {
          ctx.fillStyle = sh.stroke;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(sh.label, sh.points[0][0] + 2, sh.points[0][1] + 2);
        }
        break;
      }
      case "line":
        ctx.strokeStyle = sh.stroke;
        ctx.setLineDash(sh.dashed ? [4, 4] : []);
        ctx.beginPath();
        sh.points.forEach(([x, y], i) => {
          if (i) ctx.lineTo(x + 0.5, y + 0.5);
          else ctx.moveTo(x + 0.5, y + 0.5);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      case "dots":
        ctx.fillStyle = sh.color;
        for (const [x, y] of sh.points) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        break;
      case "text":
        ctx.fillStyle = sh.color;
        ctx.textAlign = sh.align;
        ctx.textBaseline = sh.align === "left" ? "bottom" : "top";
        ctx.fillText(sh.text, sh.at[0], sh.at[1]);
        break;
    }
  }
}
