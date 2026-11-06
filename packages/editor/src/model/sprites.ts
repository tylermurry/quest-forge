// Spritesheet slicing and sprite origins (spec 05, D66, D114, D115). Pure commands
// from one Project to the next; the image tab calls them through `editor.apply`.
import type { AssetsFile, ImageAsset, Project, SpriteSheet } from "@questforge/schema";
import { CommandError } from "./commands.ts";

export interface Size {
  w: number;
  h: number;
}

/** How the image tab slices: one frame, a rows × columns grid, or a cell size. */
export type SliceMode = "single" | "grid" | "cells";

const positiveInt = (n: number, what: string) => {
  if (!Number.isInteger(n) || n < 1) throw new CommandError(`${what} must be a whole number of at least 1.`);
};

/**
 * A sheet of `columns` × `rows` cells covering the image. Cells are the image size
 * divided and rounded down; leftover pixels on the right and bottom are ignored (D115).
 */
export function sheetFromGrid(size: Size, columns: number, rows: number): SpriteSheet {
  positiveInt(columns, "Columns");
  positiveInt(rows, "Rows");
  const cellWidth = Math.floor(size.w / columns);
  const cellHeight = Math.floor(size.h / rows);
  if (cellWidth < 1 || cellHeight < 1) throw new CommandError(`The image is ${size.w}×${size.h} pixels, too small for ${columns} × ${rows} frames.`);
  return { columns, rows, cellWidth, cellHeight };
}

/** As many `cellWidth` × `cellHeight` cells as fit in the image, from its top-left (D66, D115). */
export function sheetFromCells(size: Size, cellWidth: number, cellHeight: number): SpriteSheet {
  positiveInt(cellWidth, "Frame width");
  positiveInt(cellHeight, "Frame height");
  if (cellWidth > size.w || cellHeight > size.h) throw new CommandError(`A ${cellWidth}×${cellHeight} frame doesn't fit in the ${size.w}×${size.h} image.`);
  return { columns: Math.floor(size.w / cellWidth), rows: Math.floor(size.h / cellHeight), cellWidth, cellHeight };
}

/** The slicing mode an image shows in the tab: "grid" for any sliced image, since both fill the same fields. */
export const sliceModeOf = (img: ImageAsset): SliceMode => (img.sheet ? "grid" : "single");

/** Size of one frame: a sheet cell, or the whole image when unsliced. */
export const frameSizeOf = (img: ImageAsset, size: Size): Size => (img.sheet ? { w: img.sheet.cellWidth, h: img.sheet.cellHeight } : size);

/** How many frames an image has (an unsliced image has the single frame 0). */
export const frameCountOf = (img: ImageAsset): number => (img.sheet ? img.sheet.columns * img.sheet.rows : 1);

/** The origin actually used: the stored one, else bottom-centre of the frame (spec 05). */
export const effectiveOrigin = (img: ImageAsset, size: Size): [number, number] => {
  const f = frameSizeOf(img, size);
  return img.origin ? [img.origin[0], img.origin[1]] : [f.w / 2, f.h];
};

const inFrame = (o: readonly [number, number], f: Size) => o[0] <= f.w && o[1] <= f.h;

function updateImage(p: Project, id: string, f: (img: ImageAsset) => ImageAsset): Project {
  const assets = p.assets;
  const img = assets?.data.images.find((i) => i.id === id);
  if (!assets || !img) throw new CommandError(`There's no image with ID ${id}.`);
  const data: AssetsFile = { ...assets.data, images: assets.data.images.map((i) => (i === img ? f(i) : i)) };
  return { ...p, assets: { ...assets, data } };
}

/** Writes the image entry's keys in schema order with optional ones omitted (D54). */
const imageEntry = (img: ImageAsset, sheet: SpriteSheet | undefined, origin: ImageAsset["origin"]): ImageAsset => ({
  id: img.id,
  path: img.path,
  ...(sheet && { sheet }),
  ...(origin && { origin }),
});

/**
 * Slices an image into a sheet, or makes it one frame again (`null`). An origin that
 * would fall outside the new frame is cleared (D115). `keep` is the origin to keep if
 * it fits (default: the current one), so typing "1" on the way to "16" doesn't lose it.
 */
export function sliceImage(p: Project, id: string, size: Size, sheet: SpriteSheet | null, keep?: ImageAsset["origin"] | null): Project {
  return updateImage(p, id, (img) => {
    const frame = sheet ? { w: sheet.cellWidth, h: sheet.cellHeight } : size;
    const wanted = keep === undefined ? img.origin : (keep ?? undefined);
    const origin = wanted && inFrame(wanted, frame) ? wanted : undefined;
    return imageEntry(img, sheet ?? undefined, origin);
  });
}

/** Sets where the feet are in each frame, or back to bottom-centre (`null`). */
export function setOrigin(p: Project, id: string, size: Size, origin: [number, number] | null): Project {
  return updateImage(p, id, (img) => {
    if (origin) {
      const f = frameSizeOf(img, size);
      if (!origin.every((n) => Number.isInteger(n) && n >= 0) || !inFrame(origin, f)) {
        throw new CommandError(`The origin must be inside the ${f.w}×${f.h} frame.`);
      }
    }
    return imageEntry(img, img.sheet, origin ?? undefined);
  });
}

/**
 * The origin for a click in the frame preview: `local` is in frame pixels (fractional),
 * rounded to the nearest pixel corner and kept inside the frame.
 */
export function originAt(local: readonly [number, number], frame: Size): [number, number] {
  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n)));
  return [clamp(local[0], frame.w), clamp(local[1], frame.h)];
}

/** The sheet cell under a point in image pixels, or null outside every cell. */
export function cellAt(img: ImageAsset, size: Size, local: readonly [number, number]): number | null {
  const [x, y] = local;
  if (x < 0 || y < 0) return null;
  if (!img.sheet) return x < size.w && y < size.h ? 0 : null;
  const { columns, rows, cellWidth, cellHeight } = img.sheet;
  const col = Math.floor(x / cellWidth);
  const row = Math.floor(y / cellHeight);
  return col < columns && row < rows ? row * columns + col : null;
}

/**
 * The zoom that fits `content` in `box`: a whole multiple from 1× up to `max` so
 * pixels stay square, or the fraction that fits when it's bigger than the box.
 */
export function fitZoom(content: Size, box: Size, max = 8): number {
  const fit = Math.min(box.w / content.w, box.h / content.h);
  return fit < 1 ? fit : Math.min(max, Math.floor(fit));
}

/**
 * Frames typed as text, e.g. "0-3, 6" or "3-0" (a run backwards). Null if it isn't
 * a list of whole frame numbers below `count`.
 */
export function parseFrames(text: string, count: number): number[] | null {
  const out: number[] = [];
  for (const part of text.split(",").map((s) => s.trim())) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a >= count || b >= count) return null;
    const step = b >= a ? 1 : -1;
    for (let f = a; f !== b + step; f += step) out.push(f);
  }
  return out.length ? out : null;
}

/** Frames as text, with runs of three or more shortened: [0, 1, 2, 3, 6] → "0-3, 6". */
export function formatFrames(frames: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < frames.length; ) {
    let j = i;
    const step = frames[i + 1] !== undefined && Math.abs(frames[i + 1]! - frames[i]!) === 1 ? frames[i + 1]! - frames[i]! : 0;
    while (step && frames[j + 1] === frames[j]! + step) j++;
    parts.push(j - i >= 2 ? `${frames[i]}-${frames[j]}` : String(frames[i]));
    if (j - i === 1) parts.push(String(frames[j]));
    i = j + 1;
  }
  return parts.join(", ");
}
