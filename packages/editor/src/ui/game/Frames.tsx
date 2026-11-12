import { useState } from "react";
import { FRAME_SCALE_MAX, FRAME_SCALE_MIN, NARRATION_WIDTH_MAX, NARRATION_WIDTH_MIN, SCENE_HEIGHT, AUTHOR_DEFAULTS, resolveStyle } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { builtInFrameBytes } from "../../model/builtInFrame.ts";
import { applyBuiltInFrame, isBuiltInFrame, narrationOf, setFrameScale, setNarrationCenter, setNarrationTop, setNarrationWidth } from "../../model/style.ts";
import { useCanvasImages } from "../scene/images.ts";
import { FrameControls, useFrameDraft } from "./FrameControls.tsx";
import { ToggleBar } from "../components/ui/toggle-group.tsx";
import { SliderField } from "./SliderField.tsx";

/**
 * Game Settings > Styling > Frames: one image for every panel of the game (narration, speech, dialogue choices,
 * inventory), cut into a nine-slice frame with guides, and how thick its borders are drawn (Scale), in the Panel
 * Frame part; where narration goes (Top or Center, Width) in the Position part, chosen with a toggle bar. The shared Styling preview sits above. Use default look picks the default frame
 * picture (Styling/frame.jpg), adding it back to the library if it was removed.
 */
const PARTS = [
  { id: "panelFrame", label: "Panel Frame" },
  { id: "position", label: "Position" },
] as const;
type Part = (typeof PARTS)[number]["id"];

export function Frames({ actions }: { actions: Actions }) {
  const [part, setPart] = useState<Part>("panelFrame");
  const { editor } = actions;
  const p = editor.project;
  const images = useCanvasImages(p);
  const style = p.game?.data.style;
  const frame = resolveStyle(style).sharedFrame;
  const draft = useFrameDraft(frame.insets, "sharedFrame");
  const builtIn = { active: isBuiltInFrame(p), use: () => editor.apply("Use default frame", (q) => applyBuiltInFrame(q, builtInFrameBytes())) };
  const narration = narrationOf(p);
  const top = narration?.top ?? AUTHOR_DEFAULTS.narration.top;
  const width = narration?.width ?? AUTHOR_DEFAULTS.narration.width;
  const breakMerge = () => editor.history.breakMerge();

  const scale = (
    <SliderField
      label="Scale"
      min={FRAME_SCALE_MIN}
      max={FRAME_SCALE_MAX}
      value={frame.scale}
      unit="px"
      unitName="pixels"
      onChange={(n) => editor.apply("Change frame scale", (q) => setFrameScale(q, n), "style:sharedFrame:scale")}
      onBlur={breakMerge}
    />
  );

  return (
    <section aria-label="Frames">
      {/* The toggle bar sits beside the heading, not under it, to leave the most height for the settings. */}
      <div className="grid max-w-3xl gap-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h3 className="text-xl font-semibold">Frames</h3>
          <ToggleBar<Part> label="Frames sections" value={part} options={PARTS} onChange={setPart} />
        </div>
        {part === "panelFrame" ? (
          <div className="grid gap-3">
            <FrameControls actions={actions} which="sharedFrame" noun="frame" frame={frame} images={images} draft={draft} builtIn={builtIn} belowBorder={scale} />
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <SliderField
                  label="Top"
                  min={0}
                  max={SCENE_HEIGHT}
                  value={top}
                  unit="px"
                  unitName="pixels"
                  disabled={narration?.center === true}
                  onChange={(n) => editor.apply("Change narration top", (q) => setNarrationTop(q, n), "style:narration:top")}
                  onBlur={breakMerge}
                />
              </div>
              <label className="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox" checked={narration?.center === true} onChange={(e) => editor.apply(e.target.checked ? "Center narration" : "Stop centering narration", (q) => setNarrationCenter(q, e.target.checked))} />
                Center
              </label>
            </div>
            <SliderField
              label="Width"
              min={NARRATION_WIDTH_MIN}
              max={NARRATION_WIDTH_MAX}
              value={width}
              unit="%"
              unitName="percent of the screen"
              onChange={(n) => editor.apply("Change narration width", (q) => setNarrationWidth(q, n), "style:narration:width")}
              onBlur={breakMerge}
            />
          </div>
        )}
      </div>
    </section>
  );
}
