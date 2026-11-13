import type { EffectiveStyle } from "@questforge/schema";

// The game-wide skin's files: which images to preload, and starting up with them.
// DOM-free: the image cache and the FontFace calls live in `game.ts` and are passed in,
// so what happens when one fails is testable in Node.

/** What the engine draws text with when there is no usable custom font (today's look). */
export const FALLBACK_FAMILY = "monospace";

/** Image IDs the skin needs at all times, each once, whatever scene is playing. */
export function styleImageIds(style: EffectiveStyle): string[] {
  const ids = [style.sharedFrame.image, style.iconBar.frame.image, ...Object.values(style.iconBar.icons)];
  return [...new Set(ids.filter((id): id is string => id !== undefined))];
}

/** A custom font that is ready to draw with. `release` takes it back out of the document. */
export interface LoadedFont {
  /** The CSS family name the font was registered under. */
  family: string;
  release(): void;
}

export interface StyleLoaders {
  /** Loads one image into the game's image cache; rejects when it can't be loaded. */
  loadImage(id: string): Promise<void>;
  /** Loads and registers a font asset; rejects when the file can't be decoded. */
  loadFont(id: string): Promise<LoadedFont>;
}

/** The CSS font-family for text: the custom font once loaded, else the built-in family (or the fallback). */
export function resolveFontFamily(typography: EffectiveStyle["typography"], loaded: LoadedFont | null): string {
  if (loaded) return `"${loaded.family}", ${FALLBACK_FAMILY}`;
  return typography.family ?? FALLBACK_FAMILY;
}

export interface StyleAssets {
  /** CSS font-family to measure and draw text with. */
  fontFamily: string;
  /** Frees the font. Safe to call more than once. */
  release(): void;
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Loads the skin's images and font. Never rejects and never waits on a failure: an image that
 * can't load is reported and left out (that part keeps its built-in art), and a font that
 * can't be decoded is reported and text falls back to the built-in family.
 */
export async function loadStyleAssets(style: EffectiveStyle, loaders: StyleLoaders, warn: (message: string) => void): Promise<StyleAssets> {
  const fontId = style.typography.font;
  const [, font] = await Promise.all([
    Promise.all(styleImageIds(style).map((id) => loaders.loadImage(id).catch((e) => warn(`Style image ${id} could not be loaded, so the built-in art is used: ${reason(e)}`)))),
    fontId === undefined
      ? null
      : loaders.loadFont(fontId).catch((e) => {
          warn(`Font ${fontId} could not be loaded, so the built-in font is used: ${reason(e)}`);
          return null;
        }),
  ]);
  return { fontFamily: resolveFontFamily(style.typography, font), release: () => font?.release() };
}
