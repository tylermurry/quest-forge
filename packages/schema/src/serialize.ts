import { Document, isScalar, visit } from "yaml";

/**
 * The canonical YAML writer (D54). Every project file the editor writes goes
 * through here, so a file the editor wrote loads and saves byte-identically.
 *
 * Callers must pass schema-parsed data: zod emits keys in schema order, and
 * undefined (unset optional) fields are dropped here.
 */
export function serialize(value: unknown): string {
  const doc = new Document(value, { version: "1.2", keepUndefined: false });
  visit(doc, {
    Seq(_key, node) {
      // Number lists (points, canvas positions, frame lists) read best inline: `[x, y]`.
      if (node.items.length > 0 && node.items.every((i) => isScalar(i) && typeof i.value === "number")) {
        node.flow = true;
      }
    },
  });
  return doc.toString({ indent: 2, indentSeq: true, lineWidth: 0, flowCollectionPadding: false });
}
