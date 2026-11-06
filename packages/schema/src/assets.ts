import { z } from "zod";
import { Id, schemaVersion } from "./common.ts";

/** Project-relative path inside `assets/` (posix separators). */
export const AssetPath = z
  .string()
  .regex(/^assets\/(?:[^/\\]+\/)*[^/\\]+$/, "must be a file inside the project's assets folder")
  .refine((p) => !p.split("/").includes(".."), "must not leave the assets folder");

export const ImageAsset = z.strictObject({ id: Id, path: AssetPath });
export const AudioAsset = z.strictObject({ id: Id, path: AssetPath });

/** `assets.yaml` (D55): imported files are referenced by ID, never by path. */
export const AssetsFile = z.strictObject({
  schemaVersion,
  images: z.array(ImageAsset),
  audio: z.array(AudioAsset),
});
export type AssetsFile = z.infer<typeof AssetsFile>;
