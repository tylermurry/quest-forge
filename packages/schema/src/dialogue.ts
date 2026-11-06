import { z } from "zod";
import { CanvasPos, Id, Text, schemaVersion } from "./common.ts";
import { Action, Condition } from "./rules.ts";

// Dialogue graph (spec 11). `next` is null while a port is unconnected.
const node = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ id: Id, type: z.literal(type), pos: CanvasPos, ...shape });
const Next = Id.nullable();

export const ChoiceOption = z.strictObject({
  id: Id,
  text: Text,
  if: z.array(Condition),
  once: z.boolean(),
  next: Next,
});
export type ChoiceOption = z.infer<typeof ChoiceOption>;

export const DialogueNode = z.discriminatedUnion("type", [
  node("start", { next: Next }),
  /** No `character` means the narrator speaks. */
  node("line", { character: Id.optional(), text: Text, animation: Id.optional(), next: Next }),
  node("choices", { options: z.array(ChoiceOption) }),
  node("actions", { do: z.array(Action), next: Next }),
  node("branch", { if: z.array(Condition), then: Next, else: Next }),
  node("end", {}),
]);
export type DialogueNode = z.infer<typeof DialogueNode>;
export const DIALOGUE_NODE_TYPES = DialogueNode.options.map((o) => o.shape.type.value);

/** `dialogues/**\/<id>.dialogue.yaml`. */
export const DialogueFile = z.strictObject({
  schemaVersion,
  id: Id,
  name: Text,
  nodes: z.array(DialogueNode),
});
export type DialogueFile = z.infer<typeof DialogueFile>;
