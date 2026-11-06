import { describe, expect, it } from "vitest";
import { MAX_RECENT, addRecent, parseRecent, removeRecent } from "../src/model/recent.ts";
import { SANDBOX, sandboxPath } from "../dev/sandbox.ts";

describe("dev sandbox (D91)", () => {
  it("only resolves folders inside the sandbox", () => {
    expect(sandboxPath("garden")).toBe(`${SANDBOX}/garden`);
    expect(() => sandboxPath("../../engine/fixtures/m1")).toThrow(/Outside/);
    expect(() => sandboxPath("/etc")).toThrow(/Outside/);
    expect(() => sandboxPath("")).toThrow();
  });
});

describe("recent projects (D87)", () => {
  const r = (root: string, t = 0) => ({ root, title: root, openedAt: t });
  it("moves a reopened project to the top, keeping 10", () => {
    let list = Array.from({ length: 12 }, (_, i) => r(`p${i}`)).reduce(addRecent, []);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]?.root).toBe("p11");
    list = addRecent(list, r("p5", 9));
    expect(list.map((x) => x.root).slice(0, 2)).toEqual(["p5", "p11"]);
    expect(list.filter((x) => x.root === "p5")).toHaveLength(1);
    expect(removeRecent(list, "p5")[0]?.root).toBe("p11");
  });
  it("reads stored lists defensively", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent([r("a"), { root: 3 }, "x"])).toEqual([r("a")]);
  });
});
