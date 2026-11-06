import { SCHEMA_VERSION } from "./common.ts";

type Raw = Record<string, unknown>;

/**
 * `MIGRATIONS[n]` upgrades a file from schemaVersion n to n + 1 (spec 01: the
 * editor migrates older versions on open). Empty until schemaVersion 2 exists.
 */
export const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {};

export type MigrateResult = { ok: true; value: unknown } | { ok: false; reason: "newer" };

export function migrate(raw: unknown, migrations = MIGRATIONS, current: number = SCHEMA_VERSION): MigrateResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: true, value: raw };
  let doc = raw as Raw;
  let version = doc.schemaVersion;
  // Missing or malformed versions are reported by the schema, not here.
  if (typeof version !== "number" || !Number.isInteger(version)) return { ok: true, value: doc };
  if (version > current) return { ok: false, reason: "newer" };
  while (version < current) {
    const step = migrations[version];
    if (!step) break; // unknown old version: the schema will report it
    doc = { ...step(doc), schemaVersion: version + 1 };
    version += 1;
  }
  return { ok: true, value: doc };
}
