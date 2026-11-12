import { useEffect, useState } from "react";
import { registerFont, resolveFontFamily, type LoadedFont } from "@questforge/engine";
import { resolveStyle, type GameStyle, type Project } from "@questforge/schema";
import type { CanvasImages } from "../scene/images.ts";

// The font the Styling previews draw with. The game registers its custom font with the game's own document
// (engine `registerFont`); this does the same in the editor's document so the preview shows the real font.
// A font that can't be loaded gives the built-in family and a message, as the game does.

export interface StyleFont {
  /** CSS font-family to draw the preview's text with. */
  family: string;
  /** Plain-language reason the chosen font isn't showing; null when it is, or none is chosen. */
  problem: string | null;
}

export function useStyleFont(project: Project, style: GameStyle | undefined, images: CanvasImages): StyleFont {
  const typography = resolveStyle(style).typography;
  const id = typography.font;
  const asset = id === undefined ? undefined : project.assets?.data.fonts?.find((f) => f.id === id);
  const url = asset ? images.urlFor(project, asset.path) : undefined;
  const [loaded, setLoaded] = useState<{ id: string; url: string; font: LoadedFont } | null>(null);
  const [failed, setFailed] = useState<{ id: string; url: string; reason: string } | null>(null);

  useEffect(() => {
    if (id === undefined || url === undefined) return;
    let current = true;
    let font: LoadedFont | null = null;
    registerFont(document, url, id).then(
      (f) => {
        if (current) {
          font = f;
          setLoaded({ id, url, font: f });
        } else f.release();
      },
      (e: unknown) => current && setFailed({ id, url, reason: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      current = false;
      font?.release();
    };
  }, [id, url]);

  const ready = loaded && loaded.id === id && loaded.url === url ? loaded.font : null;
  const family = resolveFontFamily(typography, ready);
  if (id === undefined) return { family, problem: null };
  if (!asset) return { family, problem: `The font ${id} is no longer in the Fonts library, so the built-in font is shown. Pick another font.` };
  if (failed && failed.id === id && failed.url === url) return { family, problem: `The font ${id} couldn't be loaded (${failed.reason}), so the built-in font is shown.` };
  return { family, problem: null };
}
