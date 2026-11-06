import { Bitmap, type RGBA } from "../../src/model/png.ts";

// An 8×4 walk sheet of 32×48 frames (spec 05 acceptance): rows face down, left,
// right, up. Each figure has a nose on the side it faces and legs that swing,
// so mirroring and frame order are visible.

export const SHEET = { columns: 8, rows: 4, cellWidth: 32, cellHeight: 48 };
export const ROWS = { down: 0, left: 1, right: 2, up: 3 } as const;

export function walkSheet(): Uint8Array {
  const b = new Bitmap(SHEET.columns * SHEET.cellWidth, SHEET.rows * SHEET.cellHeight);
  const skin: RGBA = [240, 200, 160, 255];
  const shirt: RGBA = [60, 110, 200, 255];
  const legs: RGBA = [40, 40, 60, 255];
  const nose: RGBA = [200, 90, 80, 255];
  for (let r = 0; r < SHEET.rows; r++) {
    for (let c = 0; c < SHEET.columns; c++) {
      const x = c * SHEET.cellWidth;
      const y = r * SHEET.cellHeight;
      b.fill(x + 10, y + 4, 12, 12, skin); // head
      b.fill(x + 8, y + 16, 16, 16, shirt); // body
      const swing = [0, 2, 4, 2, 0, -2, -4, -2][c]!;
      b.fill(x + 10 + swing, y + 32, 4, 15, legs);
      b.fill(x + 18 - swing, y + 32, 4, 15, legs);
      if (r === ROWS.left) b.fill(x + 7, y + 9, 3, 3, nose);
      if (r === ROWS.right) b.fill(x + 22, y + 9, 3, 3, nose);
      if (r === ROWS.down) b.fill(x + 15, y + 10, 2, 2, nose);
    }
  }
  return b.png();
}
