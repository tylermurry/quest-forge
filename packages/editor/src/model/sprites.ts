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
 * would fall outside the new frame is cleared (D115).
 */
export function sliceImage(p: Project, id: string, size: Size, sheet: SpriteSheet | null): Project {
  return updateImage(p, id, (img) => {
    const frame = sheet ? { w: sheet.cellWidth, h: sheet.cellHeight } : size;
    const origin = img.origin && inFrame(img.origin, frame) ? img.origin : undefined;
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
