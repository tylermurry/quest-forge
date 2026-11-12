import { ImagePlus } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { EffectiveFrame, FrameInsets } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { imageOptions, setFrameImage, setFrameInsets, type FrameKey } from "../../model/style.ts";
import { Button } from "../components/ui/button.tsx";
import { Picker } from "../rules/Picker.tsx";
import type { CanvasImages } from "../scene/images.ts";
import { NineSliceEditor } from "./NineSliceEditor.tsx";

/** Borders being dragged, per frame, so the one Styling preview (outside the sections) shows a drag as it moves. */
export type FrameDrafts = Partial<Record<FrameKey, FrameInsets>>;
export const FrameDraftContext = createContext<{ drafts: FrameDrafts; set(which: FrameKey, insets: FrameInsets | null): void } | null>(null);

/** Holds the drafts for the Styling area: the sections write them, the preview reads them. */
export function useFrameDrafts() {
  const [drafts, setDrafts] = useState<FrameDrafts>({});
  const set = useCallback((which: FrameKey, insets: FrameInsets | null) =>
    setDrafts((d) => {
      const { [which]: _old, ...rest } = d;
      return insets ? { ...rest, [which]: insets } : rest;
    }), []);
  return useMemo(() => ({ drafts, set }), [drafts, set]);
}

/**
 * Borders while a guide is being dragged: shown at once (`insets`, and in the preview through FrameDraftContext),
 * saved as one undo step on release. `saved` is what the project has.
 */
export function useFrameDraft(saved: FrameInsets, which: FrameKey) {
  const ctx = useContext(FrameDraftContext);
  const ref = useRef<FrameInsets | null>(null);
  const preview = (next: FrameInsets | null) => {
    ref.current = next;
    ctx?.set(which, next);
  };
  return { insets: ctx?.drafts[which] ?? saved, preview, ref };
}

/**
 * The picture picker and the nine-slice editor for one frame, the same for the shared panel frame and the
 * icon bar's own frame (`which`); each keeps its own image and borders. `noun` names the frame in the undo
 * history. `builtIn` replaces what Use default look does (default: clear the picture) and says when the frame
 * already has the default look, so the button hides.
 */
export function FrameControls(props: {
  actions: Actions;
  which: FrameKey;
  noun: string;
  frame: EffectiveFrame;
  images: CanvasImages;
  draft: ReturnType<typeof useFrameDraft>;
  builtIn?: { active: boolean; use(): void };
  /** Shown right under the Border size slider. */
  belowBorder?: ReactNode;
}) {
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
        <Picker label="Frame image" value={frame.image ?? ""} options={imageOptions(p)} placeholder="Default look" onPick={pick} />
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[13px] font-normal" onClick={() => file.current?.click()}>
          <ImagePlus className="size-3.5" />
          Import image…
        </Button>
        {(props.builtIn ? !props.builtIn.active : frame.image !== undefined) && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-normal" onClick={() => (props.builtIn ? props.builtIn.use() : pick(undefined))}>
            Use default look
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
      {frame.image !== undefined && !asset && <p role="alert" className="text-err text-[12px]">The image {frame.image} is no longer in the Images library, so the default look is used. Pick another image.</p>}
      {asset && !image && <p className="text-muted-foreground text-[12px]">Loading the image…</p>}
      <NineSliceEditor
        image={image}
        insets={draft.insets}
        onChange={(next) => editor.apply(`Change ${noun} border`, (q) => setFrameInsets(q, which, next), `style:${which}:border`)}
        onPreview={draft.preview}
        onCommit={() => {
          const next = draft.ref.current;
          draft.preview(null);
          if (next) editor.apply(`Move ${noun} guide`, (q) => setFrameInsets(q, which, next));
        }}
        onBlurField={() => editor.history.breakMerge()}
        belowBorder={props.belowBorder}
      />
    </>
  );
}
