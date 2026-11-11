import { describe, expect, it } from "vitest";
import { LEGACY_STYLE, resolveStyle } from "@questforge/schema";
import { FALLBACK_FAMILY, loadStyleAssets, resolveFontFamily, styleImageIds, type LoadedFont, type StyleLoaders } from "../src/styleassets.ts";

const SKINNED = resolveStyle({
  sharedFrame: { image: "panel" },
  typography: { font: "ye_olde" },
  iconBar: { frame: { image: "panel" }, icons: { walk: "boot", look: "eye" } },
});

/** Loaders that record what they were asked for; `fail` names IDs whose load rejects. */
function fakes(fail: { images?: string[]; font?: boolean } = {}) {
  const calls = { images: [] as string[], fonts: [] as string[], released: 0 };
  const loaders: StyleLoaders = {
    loadImage: async (id) => {
      calls.images.push(id);
      if (fail.images?.includes(id)) throw new Error("decode failed");
    },
    loadFont: async (id): Promise<LoadedFont> => {
      calls.fonts.push(id);
      if (fail.font) throw new Error("invalid font data");
      return { family: `qf-font-${id}-1`, release: () => void calls.released++ };
    },
  };
  return { calls, loaders };
}

describe("styleImageIds", () => {
  it("lists every skin image once, independent of any scene", () => {
    expect(styleImageIds(SKINNED).sort()).toEqual(["boot", "eye", "panel"]);
  });

  it("is empty for a game with no style", () => {
    expect(styleImageIds(LEGACY_STYLE)).toEqual([]);
  });
});

describe("resolveFontFamily", () => {
  it("uses the custom font once loaded, with the built-in family behind it", () => {
    expect(resolveFontFamily(SKINNED.typography, { family: "qf-font-ye_olde-1", release() {} })).toBe('"qf-font-ye_olde-1", monospace');
  });

  it("falls back to the built-in family when the custom font is missing", () => {
    expect(resolveFontFamily(SKINNED.typography, null)).toBe(FALLBACK_FAMILY);
    expect(resolveFontFamily(resolveStyle({ typography: { family: "serif" } }).typography, null)).toBe("serif");
    expect(resolveFontFamily(LEGACY_STYLE.typography, null)).toBe("monospace");
  });
});

describe("loadStyleAssets", () => {
  it("loads each image and the font, and hands back the font's family", async () => {
    const { calls, loaders } = fakes();
    const warnings: string[] = [];
    const assets = await loadStyleAssets(SKINNED, loaders, (m) => warnings.push(m));
    expect(calls.images.sort()).toEqual(["boot", "eye", "panel"]);
    expect(calls.fonts).toEqual(["ye_olde"]);
    expect(assets.fontFamily).toBe('"qf-font-ye_olde-1", monospace');
    expect(warnings).toEqual([]);
    assets.release();
    expect(calls.released).toBe(1);
  });

  it("loads nothing for a game with no style", async () => {
    const { calls, loaders } = fakes();
    const assets = await loadStyleAssets(LEGACY_STYLE, loaders, () => {});
    expect(calls).toEqual({ images: [], fonts: [], released: 0 });
    expect(assets.fontFamily).toBe("monospace");
    assets.release();
    expect(calls.released).toBe(0);
  });

  it("still resolves when a style image is missing or broken, and says which", async () => {
    const { calls, loaders } = fakes({ images: ["eye"] });
    const warnings: string[] = [];
    const assets = await loadStyleAssets(SKINNED, loaders, (m) => warnings.push(m));
    expect(calls.images.sort()).toEqual(["boot", "eye", "panel"]); // the others were still tried
    expect(warnings).toEqual(["Style image eye could not be loaded, so the built-in art is used: decode failed"]);
    expect(assets.fontFamily).toBe('"qf-font-ye_olde-1", monospace');
  });

  it("still resolves when the font can't be decoded, falling back to the built-in family", async () => {
    const { calls, loaders } = fakes({ font: true });
    const warnings: string[] = [];
    const assets = await loadStyleAssets(SKINNED, loaders, (m) => warnings.push(m));
    expect(warnings).toEqual(["Font ye_olde could not be loaded, so the built-in font is used: invalid font data"]);
    expect(assets.fontFamily).toBe("monospace");
    assets.release();
    expect(calls.released).toBe(0);
  });

  it("does not stall when everything fails", async () => {
    const { loaders } = fakes({ images: ["boot", "eye", "panel"], font: true });
    const warnings: string[] = [];
    await expect(loadStyleAssets(SKINNED, loaders, (m) => warnings.push(m))).resolves.toMatchObject({ fontFamily: "monospace" });
    expect(warnings).toHaveLength(4);
  });
});
