import { describe, expect, it } from "vitest";
import { serialize, validateProject } from "@questforge/schema";
import { CommandError } from "../src/model/commands.ts";
import { setSceneMusic } from "../src/model/scene/commands.ts";
import { m1Project } from "./support/fixtures.ts";

// Scene music (spec 07, D148): set in the scene's Inspector, omitted from the file when unset.
describe("scene music (D148)", () => {
  it("sets and removes a scene's music by audio ID; unknown IDs are refused", async () => {
    const p = await m1Project();
    const audio = p.assets!.data.audio[0]!.id;
    const set = setSceneMusic(p, "shed", audio);
    const shed = () => set.scenes.find((s) => s.data.id === "shed")!.data;
    expect(shed().music).toBe(audio);
    expect(serialize(shed())).toContain(`music: ${audio}`);
    expect(validateProject(set).filter((x) => x.severity === "error")).toEqual([]);
    const off = setSceneMusic(set, "shed", undefined).scenes.find((s) => s.data.id === "shed")!.data;
    expect(off.music).toBeUndefined();
    expect(serialize(off)).not.toContain("music");
    expect(() => setSceneMusic(p, "shed", "nope")).toThrow(CommandError);
  });
});
