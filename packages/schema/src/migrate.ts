import { SCHEMA_VERSION } from "./common.ts";

type Raw = Record<string, unknown>;

/** Gives every rule in a list an ID in list order (`rule_1`, `rule_2`, …), keeping any it has. */
function idRules(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((r, i) => (typeof r === "object" && r !== null && !Array.isArray(r) && !("id" in r) ? { id: `rule_${i + 1}`, ...r } : r));
}

/** Rule lists live at the top of scene and game files and on scene things. */
const RULE_OWNERS = ["objects", "characters", "hotspots", "regions"];

/**
 * `MIGRATIONS[n]` upgrades a file from schemaVersion n to n + 1 (spec 01: the
 * editor migrates older versions on open).
 */
export const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  /** v2: rules get stable IDs (D117). Files without rules only change version. */
  1: (raw) => withRuleIds(raw),
};

/**
 * Gives every rule in a scene or game file's data an ID in list order, keeping IDs
 * it already has. The v2 migration, also handy for building test data.
 */
export function withRuleIds<T extends Raw>(raw: T): T {
  const out: Raw = { ...raw };
  if ("rules" in out) out.rules = idRules(out.rules);
  for (const key of RULE_OWNERS) {
    const list = out[key];
    if (!Array.isArray(list)) continue;
    out[key] = list.map((t) => (typeof t === "object" && t !== null && !Array.isArray(t) && "rules" in t ? { ...t, rules: idRules((t as Raw).rules) } : t));
  }
  return out as T;
}

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
