import { describe, expect, it } from "vitest";
import { doubleArea, onSegment, pointInPolygon, polygonIssue, polygonWithin, segmentsCross, segmentsIntersect, type Polygon } from "../src/index.ts";

// validate.test.ts covers geometry through the scene problems; these pin down the edge cases
// the validator cannot reach on its own (touching, collinear and concave shapes).

describe("segments", () => {
  it("onSegment includes the endpoints and rejects collinear points beyond them", () => {
    expect(onSegment([0, 0], [0, 0], [10, 10])).toBe(true);
    expect(onSegment([5, 5], [0, 0], [10, 10])).toBe(true);
    expect(onSegment([11, 11], [0, 0], [10, 10])).toBe(false);
    expect(onSegment([5, 6], [0, 0], [10, 10])).toBe(false);
  });

  it("segmentsIntersect counts touching and collinear overlap, segmentsCross does not", () => {
    // An X crosses in both senses.
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsCross([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    // A T touches: the end of one lies on the other.
    expect(segmentsIntersect([0, 0], [10, 0], [5, 0], [5, 10])).toBe(true);
    expect(segmentsCross([0, 0], [10, 0], [5, 0], [5, 10])).toBe(false);
    // Collinear overlap shares points but never crosses.
    expect(segmentsIntersect([0, 0], [10, 0], [5, 0], [15, 0])).toBe(true);
    expect(segmentsCross([0, 0], [10, 0], [5, 0], [15, 0])).toBe(false);
    // Apart.
    expect(segmentsIntersect([0, 0], [1, 0], [5, 5], [6, 5])).toBe(false);
  });
});

describe("polygons", () => {
  const square: Polygon = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];

  it("doubleArea is signed by winding order", () => {
    expect(doubleArea(square)).toBe(20000);
    expect(doubleArea([...square].reverse())).toBe(-20000);
  });

  it("pointInPolygon counts the boundary as inside", () => {
    expect(pointInPolygon([50, 50], square)).toBe(true);
    expect(pointInPolygon([100, 50], square)).toBe(true);
    expect(pointInPolygon([0, 0], square)).toBe(true);
    expect(pointInPolygon([101, 50], square)).toBe(false);
  });

  it("polygonIssue names too few points, a straight line and a doubled-back edge", () => {
    expect(
      polygonIssue([
        [0, 0],
        [10, 10],
      ]),
    ).toBe("too_few_points");
    expect(
      polygonIssue([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBe("no_area");
    expect(
      polygonIssue([
        [0, 0],
        [100, 0],
        [100, 0],
        [100, 100],
      ]),
    ).toBe("self_intersecting");
    expect(
      polygonIssue([
        [0, 0],
        [100, 0],
        [50, 0],
        [50, 100],
      ]),
    ).toBe("self_intersecting");
  });

  it("polygonWithin allows a shape touching the outline", () => {
    expect(
      polygonWithin(
        [
          [0, 0],
          [50, 0],
          [50, 50],
          [0, 50],
        ],
        square,
      ),
    ).toBe(true);
    expect(
      polygonWithin(
        [
          [10, 10],
          [90, 10],
          [90, 90],
          [10, 90],
        ],
        square,
      ),
    ).toBe(true);
    expect(
      polygonWithin(
        [
          [50, 50],
          [150, 50],
          [150, 90],
          [50, 90],
        ],
        square,
      ),
    ).toBe(false);
  });

  it("polygonWithin rejects an edge that leaves a concave outline between two inside vertices", () => {
    // A U shape: both prongs are inside, but the straight edge between their tips crosses the gap.
    const u: Polygon = [
      [0, 0],
      [100, 0],
      [100, 100],
      [70, 100],
      [70, 30],
      [30, 30],
      [30, 100],
      [0, 100],
    ];
    expect(polygonIssue(u)).toBeNull();
    expect(
      polygonWithin(
        [
          [10, 90],
          [90, 90],
          [90, 95],
        ],
        u,
      ),
    ).toBe(false);
    expect(
      polygonWithin(
        [
          [10, 10],
          [90, 10],
          [90, 20],
        ],
        u,
      ),
    ).toBe(true);
  });
});
