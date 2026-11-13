import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasImages } from "../src/ui/scene/images.ts";
import { m1Project } from "./support/fixtures.ts";

// The image store's load states, with a stand-in Image that loads or fails on demand.
class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 4;
  naturalHeight = 3;
  src = "";
  constructor() {
    FakeImage.made.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeImage.made = [];
});

describe("CanvasImages", () => {
  it("marks an image whose file can't be loaded as failed, and a loaded one as not failed", async () => {
    vi.stubGlobal("Image", FakeImage);
    const p = await m1Project();
    const ids = p.assets!.data.images.map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const images = new CanvasImages((path) => `asset://${path}`);
    const changed = vi.fn();
    images.subscribe(changed);
    images.sync(p);
    const [ok, bad] = [FakeImage.made[0]!, FakeImage.made[1]!];
    expect(images.failed(ids[1]!)).toBe(false);
    bad.onerror!();
    ok.onload!();
    expect(images.failed(ids[1]!)).toBe(true);
    expect(images.lookup(ids[1]!)).toBeUndefined();
    expect(images.failed(ids[0]!)).toBe(false);
    expect(images.lookup(ids[0]!)?.size).toEqual({ w: 4, h: 3 });
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
