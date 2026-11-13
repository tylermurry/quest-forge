import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/index.ts";

describe("engine package", () => {
  it("resolves the shared schema version", () => {
    expect(SCHEMA_VERSION).toBe(3);
  });
});
