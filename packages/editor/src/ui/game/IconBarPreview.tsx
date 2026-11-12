import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { computeLayout, drawIconBar, hitButton, textStyle, type IconBarLook } from "@questforge/engine";
import { SCENE_WIDTH, type GameStyle } from "@questforge/schema";
import type { CanvasImages } from "../scene/images.ts";

// The Icon Bar preview: the engine's own `drawIconBar`, the function the game draws its bar with, over a fixed
// soft gradient (no background controls) so a frame's or an icon's transparency shows. Pointer hover and a click
// (or the arrow keys) put the bar in its hover and selected states.

/** Scene pixels shown: the bar (at most 56 tall) and some gradient under it. */
const HEIGHT = 96;
/** Pastel stops, so any icon colour and any frame transparency can be judged against several hues. */
const HUES = ["#f4b6c2", "#f9d9a0", "#d3ecb0", "#a8e0d2", "#a9cbf2", "#cdb4ee"];
/** Sample score for the bar's text. */
const SCORE = "Score: 12 of 100";
/** The bar at 1 CSS px per scene px: the largest buttons the game ever draws. */
const LAYOUT = computeLayout(1);
const BUTTONS = LAYOUT.barButtons.map((b) => b.id);

export interface IconBarDraw {
  look: IconBarLook;
  style: GameStyle | undefined;
  family: string;
  /** The decoded image for an asset ID, once loaded. */
  image: (id: string) => CanvasImageSource | undefined;
  selected: string;
  /** Mouse position in scene pixels, or null. */
  hover: readonly [number, number] | null;
}

/** Draws the gradient and the bar into a canvas of SCENE_WIDTH × HEIGHT. */
export function drawIconBarPreview(ctx: CanvasRenderingContext2D, d: IconBarDraw) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const g = ctx.createLinearGradient(0, 0, SCENE_WIDTH, HEIGHT);
  HUES.forEach((c, i) => g.addColorStop(i / (HUES.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCENE_WIDTH, HEIGHT);
  const bar = { layout: LAYOUT, selected: d.selected, itemHeld: false, itemImage: undefined, hover: d.hover ? ([d.hover[0], d.hover[1]] as [number, number]) : null, scoreText: SCORE };
  drawIconBar(ctx, bar, textStyle(d.style, d.family, 100), d.look, d.image);
}

/** Shows the bar as the game draws it. `look` is what is being edited, a guide drag in progress included. */
export function IconBarPreview(props: { look: IconBarLook; style: GameStyle | undefined; images: CanvasImages; family: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const { look, style, images, family } = props;
  const [selected, setSelected] = useState("walk");
  const [hover, setHover] = useState<readonly [number, number] | null>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    // An unattached <img> reports its natural size, and the store only holds an image once it has decoded.
    const image = (id: string) => images.lookup(id)?.el;
    drawIconBarPreview(ctx, { look, style, family, image, selected, hover });
    // Re-draw when any image finishes loading.
  }, [look, style, family, images, images.version, selected, hover]);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - box.left) / box.width) * SCENE_WIDTH, ((e.clientY - box.top) / box.height) * HEIGHT] as const;
  };
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    setSelected((s) => BUTTONS[(BUTTONS.indexOf(s as (typeof BUTTONS)[number]) + step + BUTTONS.length) % BUTTONS.length]!);
  };

  return (
    <div className="grid gap-2" aria-label="Icon bar preview">
      <p className="text-muted-foreground text-[12px]">Move over the bar, or click a button (or press the left and right arrow keys), to see the hovered and selected looks.</p>
      <div className="overflow-hidden rounded-md border">
        <canvas
          ref={canvas}
          width={SCENE_WIDTH}
          height={HEIGHT}
          tabIndex={0}
          role="img"
          aria-label={`Preview of the icon bar. The ${selected} button is selected.`}
          className="block"
          style={{ width: "100%", aspectRatio: `${SCENE_WIDTH} / ${HEIGHT}`, imageRendering: "pixelated" }}
          onPointerMove={(e) => setHover(at(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const p = at(e);
            setHover(p);
            const hit = hitButton(LAYOUT.barButtons, p);
            if (hit) setSelected(hit);
          }}
          onKeyDown={key}
        />
      </div>
    </div>
  );
}
