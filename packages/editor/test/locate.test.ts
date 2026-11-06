import { describe, expect, it } from "vitest";
import { validateProject } from "@questforge/schema";
import { deleteEntry } from "../src/model/commands.ts";
import { locate } from "../src/model/locate.ts";
import { m1Project } from "./support/fixtures.ts";

describe("jump-to", () => {
  it("maps each problem of a deleted item to the entry that uses it", async () => {
    const p = deleteEntry(await m1Project(), "item", "stick");
    const targets = validateProject(p).map((x) => locate(p, x.location));
    expect(targets).toEqual(expect.arrayContaining([{ section: "scene", id: "garden" }]));
    expect(targets).toContainEqual(null); // game settings: no browser entry yet (M5)
  });

  it("maps flags and images by index", async () => {
    const p = await m1Project();
    expect(locate(p, { file: "flags.yaml", path: ["flags", 0, "id"] })).toEqual({ section: "flag", id: p.flags!.data.flags[0]!.id });
    expect(locate(p, { file: "assets.yaml", path: ["images", 0, "path"] })).toEqual({ section: "image", id: "garden_bg" });
    expect(locate(p, { file: "nope.yaml", path: [] })).toBeNull();
  });
});
