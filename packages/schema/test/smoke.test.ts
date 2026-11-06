import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/index.ts";

describe("schema package", () => {
  it("resolves the shared schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
