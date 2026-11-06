import { z } from "zod";
import { Id, schemaVersion } from "./common.ts";

export const BoolFlag = z.strictObject({ id: Id, type: z.literal("bool"), initial: z.boolean() });
export const CounterFlag = z.strictObject({ id: Id, type: z.literal("counter"), initial: z.int() });
export const Flag = z.discriminatedUnion("type", [BoolFlag, CounterFlag]);
export type Flag = z.infer<typeof Flag>;

/** `flags.yaml` (D58). Flags and counters share one ID namespace. */
export const FlagsFile = z.strictObject({ schemaVersion, flags: z.array(Flag) });
export type FlagsFile = z.infer<typeof FlagsFile>;
