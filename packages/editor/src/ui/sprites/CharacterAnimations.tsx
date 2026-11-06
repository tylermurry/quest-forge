import { frameAt, type LoadedImage } from "@questforge/engine";
import type { Animation, AnimationSlot, CharacterFile } from "@questforge/schema";
import { useEffect, useRef, useState } from "react";
import type { Actions } from "../../model/actions.ts";
import { SLOT_DIRS, SLOT_KINDS, defaultSlotImage, patchSlot, pickFrames, rowFrames, setMirrorLeft, setSlot, slotLabel, slotOf, slotView, splitSlot } from "../../model/animations.ts";
import { cellAt, effectiveOrigin, fitZoom, frameSizeOf } from "../../model/sprites.ts";
import { Button } from "../components/ui/button.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { cn } from "../lib/utils.ts";
import { NumberField } from "../NumberField.tsx";
import { useCanvasImages, type CanvasImages } from "../scene/images.ts";
import { drawSheet, drawSpriteFrame, prepare } from "./draw.ts";

// The character tab's animation editor (spec 05, D39): a grid of the twelve
// idle/walk/talk × direction slots, each previewed as the engine plays it, and an
// editor for the selected slot. Every change is one undo step (D84).

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const PICKER_BOX = { w: 520, h: 300 };

export function CharacterAnimations({ actions, character }: { actions: Actions; character: CharacterFile }) {
  const { editor } = actions;
  const images = useCanvasImages(editor.project);
  const [slot, setSlotSel] = useState<AnimationSlot>("walk_down");
  const id = character.id;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          className="accent-primary size-3.5"
          checked={character.mirrorLeft}
          onChange={(e) => editor.apply(e.target.checked ? "Mirror left from right" : "Draw left separately", (p) => setMirrorLeft(p, id, e.target.checked))}
        />
        Left mirrors right
      </label>
      <table className="w-fit border-separate border-spacing-1" aria-label="Animation slots">
        <thead>
          <tr>
            <th />
            {SLOT_DIRS.map((d) => (
              <th key={d} className="text-muted-foreground text-left text-[11px] font-normal">
                {cap(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOT_KINDS.map((k) => (
            <tr key={k}>
              <th className="text-muted-foreground pr-1 text-left text-[11px] font-normal">{cap(k)}</th>
              {SLOT_DIRS.map((d) => {
                const s = slotOf(k, d);
                const view = slotView(character, s);
                return (
                  <td key={d}>
                    <button
                      aria-label={`Slot ${s}`}
                      aria-pressed={s === slot}
                      onClick={() => setSlotSel(s)}
                      className={cn(
                        "flex w-36 items-center gap-2 rounded-md border p-1 text-left",
                        s === slot ? "border-primary bg-primary/10" : "hover:bg-muted/60",
                        !view.own && "border-dashed",
                      )}
                    >
                      <AnimCanvas images={images} shown={view.shown} box={40} />
                      <span className={cn("text-[11px] leading-tight", !view.own && "text-muted-foreground")}>{slotLabel(view, s)}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <SlotEditor key={slot} actions={actions} character={character} slot={slot} images={images} />
    </div>
  );
}

function SlotEditor({ actions, character, slot, images }: { actions: Actions; character: CharacterFile; slot: AnimationSlot; images: CanvasImages }) {
  const { editor } = actions;
  const p = editor.project;
  const id = character.id;
  const view = slotView(character, slot);
  const own = view.own;
  const [anchor, setAnchor] = useState<number | undefined>(own?.frames[0]);
  const [, dir] = splitSlot(slot);
  const mirroredAway = dir === "left" && character.mirrorLeft;
  const imageId = own?.image ?? defaultSlotImage(p, id);
  const loaded = imageId ? images.lookup(imageId) : undefined;
  const asset = p.assets?.data.images.find((i) => i.id === imageId);
  const allImages = p.assets?.data.images ?? [];
  const patch = (label: string, change: Partial<Animation>, key?: string) => editor.apply(label, (q) => patchSlot(q, id, slot, change), key);

  if (mirroredAway) {
    return (
      <section aria-label="Slot editor" className="flex items-start gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{slot}</h3>
          <p className="text-muted-foreground max-w-sm text-[13px]">
            Drawn as {slot.replace(/_left$/, "_right")} mirrored around the origin. Turn off “Left mirrors right” to give left its own frames.
          </p>
        </div>
        <AnimCanvas images={images} shown={view.shown} box={160} />
      </section>
    );
  }

  return (
    <section aria-label="Slot editor" className="flex flex-wrap items-start gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{slot}</h3>
          {own && (
            <Button variant="ghost" size="xs" onClick={() => editor.apply("Clear animation slot", (q) => setSlot(q, id, slot, null))}>
              Clear slot
            </Button>
          )}
        </div>
        {!own && <p className="text-muted-foreground text-[12px]">{slotLabel(view, slot)}. Pick frames to fill this slot.</p>}
        <div className="flex items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-muted-foreground text-[11px] font-normal">Image</Label>
            <Select value={imageId ?? ""} onValueChange={(v) => patch("Change animation image", { image: v })}>
              <SelectTrigger size="sm" aria-label="Image" className="w-48 text-[13px]">
                <SelectValue placeholder="Choose an image" />
              </SelectTrigger>
              <SelectContent>
                {allImages.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.id}
                    {i.sheet ? ` (${i.sheet.columns}×${i.sheet.rows})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumberField
            label="Frames per second"
            min={0.1}
            max={60}
            step={1}
            value={own?.fps ?? 8}
            onChange={(fps) => patch("Change animation speed", { fps }, `slot:${id}:${slot}:fps`)}
            onBlur={() => editor.history.breakMerge()}
            className="w-28"
          />
          <label className="flex h-7 items-center gap-2 text-[13px]">
            <input type="checkbox" className="accent-primary size-3.5" checked={own?.loop ?? true} onChange={(e) => patch(e.target.checked ? "Loop animation" : "Play animation once", { loop: e.target.checked })} />
            Loop
          </label>
        </div>
        {asset && loaded && (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground mr-1 text-[11px]">Take a row:</span>
              {Array.from({ length: asset.sheet?.rows ?? 1 }, (_, r) => (
                <Button key={r} variant="outline" size="xs" onClick={() => patch("Pick animation frames", { image: asset.id, frames: rowFrames(asset, r) })}>
                  Row {r + 1}
                </Button>
              ))}
            </div>
            <FramePicker
              image={{ ...loaded, asset }}
              frames={own && own.image === asset.id ? own.frames : []}
              onPick={(cell, mods) => {
                const frames = pickFrames(own?.frames ?? [], cell, mods, anchor);
                if (!mods.range) setAnchor(cell);
                patch("Pick animation frames", { image: asset.id, frames });
              }}
            />
            <p className="text-muted-foreground text-[11px]" aria-label="Frames">
              {own ? `Frames ${own.frames.join(", ")}` : "No frames yet"} · click a frame, shift-click for a run, {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}-click to add or remove one
            </p>
          </>
        )}
        {imageId && !loaded && <p className="text-muted-foreground text-[12px]">Loading {imageId}…</p>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[11px]">Preview (as in the game)</span>
        <AnimCanvas images={images} shown={view.shown} box={160} />
      </div>
    </section>
  );
}

/** The sheet with the slot's frames outlined; clicks pick frames. */
function FramePicker({ image, frames, onPick }: { image: LoadedImage; frames: number[]; onPick(cell: number, mods: { range: boolean; toggle: boolean }): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoom = fitZoom(image.size, PICKER_BOX);
  const w = Math.round(image.size.w * zoom);
  const h = Math.round(image.size.h * zoom);
  useEffect(() => {
    const ctx = ref.current && prepare(ref.current, w, h);
    if (ctx) drawSheet(ctx, image, zoom, frames);
  }, [image, zoom, w, h, frames]);
  return (
    <canvas
      ref={ref}
      aria-label="Frame picker"
      className="cursor-pointer rounded-sm border"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const cell = cellAt(image.asset, image.size, [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]);
        if (cell !== null) onPick(cell, { range: e.shiftKey, toggle: e.metaKey || e.ctrlKey });
      }}
    />
  );
}

/**
 * A slot playing as the engine plays it (frameAt, mirrored around the origin, D39),
 * with its feet on a fixed point and the origin marked. Redraws every frame while shown.
 */
function AnimCanvas({ images, shown, box }: { images: CanvasImages; shown: ReturnType<typeof slotView>["shown"]; box: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = shown ? images.lookup(shown.anim.image) : undefined;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!shown || !image) {
      prepare(canvas, box, box);
      return;
    }
    const f = frameSizeOf(image.asset, image.size);
    const pad = box >= 100 ? 12 : 3;
    const zoom = fitZoom(f, { w: box - 2 * pad, h: box - 2 * pad }, 12);
    const origin = effectiveOrigin(image.asset, image.size);
    // Feet where an unmirrored frame would sit centred, so mirroring visibly keeps them put.
    const feet: [number, number] = [(box - f.w * zoom) / 2 + origin[0] * zoom, (box - f.h * zoom) / 2 + origin[1] * zoom];
    const start = performance.now();
    let raf = 0;
    const draw = () => {
      const ctx = prepare(canvas, box, box);
      if (!ctx) return; // no 2D canvas (tests)
      const frame = shown.still ? shown.anim.frames[0]! : frameAt(shown.anim, (performance.now() - start) / 1000);
      drawSpriteFrame(ctx, image, frame, zoom, feet, shown.mirror);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [shown?.anim, shown?.mirror, shown?.still, image, box]);
  return <canvas ref={ref} aria-hidden className="shrink-0 rounded-sm" />;
}
