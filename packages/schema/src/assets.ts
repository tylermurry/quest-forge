import { z } from "zod";
import { Id, schemaVersion } from "./common.ts";

/** Project-relative path inside `assets/` (posix separators). */
export const AssetPath = z
  .string()
  .regex(/^assets\/(?:[^/\\]+\/)*[^/\\]+$/, "must be a file inside the project's assets folder")
  .refine((p) => !p.split("/").includes(".."), "must not leave the assets folder");

/**
 * How a spritesheet is cut into frames. The editor fills in all four
 * fields whether the user slices by cell size or by rows × columns. Frames are cell
 * indices counted row by row from the top-left; cells start at the image's top-left.
 */
export const SpriteSheet = z.strictObject({
  columns: z.int().positive(),
  rows: z.int().positive(),
  cellWidth: z.int().positive(),
  cellHeight: z.int().positive(),
});
export type SpriteSheet = z.infer<typeof SpriteSheet>;

/** Sprite origin `[x, y]` in pixels from a frame's top-left. */
export const SpriteOrigin = z.tuple([z.int().min(0), z.int().min(0)]);

export const ImageAsset = z.strictObject({
  id: Id,
  path: AssetPath,
  /** Absent: the whole image is a single frame. */
  sheet: SpriteSheet.optional(),
  /** Where the feet are. Absent: bottom-center of the frame. */
  origin: SpriteOrigin.optional(),
});
export type ImageAsset = z.infer<typeof ImageAsset>;
export const AudioAsset = z.strictObject({ id: Id, path: AssetPath });

/** Font file extensions the editor imports and the `.quest` MIME table knows. */
export const FONT_EXTENSIONS = ["woff2", "woff"] as const;
/** An imported web font (WOFF2 or WOFF). Picked as the game's text font in Styling. */
export const FontAsset = z.strictObject({ id: Id, path: AssetPath });
export type FontAsset = z.infer<typeof FontAsset>;

/** `assets.yaml`: imported files are referenced by ID, never by path. */
export const AssetsFile = z.strictObject({
  schemaVersion,
  images: z.array(ImageAsset),
  audio: z.array(AudioAsset),
  /** Absent in projects with no custom font, so their `assets.yaml` is unchanged. */
  fonts: z.array(FontAsset).optional(),
});
export type AssetsFile = z.infer<typeof AssetsFile>;
