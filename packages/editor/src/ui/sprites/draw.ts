import { drawSprites, frameRect, spriteRect, type LoadedImage, type Vec } from "@questforge/engine";
import { effectiveOrigin, frameSizeOf } from "../../model/sprites.ts";

// Canvas drawing for the image tab and animation previews. Pixel art is
// drawn at the zoom with smoothing off; overlays are drawn in CSS px on top. Layout
// and hit-testing live in model/sprites.ts.

type Ctx = CanvasRenderingContext2D;

const SPRITE_COLORS = { grid: "rgba(96, 165, 250, 0.7)", selected: "#60a5fa", origin: "#f43f5e", label: "rgba(248, 250, 252, 0.85)" };

/** Sizes a canvas for `w` × `h` CSS px at the device pixel ratio; returns a context in CSS px. */
export function prepare(canvas: HTMLCanvasElement, w: number, h: number): Ctx | null {
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.round(w * dpr));
  const ch = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  checker(ctx, w, h);
  return ctx;
}

function checker(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#323237";
  for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < w; x += 16) ctx.fillRect(x, y, 8, 8);
}

/** The whole image at `zoom` with its sheet grid, frame numbers and `selected` cells outlined. */
export function drawSheet(ctx: Ctx, image: LoadedImage, zoom: number, selected: readonly number[] = []) {
  const { asset, size, el } = image;
  if (el) ctx.drawImage(el, 0, 0, size.w * zoom, size.h * zoom);
  const sheet = asset.sheet;
  if (!sheet) return;
  ctx.lineWidth = 1;
  ctx.strokeStyle = SPRITE_COLORS.grid;
  ctx.beginPath();
  for (let c = 0; c <= sheet.columns; c++) {
    const x = Math.round(c * sheet.cellWidth * zoom) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, sheet.rows * sheet.cellHeight * zoom);
  }
  for (let r = 0; r <= sheet.rows; r++) {
    const y = Math.round(r * sheet.cellHeight * zoom) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(sheet.columns * sheet.cellWidth * zoom, y);
  }
  ctx.stroke();
  const cellW = sheet.cellWidth * zoom;
  if (cellW >= 18) {
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.fillStyle = SPRITE_COLORS.label;
    for (let i = 0; i < sheet.columns * sheet.rows; i++) {
      const r = frameRect(asset, size, i);
      ctx.fillText(String(i), r.x * zoom + 3, r.y * zoom + 11);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = SPRITE_COLORS.selected;
  for (const i of selected) {
    const r = frameRect(asset, size, i);
    ctx.strokeRect(r.x * zoom + 1, r.y * zoom + 1, r.w * zoom - 2, r.h * zoom - 2);
  }
}

/**
 * One frame with its origin on `feet` (CSS px), at `zoom`, mirrored around the origin
 * when asked — exactly as the engine places it (spriteRect). Marks the feet.
 */
export function drawSpriteFrame(ctx: Ctx, image: LoadedImage, frame: number, zoom: number, feet: Vec, mirror = false) {
  const { asset, size } = image;
  const src = frameRect(asset, size, frame);
  const dest = spriteRect(feet, effectiveOrigin(asset, size), frameSizeOf(asset, size), zoom, mirror);
  drawSprites(ctx, [{ kind: "character", id: asset.id, image, src, dest, mirror, baseline: feet[1] }]);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(dest.x) + 0.5, Math.round(dest.y) + 0.5, Math.round(dest.w) - 1, Math.round(dest.h) - 1);
  crosshair(ctx, feet);
}

function crosshair(ctx: Ctx, [x, y]: Vec) {
  ctx.strokeStyle = SPRITE_COLORS.origin;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) - 7, Math.round(y) + 0.5);
  ctx.lineTo(Math.round(x) + 8, Math.round(y) + 0.5);
  ctx.moveTo(Math.round(x) + 0.5, Math.round(y) - 7);
  ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + 8);
  ctx.stroke();
}
