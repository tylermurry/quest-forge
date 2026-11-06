import { z } from "zod";
import { Id, Text, schemaVersion } from "./common.ts";

/** `items/**\/<id>.item.yaml` (D58). `icon` is an image asset ID. */
export const ItemFile = z.strictObject({
  schemaVersion,
  id: Id,
  name: Text,
  description: Text,
  icon: Id,
});
export type ItemFile = z.infer<typeof ItemFile>;
