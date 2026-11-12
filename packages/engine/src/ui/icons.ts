import type { IconEffect } from "@questforge/schema";
import type { Rect } from "../sprite.ts";

// Built-in placeholder icons, drawn with Canvas paths so projects need no UI
// art. Each draws into a square `r`, in a 16×16 design grid scaled to fit.
// Also the icon bar's Brighten / Darken effect, which changes only the icon's own pixels.

export type IconId = "walk" | "look" | "hand" | "talk" | "inventory" | "settings";
type Ctx = CanvasRenderingContext2D;

/** How far the effect moves each icon pixel toward white (Brighten) or black (Darken). */
export const EFFECT_AMOUNT = 0.35;

/** `#rrggbb` with the effect applied: the colour the built-in vector icons are drawn in. */
export function shadeColor(hex: string, effect: IconEffect): string {
  const to = effect === "brighten" ? 255 : 0;
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(c + (to - c) * EFFECT_AMOUNT)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

type SizedImage = CanvasImageSource & { width: number; height: number };
const shaded = new WeakMap<object, Partial<Record<IconEffect, CanvasImageSource>>>();

/**
 * A copy of `image` with the effect applied, made once per image and effect (the bar redraws every frame).
 * Drawing a translucent white or black with `source-atop` only paints where the image already has pixels, so
 * transparency is kept exactly and nothing outside the icon changes. It needs no `ctx.filter`, which Safari lacks.
 */
export function shadedImage(image: SizedImage, effect: IconEffect): CanvasImageSource {
  const made = shaded.get(image) ?? {};
  const known = made[effect];
  if (known) return known;
  const copy = document.createElement("canvas");
  copy.width = image.width;
  copy.height = image.height;
  const g = copy.getContext("2d");
  if (!g) return image;
  g.drawImage(image, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = EFFECT_AMOUNT;
  g.fillStyle = effect === "brighten" ? "#fff" : "#000";
  g.fillRect(0, 0, copy.width, copy.height);
  made[effect] = copy;
  shaded.set(image, made);
  return copy;
}

export function drawIcon(ctx: Ctx, id: IconId, r: Rect, color = "#fff") {
  const s = Math.min(r.w, r.h) / 16;
  ctx.save();
  ctx.translate(r.x + (r.w - 16 * s) / 2, r.y + (r.h - 16 * s) / 2);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  switch (id) {
    case "walk": {
      // Two footprints.
      const foot = (x: number, y: number) => {
        ctx.beginPath();
        ctx.ellipse(x, y, 1.8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y + 4.2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      };
      foot(5.5, 4);
      foot(10.5, 8);
      break;
    }
    case "look": {
      ctx.beginPath();
      ctx.moveTo(1.5, 8);
      ctx.quadraticCurveTo(8, 1.5, 14.5, 8);
      ctx.quadraticCurveTo(8, 14.5, 1.5, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(8, 8, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "hand": {
      // Palm and four fingers, thumb out.
      ctx.beginPath();
      ctx.roundRect(4, 7.5, 8, 7, 2);
      ctx.fill();
      for (const [x, top] of [[4.6, 3], [6.8, 1.8], [9, 2.2], [11.2, 3.6]] as const) {
        ctx.beginPath();
        ctx.roundRect(x - 0.9, top, 1.8, 7, 0.9);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(4.5, 11);
      ctx.lineTo(1.8, 8.2);
      ctx.stroke();
      break;
    }
    case "talk": {
      ctx.beginPath();
      ctx.ellipse(8, 7, 6.5, 4.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4.5, 10.5);
      ctx.lineTo(3, 14.5);
      ctx.lineTo(7.5, 11.6);
      ctx.fill();
      for (const x of [5.5, 8, 10.5]) {
        ctx.beginPath();
        ctx.arc(x, 7, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "inventory": {
      // A satchel.
      ctx.beginPath();
      ctx.roundRect(2, 6, 12, 8.5, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, 6);
      ctx.quadraticCurveTo(8, 0.5, 11, 6);
      ctx.stroke();
      ctx.fillRect(2, 8.5, 12, 1.5);
      break;
    }
    case "settings": {
      // A gear.
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.translate(8, 8);
        ctx.rotate(a);
        ctx.fillRect(-1.3, -7, 2.6, 3);
        ctx.restore();
      }
      // A thick ring, so the hole shows whatever is behind.
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(8, 8, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
