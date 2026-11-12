import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import type { EffectiveFrame, FrameInsets } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { imageOptions, setFrameImage, setFrameInsets, type FrameKey } from "../../model/style.ts";
import { Button } from "../components/ui/button.tsx";
import { Picker } from "../rules/Picker.tsx";
import type { CanvasImages } from "../scene/images.ts";
import { NineSliceEditor } from "./NineSliceEditor.tsx";

/**
 * Borders while a guide is being dragged: shown at once (`insets`, for the preview too), saved as one undo step
 * on release. `saved` is what the project has.
 */
export function useFrameDraft(saved: FrameInsets) {
  const [draft, setDraft] = useState<FrameInsets | null>(null);
  const ref = useRef<FrameInsets | null>(null);
  const preview = (next: FrameInsets | null) => {
    ref.current = next;
    setDraft(next);
  };
  return { insets: draft ?? saved, preview, ref };
}

/**
 * The picture picker and the nine-slice editor for one frame, the same for the shared panel frame and the
 * icon bar's own frame (`which`); each keeps its own image and borders. `noun` names the frame in the undo
 * history and `none` says what the game shows without a picture.
 */
export function FrameControls(props: { actions: Actions; which: FrameKey; noun: string; none: string; frame: EffectiveFrame; images: CanvasImages; draft: ReturnType<typeof useFrameDraft> }) {
  const { actions, which, noun, frame, images, draft } = props;
  const { editor } = actions;
  const p = editor.project;
  const file = useRef<HTMLInputElement | null>(null);
  const asset = frame.image === undefined ? undefined : p.assets?.data.images.find((i) => i.id === frame.image);
  const loaded = frame.image ? images.lookup(frame.image) : undefined;
  const image = asset && loaded ? { id: asset.id, src: images.urlFor(p, asset.path), width: loaded.size.w, height: loaded.size.h } : null;

  const pick = (id: string | undefined) => editor.apply(id === undefined ? `Use built-in ${noun}` : `Pick ${noun} image`, (q) => setFrameImage(q, which, id));
  const importImage = async (f: File) => {
    const known = new Set(editor.project.assets?.data.images.map((i) => i.id));
    actions.importFiles("image", "", [{ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }]);
    const added = editor.project.assets?.data.images.find((i) => !known.has(i.id));
    if (added) pick(added.id);
  };

  return (
    <>
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
      {frame.image === undefined && <p className="text-muted-foreground text-[12px]">{props.none}</p>}
      <NineSliceEditor
        image={image}
        insets={draft.insets}
        onChange={(next, side) => editor.apply(`Change ${noun} border`, (q) => setFrameInsets(q, which, next), `style:${which}:${side}`)}
        onPreview={draft.preview}
        onCommit={() => {
          const next = draft.ref.current;
          draft.preview(null);
          if (next) editor.apply(`Move ${noun} guide`, (q) => setFrameInsets(q, which, next));
        }}
        onBlurField={() => editor.history.breakMerge()}
      />
    </>
  );
}
