import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { resolveStyle, type FrameInsets } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { imageOptions, setFrameInsets, setSharedFrameImage } from "../../model/style.ts";
import { Button } from "../components/ui/button.tsx";
import { Picker } from "../rules/Picker.tsx";
import { useCanvasImages } from "../scene/images.ts";
import { FramePreview } from "./FramePreview.tsx";
import { NineSliceEditor } from "./NineSliceEditor.tsx";

const KEY = "style:sharedFrame";

/**
 * Game Settings > Styling > Shared Frames: one image for every panel of the game (narration, speech, dialogue
 * choices, inventory), cut into a nine-slice frame with guides, beside a preview drawn by the engine.
 */
export function SharedFrames({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const p = editor.project;
  const images = useCanvasImages(p);
  const file = useRef<HTMLInputElement | null>(null);
  // Borders while a guide is being dragged: shown at once, saved as one undo step on release.
  const [draft, setDraft] = useState<FrameInsets | null>(null);
  const draftRef = useRef<FrameInsets | null>(null);
  const style = p.game?.data.style;
  const frame = resolveStyle(style).sharedFrame;
  const insets = draft ?? frame.insets;
  const asset = frame.image === undefined ? undefined : p.assets?.data.images.find((i) => i.id === frame.image);
  const loaded = frame.image ? images.lookup(frame.image) : undefined;
  const image = asset && loaded ? { id: asset.id, src: images.urlFor(p, asset.path), width: loaded.size.w, height: loaded.size.h } : null;

  const pick = (id: string | undefined) => editor.apply(id === undefined ? "Use built-in shared frame" : "Pick shared frame image", (q) => setSharedFrameImage(q, id));
  const preview = (next: FrameInsets | null) => {
    draftRef.current = next;
    setDraft(next);
  };
  const importImage = async (f: File) => {
    const known = new Set(editor.project.assets?.data.images.map((i) => i.id));
    actions.importFiles("image", "", [{ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }]);
    const added = editor.project.assets?.data.images.find((i) => !known.has(i.id));
    if (added) pick(added.id);
  };

  return (
    <section aria-label="Shared Frames" className="grid gap-3">
      <header className="grid gap-1">
        <h3 className="text-base font-semibold">Shared Frames</h3>
        <p className="text-muted-foreground text-[12px]">One picture frames every panel in the game: narration, speech, dialogue choices and the inventory. It is cut into nine pieces so it fits panels of any size.</p>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-[12px]">Image</span>
            <Picker label="Frame image" value={frame.image ?? ""} options={imageOptions(p)} placeholder="Built-in look" onPick={pick} />
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[13px] font-normal" onClick={() => file.current?.click()}>
              <ImagePlus className="size-3.5" />
              Import image…
            </Button>
            {frame.image !== undefined && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-normal" onClick={() => pick(undefined)}>
                Use built-in look
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/webp"
              aria-label="Import a frame image"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importImage(f);
              }}
            />
          </div>
          {frame.image !== undefined && !asset && <p role="alert" className="text-err text-[12px]">The image {frame.image} is no longer in the Images library, so the built-in look is used. Pick another image.</p>}
          {asset && !image && <p className="text-muted-foreground text-[12px]">Loading the image…</p>}
          {frame.image === undefined && <p className="text-muted-foreground text-[12px]">No image picked: panels use the built-in look. Pick an image you imported, or import one now (PNG or WebP).</p>}
          <NineSliceEditor
            image={image}
            insets={insets}
            onChange={(next, side) => editor.apply("Change shared frame border", (q) => setFrameInsets(q, "sharedFrame", next), `${KEY}:${side}`)}
            onPreview={preview}
            onCommit={() => {
              const next = draftRef.current;
              preview(null);
              if (next) editor.apply("Move shared frame guide", (q) => setFrameInsets(q, "sharedFrame", next));
            }}
            onBlurField={() => editor.history.breakMerge()}
          />
        </div>
        <FramePreview frame={{ image: frame.image, insets }} style={style} images={images} />
      </div>
    </section>
  );
}
