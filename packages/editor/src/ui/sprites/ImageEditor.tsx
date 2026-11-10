import type { LoadedImage } from "@questforge/engine";
import type { ImageAsset } from "@questforge/schema";
import { useEffect, useRef, useState } from "react";
import type { Actions } from "../../model/actions.ts";
import {
  cellAt,
  effectiveOrigin,
  fitZoom,
  frameCountOf,
  frameSizeOf,
  originAt,
  setOrigin,
  sheetFromCells,
  sheetFromGrid,
  sliceImage,
  type SliceMode,
} from "../../model/sprites.ts";
import { Button } from "../components/ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { useEditor } from "../hooks.ts";
import { NumberField } from "../NumberField.tsx";
import { useCanvasImages } from "../scene/images.ts";
import { drawSheet, drawSpriteFrame, prepare } from "./draw.ts";

// The image tab: slice a spritesheet by rows × columns or by frame size, and
// click in a frame preview to set the origin (the feet). Every change is one undo
// step through Editor.apply; typing in a field merges until blur.

const SHEET_BOX = { w: 560, h: 440 };
const FRAME_BOX = { w: 220, h: 260 };
const PAD = 20;

export function ImageEditor({ actions, imageId }: { actions: Actions; imageId: string }) {
  const editor = useEditor(actions.editor);
  const p = editor.project;
  const asset = p.assets?.data.images.find((i) => i.id === imageId);
  const images = useCanvasImages(p);
  const loaded = images.lookup(imageId);
  const [mode, setMode] = useState<SliceMode>(asset?.sheet ? "grid" : "single");
  const [frame, setFrame] = useState(0);
  /** The origin when typing in a slicing field began; kept if the final size fits it. */
  const typingOrigin = useRef<ImageAsset["origin"] | null | undefined>(undefined);
  if (!asset) return null;
  if (!loaded) {
    return <p className="text-muted-foreground">{p.files.includes(asset.path) || p.pendingFiles[asset.path] ? "Loading image…" : `${asset.path} isn't in the project folder.`}</p>;
  }
  const image: LoadedImage = { ...loaded, asset };
  const size = image.size;
  const count = frameCountOf(asset);
  const shown = frame < count ? frame : 0;
  const blur = () => {
    typingOrigin.current = undefined;
    editor.history.breakMerge();
  };
  const slice = (make: () => Parameters<typeof sliceImage>[3]) => {
    if (typingOrigin.current === undefined) typingOrigin.current = asset.origin ?? null;
    editor.apply("Slice image", (q) => sliceImage(q, imageId, size, make(), typingOrigin.current), `slice:${imageId}`);
  };

  const changeMode = (m: SliceMode) => {
    setMode(m);
    if (m === "single") editor.apply("Make single image", (q) => sliceImage(q, imageId, size, null));
    else if (!asset.sheet) editor.apply("Slice image", (q) => sliceImage(q, imageId, size, sheetFromGrid(size, 1, 1)));
  };
  const sheet = asset.sheet;
  const f = frameSizeOf(asset, size);
  const origin = effectiveOrigin(asset, size);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {asset.id}{" "}
        <span className="text-muted-foreground ml-1 text-[13px] font-normal">
          image · <code className="selectable font-mono">{asset.path}</code> · {size.w}×{size.h} px
        </span>
      </h2>

      <section className="flex flex-col gap-2" aria-label="Slicing">
        <Tabs value={mode} onValueChange={(v) => changeMode(v as SliceMode)}>
          <TabsList>
            <TabsTrigger value="single">Single image</TabsTrigger>
            <TabsTrigger value="grid">Rows × columns</TabsTrigger>
            <TabsTrigger value="cells">Frame size</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode !== "single" && sheet && (
          <div className="flex items-end gap-3">
            {mode === "grid" ? (
              <>
                <NumberField label="Columns" integer min={1} value={sheet.columns} onBlur={blur} onChange={(n) => slice(() => sheetFromGrid(size, n, sheet.rows))} className="w-24" />
                <NumberField label="Rows" integer min={1} value={sheet.rows} onBlur={blur} onChange={(n) => slice(() => sheetFromGrid(size, sheet.columns, n))} className="w-24" />
              </>
            ) : (
              <>
                <NumberField label="Frame width" integer min={1} value={sheet.cellWidth} onBlur={blur} onChange={(n) => slice(() => sheetFromCells(size, n, sheet.cellHeight))} className="w-24" />
                <NumberField label="Frame height" integer min={1} value={sheet.cellHeight} onBlur={blur} onChange={(n) => slice(() => sheetFromCells(size, sheet.cellWidth, n))} className="w-24" />
              </>
            )}
            <p className="text-muted-foreground pb-1.5 text-[12px]" role="status" aria-label="Sheet summary">
              {sheet.columns} × {sheet.rows} = {count} frames of {sheet.cellWidth}×{sheet.cellHeight} px
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <SheetCanvas image={image} selected={shown} onPick={setFrame} />
        <section className="flex flex-col gap-2" aria-label="Origin">
          <p className="text-[12px]">
            Frame {shown}. Click to set the feet point{asset.origin ? "" : " (now bottom-centre)"}.
          </p>
          <FramePreview
            image={image}
            frame={shown}
            onPick={(o) => editor.apply("Set origin", (q) => setOrigin(q, imageId, size, originAt(o, f)))}
          />
          <div className="flex items-end gap-2">
            <NumberField label="Origin x" integer min={0} max={f.w} value={origin[0]} onBlur={blur} onChange={(x) => editor.apply("Set origin", (q) => setOrigin(q, imageId, size, [x, Math.round(origin[1])]), `origin:${imageId}`)} className="w-20" />
            <NumberField label="Origin y" integer min={0} max={f.h} value={origin[1]} onBlur={blur} onChange={(y) => editor.apply("Set origin", (q) => setOrigin(q, imageId, size, [Math.round(origin[0]), y]), `origin:${imageId}`)} className="w-20" />
            <Button variant="ghost" size="sm" disabled={!asset.origin} onClick={() => editor.apply("Reset origin", (q) => setOrigin(q, imageId, size, null))}>
              Bottom-centre
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The whole image with its grid; clicking a cell previews that frame. */
function SheetCanvas({ image, selected, onPick }: { image: LoadedImage; selected: number; onPick(frame: number): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoom = fitZoom(image.size, SHEET_BOX);
  const w = Math.round(image.size.w * zoom);
  const h = Math.round(image.size.h * zoom);
  useEffect(() => {
    const ctx = ref.current && prepare(ref.current, w, h);
    if (ctx) drawSheet(ctx, image, zoom, [selected]);
  }, [image, zoom, w, h, selected]);
  return (
    <canvas
      ref={ref}
      aria-label="Spritesheet"
      className="cursor-pointer rounded-sm border"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const cell = cellAt(image.asset, image.size, [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]);
        if (cell !== null) onPick(cell);
      }}
    />
  );
}

/** One frame, zoomed, with the origin marked; a click reports the frame-pixel point. */
function FramePreview({ image, frame, onPick }: { image: LoadedImage; frame: number; onPick(local: [number, number]): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = frameSizeOf(image.asset, image.size);
  const zoom = fitZoom(f, { w: FRAME_BOX.w - 2 * PAD, h: FRAME_BOX.h - 2 * PAD }, 12);
  const w = Math.round(f.w * zoom) + 2 * PAD;
  const h = Math.round(f.h * zoom) + 2 * PAD;
  const origin = effectiveOrigin(image.asset, image.size);
  useEffect(() => {
    const ctx = ref.current && prepare(ref.current, w, h);
    if (ctx) drawSpriteFrame(ctx, image, frame, zoom, [PAD + origin[0] * zoom, PAD + origin[1] * zoom]);
  }, [image, frame, zoom, w, h, origin[0], origin[1]]);
  return (
    <canvas
      ref={ref}
      aria-label="Frame preview"
      className="cursor-crosshair rounded-sm border"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick([(e.clientX - r.left - PAD) / zoom, (e.clientY - r.top - PAD) / zoom]);
      }}
    />
  );
}
