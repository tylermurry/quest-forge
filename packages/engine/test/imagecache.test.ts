import { describe, expect, it } from "vitest";
import { AssetsFile, type Project } from "@questforge/schema";
import { ImageCache, sceneImageIds } from "../src/game.ts";
import { testProject } from "./support/project.ts";

const base = testProject();
const yard = base.scenes[0]!.data;
const characters = new Map(base.characters.map((c) => [c.data.id, c.data]));
const ids = sceneImageIds(yard, characters, "hero");
const project: Project = {
  ...base,
  assets: { path: "assets.yaml", data: AssetsFile.parse({ schemaVersion: 2, images: ids.map((id) => ({ id, path: `assets/images/${id}.png` })), audio: [] }) },
};

/** A decoder that fails the first `failures[url]` times it is asked for a URL. */
function fakeDecoder(failures: Record<string, number> = {}) {
  const asked: string[] = [];
  const decode = async (url: string) => {
    asked.push(url);
    if ((failures[url] ?? 0) > 0) {
      failures[url]!--;
      throw new Error("decode failed");
    }
    return { el: {} as HTMLImageElement, size: { w: 64, h: 64 } };
  };
  return { asked, decode };
}

describe("ImageCache", () => {
  it("loads each ID once", async () => {
    const { asked, decode } = fakeDecoder();
    const cache = new ImageCache(project, characters, (p) => p, () => {}, decode);
    await cache.load(ids);
    await cache.load(ids);
    expect(asked).toHaveLength(ids.length);
    expect([...cache.loaded.keys()].sort()).toEqual([...ids].sort());
  });

  it("retries an image that failed, so a scene that needs it still loads instead of waiting for ever", async () => {
    const path = project.assets!.data.images.find((i) => i.id === ids[0])!.path;
    const { asked, decode } = fakeDecoder({ [path]: 1 });
    const cache = new ImageCache(project, characters, (p) => p, () => {}, decode);
    await expect(cache.load([ids[0]!])).rejects.toThrow("decode failed"); // e.g. the skin's preload
    expect(cache.loaded.has(ids[0]!)).toBe(false);
    await cache.load(ids); // the scene asks again and gets it (before, the ID stayed "started" and loadScene waited for ever)
    expect(cache.ready(yard)).toBe(true);
    expect(asked.filter((u) => u === path)).toHaveLength(2);
  });
});
