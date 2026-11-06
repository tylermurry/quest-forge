import { describe, expect, it } from "vitest";
import type { Polygon, SceneFile } from "@questforge/schema";
import { NavMesh, pathLength, sceneNav } from "../src/nav.ts";
import { dist, type Vec } from "../src/vec.ts";

// Spec 04 pathfinding acceptance tests.

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Every segment of the path stays walkable, and it ends where expected. */
function expectValid(nav: NavMesh, path: Vec[], from: Vec, to: Vec) {
  expect(path[0]).toEqual(from);
  expect(path.at(-1)![0]).toBeCloseTo(to[0], 0);
  expect(path.at(-1)![1]).toBeCloseTo(to[1], 0);
  for (let i = 1; i < path.length; i++) expect(nav.clear(path[i - 1]!, path[i]!)).toBe(true);
}

describe("NavMesh.findPath", () => {
  it("walks around a single hole on the shortest route", () => {
    const nav = new NavMesh(rect(0, 0, 200, 200), [rect(80, 60, 120, 140)]);
    const from: Vec = [40, 100];
    const to: Vec = [160, 100];
    const path = nav.findPath(from, to);
    expectValid(nav, path, from, to);
    // Bends around two corners of the hole, 1px clear of it.
    expect(path).toHaveLength(4);
    expect(path.slice(1, 3).every(([x, y]) => (x === 79 || x === 121) && (y === 59 || y === 141))).toBe(true);
    // Optimal: two diagonals to the corners plus the hole's width.
    const ideal = 2 * Math.hypot(39, 41) + 42;
    expect(pathLength(path)).toBeCloseTo(ideal, 6);
  });

  it("goes the long way through a U-shaped room", () => {
    // Two arms joined along the bottom.
    const u: Polygon = [[0, 0], [40, 0], [40, 160], [160, 160], [160, 0], [200, 0], [200, 200], [0, 200]];
    const nav = new NavMesh(u, []);
    const from: Vec = [20, 20];
    const to: Vec = [180, 20];
    const path = nav.findPath(from, to);
    expectValid(nav, path, from, to);
    expect(path).toEqual([from, [39, 161], [161, 161], to]);
  });

  it("goes straight when start and end share a convex area", () => {
    const nav = new NavMesh(rect(0, 240, 640, 400), [rect(300, 300, 360, 340)]);
    expect(nav.findPath([20, 260], [600, 280])).toEqual([[20, 260], [600, 280]]);
  });

  it("walks to the nearest point when the target is outside the walkable area", () => {
    const nav = new NavMesh(rect(0, 240, 640, 400), []);
    const path = nav.findPath([320, 300], [320, 100]);
    expect(path).toHaveLength(2);
    expect(path[1]![0]).toBeCloseTo(320, 6);
    expect(path[1]![1]).toBeCloseTo(240, 0);
    expect(nav.isWalkable(path[1]!)).toBe(true);
  });

  it("walks to the nearest point when the target is inside a hole", () => {
    const nav = new NavMesh(rect(0, 0, 200, 200), [rect(80, 80, 120, 120)]);
    const path = nav.findPath([20, 100], [85, 100]);
    expect(path.at(-1)![0]).toBeCloseTo(80, 0);
    expect(path.at(-1)![1]).toBeCloseTo(100, 6);
  });

  it("walks to the nearest reachable point when the target is cut off", () => {
    // A wall from top to bottom splits the room in two.
    const nav = new NavMesh(rect(0, 0, 300, 100), [rect(140, -10, 160, 110)]);
    const from: Vec = [20, 50];
    const path = nav.findPath(from, [280, 30]);
    expectValid(nav, path, from, [140, 30]);
  });

  it("snaps a start point that drifted off the walkable area", () => {
    const nav = new NavMesh(rect(0, 0, 100, 100), []);
    const path = nav.findPath([-3, 50], [50, 50]);
    expect(path[0]![0]).toBeCloseTo(0, 0);
    expect(nav.isWalkable(path[0]!)).toBe(true);
  });

  it("returns just the start when already at the target", () => {
    const nav = new NavMesh(rect(0, 0, 100, 100), []);
    expect(nav.findPath([50, 50], [50, 50])).toEqual([[50, 50]]);
  });

  it("does not cut through a hole when the segment passes exactly through two corners", () => {
    const nav = new NavMesh(rect(0, 0, 200, 200), [rect(80, 80, 120, 120)]);
    expect(nav.clear([40, 40], [160, 160])).toBe(false);
    expect(nav.clear([0, 80], [200, 80])).toBe(true); // along the hole's top edge
  });
});

describe("obstacles tied to object visibility (D42)", () => {
  // A corridor from a lower field up to a far area, plugged by a boulder.
  const scene = {
    walkable: {
      outer: [[0, 400], [0, 300], [280, 300], [280, 160], [360, 160], [360, 300], [640, 300], [640, 400]],
      holes: [],
    },
    objects: [
      { id: "boulder", image: "boulder_img", x: 270, y: 180, visible: true, obstacle: rect(270, 200, 370, 240), rules: [] },
      { id: "sign", image: "sign_img", x: 0, y: 0, visible: true, rules: [] },
    ],
  } as unknown as SceneFile;
  const from: Vec = [100, 350];
  const to: Vec = [320, 170];

  it("blocks the corridor while the boulder is visible", () => {
    const nav = sceneNav(scene, () => true);
    const end = nav.findPath(from, to).at(-1)!;
    expect(dist(end, to)).toBeGreaterThan(25);
    expect(end[1]).toBeGreaterThanOrEqual(240);
  });

  it("opens a path that didn't exist before once the boulder is hidden", () => {
    const nav = sceneNav(scene, (id) => id !== "boulder");
    const path = nav.findPath(from, to);
    expectValid(nav, path, from, to);
  });
});
