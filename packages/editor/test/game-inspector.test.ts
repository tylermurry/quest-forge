import { describe, expect, it } from "vitest";
import { CommandError } from "../src/model/commands.ts";
import { setDefaultResponse, setMaxScore, setStart } from "../src/model/game.ts";
import { m1Project } from "./support/fixtures.ts";

describe("game settings", () => {
  it("edits default responses, the max score and where play starts", async () => {
    let p = await m1Project();
    p = setDefaultResponse(p, "look", "Nothing to see.");
    expect(p.game!.data.defaultResponses.look).toBe("Nothing to see.");
    expect(() => setDefaultResponse(p, "hand", "  ")).toThrow(CommandError);
    p = setMaxScore(p, 30);
    expect(p.game!.data.maxScore).toBe(30);
    expect(() => setMaxScore(p, -1)).toThrow(CommandError);
    p = setStart(p, "shed");
    expect([p.game!.data.startScene, p.game!.data.startSpawn]).toEqual(["shed", "door"]);
    p = setStart(p, "garden", "from_shed");
    expect([p.game!.data.startScene, p.game!.data.startSpawn]).toEqual(["garden", "from_shed"]);
    expect(() => setStart(p, "nope")).toThrow(CommandError);
  });
});
