import { ICON_IDS, resolveStyle, type IconEffect, type StyleIconId } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import { iconBarOf, imageOptions, setIcon, setIconEffect } from "../../model/style.ts";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";
import { Picker } from "../rules/Picker.tsx";
import { useCanvasImages } from "../scene/images.ts";
import { FrameControls, useFrameDraft } from "./FrameControls.tsx";

const ICON_LABEL: Record<StyleIconId, string> = { walk: "Walk", look: "Look", hand: "Hand", talk: "Talk", item: "Item", inventory: "Inventory", settings: "Settings" };
const EFFECTS: { id: IconEffect; label: string }[] = [
  { id: "brighten", label: "Brighten" },
  { id: "darken", label: "Darken" },
];

/**
 * Game Settings > Styling > Icon Bar: the bar's own frame (the same nine-slice editor as Frames, with its
 * own borders), a picture for each of the seven buttons, and the one effect that marks the hovered and the
 * selected button; the shared Styling preview shows the bar in its Icon Bar sample.
 */
export function IconBar({ actions }: { actions: Actions }) {
  const { editor } = actions;
  const p = editor.project;
  const images = useCanvasImages(p);
  const style = p.game?.data.style;
  const saved = iconBarOf(p);
  const bar = resolveStyle(style).iconBar;
  const draft = useFrameDraft(bar.frame.insets, "iconBar");

  const pickIcon = (id: StyleIconId, imageId: string | undefined) => editor.apply(imageId === undefined ? `Use built-in ${ICON_LABEL[id]} icon` : `Pick ${ICON_LABEL[id]} icon`, (q) => setIcon(q, id, imageId));

  return (
    <section aria-label="Icon Bar" className="grid gap-5">
      <header className="grid gap-1">
        <h3 className="text-xl font-semibold">Icon Bar</h3>
        <p className="text-muted-foreground text-[12px]">The bar of buttons across the top of the game. Give it its own frame and a picture for each button; anything you leave out keeps the built-in look.</p>
      </header>
      <div className="grid max-w-3xl gap-8">
        {saved === undefined && <p className="text-muted-foreground text-[12px]">Not customised yet: the bar keeps its original look. Changing anything here starts your own look, with the Brighten effect.</p>}
        <div className="grid gap-3">
          <h4 className="text-[13px] font-semibold">Bar frame</h4>
          <FrameControls actions={actions} which="iconBar" noun="bar frame" frame={bar.frame} images={images} draft={draft} />
        </div>
        <div role="group" aria-label="Button pictures" className="grid gap-1.5">
          <h4 className="text-[13px] font-semibold">Button pictures</h4>
          <p className="text-muted-foreground text-[12px]">Each picture is fitted inside its button, keeping its proportions. Import pictures in the Images library first. The Item picture shows while no inventory item is selected; once you pick up and select an item, the button shows that item.</p>
          {ICON_IDS.map((id) => {
            const imageId = bar.icons[id];
            const missing = imageId !== undefined && !p.assets?.data.images.some((i) => i.id === imageId);
            return (
              <div key={id} className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground w-16 text-[12px]">{ICON_LABEL[id]}</span>
                <Picker label={`${ICON_LABEL[id]} icon image`} value={imageId ?? ""} options={imageOptions(p)} placeholder="Built-in icon" invalid={missing} onPick={(v) => pickIcon(id, v)} />
                {imageId !== undefined && (
                  <Button type="button" variant="ghost" size="sm" aria-label={`Use built-in ${ICON_LABEL[id]} icon`} className="h-7 px-2 text-[13px] font-normal" onClick={() => pickIcon(id, undefined)}>
                    Use built-in
                  </Button>
                )}
                {missing && <span role="alert" className="text-err text-[12px]">That image is no longer in the Images library, so the built-in icon is used.</span>}
              </div>
            );
          })}
        </div>
        <div role="group" aria-label="Hover / Active effect" className="grid gap-1.5">
          <h4 className="text-[13px] font-semibold">Hover / Active effect</h4>
          <div className="flex flex-wrap items-center gap-1">
            {EFFECTS.map((e) => {
              const on = bar.effect === e.id;
              return (
                <Button key={e.id} type="button" size="xs" variant={on ? "secondary" : "ghost"} aria-pressed={on} onClick={() => editor.apply(`Set hover and active effect to ${e.label}`, (q) => setIconEffect(q, e.id))} className={cn("text-[12px]", on && "font-semibold")}>
                  {e.label}
                </Button>
              );
            })}
          </div>
          <p className="text-muted-foreground text-[12px]">Marks the button under the pointer and the selected button, on the picture only; the button behind it does not change.</p>
        </div>
      </div>
    </section>
  );
}
