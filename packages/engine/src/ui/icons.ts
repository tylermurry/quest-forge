import type { Rect } from "../sprite.ts";

// Built-in placeholder icons, drawn with Canvas paths so projects need no UI
// art. Each draws into a square `r`, in a 16×16 design grid scaled to fit.

export type IconId = "walk" | "look" | "hand" | "talk" | "inventory" | "settings";
type Ctx = CanvasRenderingContext2D;

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
