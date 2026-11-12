import { resolveStyle } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { useCanvasImages } from "../scene/images.ts";
import { FrameControls, useFrameDraft } from "./FrameControls.tsx";
import { FramePreview } from "./FramePreview.tsx";
import { useStyleFont } from "./useStyleFont.ts";

/**
 * Game Settings > Styling > Shared Frames: one image for every panel of the game (narration, speech, dialogue
 * choices, inventory), cut into a nine-slice frame with guides, beside a preview drawn by the engine.
 */
export function SharedFrames({ actions }: { actions: Actions }) {
  const p = actions.editor.project;
  const images = useCanvasImages(p);
  const style = p.game?.data.style;
  const frame = resolveStyle(style).sharedFrame;
  const font = useStyleFont(p, style, images);
  const draft = useFrameDraft(frame.insets);

  return (
    <section aria-label="Shared Frames" className="grid gap-3">
      <header className="grid gap-1">
        <h3 className="text-base font-semibold">Shared Frames</h3>
        <p className="text-muted-foreground text-[12px]">One picture frames every panel in the game: narration, speech, dialogue choices and the inventory. It is cut into nine pieces so it fits panels of any size.</p>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <FrameControls actions={actions} which="sharedFrame" noun="shared frame" none="No image picked: panels use the built-in look. Pick an image you imported, or import one now (PNG or WebP)." frame={frame} images={images} draft={draft} />
        </div>
        <FramePreview frame={{ image: frame.image, insets: draft.insets }} style={style} images={images} family={font.family} />
      </div>
    </section>
  );
}
