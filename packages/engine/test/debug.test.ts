import { describe, expect, it } from "vitest";
import { DEBUG_ALL, DEBUG_OFF, debugShapes } from "../src/debug.ts";
import { Session } from "../src/session.ts";
import { testImages, testProject } from "./support/project.ts";

// Playtest debug layers: each toggle draws only its own shapes.

const region = {
  regions: [
    {
      id: "exit",
      shape: [
        [600, 300],
        [640, 300],
        [640, 400],
        [600, 400],
      ],
      rules: [],
    },
  ],
};
const make = () => new Session(testProject({ yard: region }), testImages);
const layers = (s: Session, on: Partial<typeof DEBUG_OFF>) => new Set(debugShapes(s.world, { ...DEBUG_OFF, ...on }).map((sh) => sh.layer));

describe("debug layers", () => {
  it("draw nothing when off", () => {
    expect(debugShapes(make().world, DEBUG_OFF)).toEqual([]);
  });

  it("each toggle draws only its own layer", () => {
    const s = make();
    for (const layer of ["walkable", "hotspots", "regions", "baselines", "path"] as const) {
      expect(layers(s, { [layer]: true })).toEqual(new Set([layer]));
    }
    expect(layers(s, DEBUG_ALL).size).toBe(5);
  });

  it("walkable shows the outline and visible obstacles; hiding an object removes its obstacle", () => {
    const s = make();
    const polys = () => debugShapes(s.world, { ...DEBUG_OFF, walkable: true }).filter((sh) => sh.kind === "poly");
    expect(polys()).toHaveLength(2);
    s.setObjectVisible("yard", "boulder", false);
    expect(polys()).toHaveLength(1);
  });

  it("hotspots and regions are labelled", () => {
    const labels = debugShapes(make().world, DEBUG_ALL).flatMap((sh) => (sh.kind === "poly" && sh.label ? [sh.label] : []));
    expect(labels).toEqual(["exit", "flowerpot"]);
  });

  it("the last path stays after the player arrives", () => {
    const s = make();
    s.primaryClick([500, 250]);
    for (let i = 0; i < 1200 && s.world.walking; i++) s.tick(1 / 60);
    expect(s.world.walking).toBe(false);
    const lines = debugShapes(s.world, { ...DEBUG_OFF, path: true }).filter((sh) => sh.kind === "line");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.points[0]).toEqual([100, 380]);
    expect(lines[0]!.points.at(-1)).toEqual([500, 250]);
  });
});
