import { z } from "zod";
import { Id, schemaVersion } from "./common.ts";

/** A browser folder path inside a section, e.g. `puzzles/cave`. No empty, hidden or `..` segments. */
export const FolderPath = z
  .string()
  .regex(/^[^/\\.][^/\\]*(?:\/[^/\\.][^/\\]*)*$/, "must be a folder path like puzzles/cave")
  .refine((p) => !p.split("/").includes(".."), "must not contain ..");

/** Browser folder of a flag; absent = the section root. */
const folder = FolderPath.optional();

export const BoolFlag = z.strictObject({ id: Id, type: z.literal("bool"), initial: z.boolean(), folder });
export const CounterFlag = z.strictObject({ id: Id, type: z.literal("counter"), initial: z.int(), folder });
export const Flag = z.discriminatedUnion("type", [BoolFlag, CounterFlag]);
export type Flag = z.infer<typeof Flag>;

/**
 * `flags.yaml`. Flags and counters share one ID namespace. Flags live in one
 * file, so their browser folders are listed here (every folder, parents included),
 * which keeps empty ones.
 */
export const FlagsFile = z.strictObject({ schemaVersion, folders: z.array(FolderPath).optional(), flags: z.array(Flag) });
export type FlagsFile = z.infer<typeof FlagsFile>;
