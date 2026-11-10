import type { ObjectAnimation, SceneObject } from "@questforge/schema";
import { useState } from "react";
import type { Actions } from "../../model/actions.ts";
import {
  addObjectAnimation,
  changeObjectAnimationId,
  deleteObjectAnimation,
  patchObjectAnimation,
  patchObjectLoop,
  removeObjectLoop,
} from "../../model/scene/objectAnimations.ts";
import { formatFrames, frameCountOf, parseFrames } from "../../model/sprites.ts";
import { Button } from "../components/ui/button.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { Prompt } from "../Dialogs.tsx";
import { NumberField } from "../NumberField.tsx";
import { useCanvasImages, type CanvasImages } from "../scene/images.ts";
import { TextField } from "../TextField.tsx";
import { AnimCanvas } from "./AnimCanvas.tsx";

// The object Inspector's animations: one looping animation
// that plays at rest, and named one-shots for play_animation. One undo step each.

const DT = "text-muted-foreground text-[11px] font-medium uppercase tracking-wide";

export function ObjectAnimations({ actions, sceneId, object }: { actions: Actions; sceneId: string; object: SceneObject }) {
  const { editor } = actions;
  const images = useCanvasImages(editor.project);
  const [renaming, setRenaming] = useState<string | null>(null);
  const o = object;
  const key = (field: string) => `${sceneId}:objects:${o.id}:${field}`;
  const blur = () => editor.history.breakMerge();
  return (
    <>
      <section className="grid gap-1.5" aria-label="Looping animation">
        <h4 className={DT}>Looping animation</h4>
        {o.animation ? (
          <>
            <AnimFields
              images={images}
              anim={o.animation}
              loop
              editor={actions}
              fieldKey={(f) => key(`loop:${f}`)}
              onPatch={(label, patch, merge) => editor.apply(label, (q) => patchObjectLoop(q, sceneId, o.id, patch), merge)}
              onBlur={blur}
            />
            <Button
              variant="ghost"
              size="xs"
              className="justify-self-start"
              onClick={() => editor.apply("Remove looping animation", (q) => removeObjectLoop(q, sceneId, o.id))}
            >
              Remove looping animation
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-[12px]">None: the object shows frame 0 of its image.</p>
            <Button
              variant="secondary"
              size="xs"
              className="justify-self-start"
              onClick={() => editor.apply("Add looping animation", (q) => patchObjectLoop(q, sceneId, o.id, {}))}
            >
              Add looping animation
            </Button>
          </>
        )}
      </section>
      <section className="grid gap-1.5" aria-label="One-shot animations">
        <h4 className={DT}>One-shot animations</h4>
        <p className="text-muted-foreground text-[12px]">Played once by a rule's “play animation”, then back to rest.</p>
        {(o.animations ?? []).map((a) => (
          <fieldset key={a.id} className="grid min-w-0 gap-1.5 rounded-md border p-2" aria-label={`Animation ${a.id}`}>
            <div className="flex items-center gap-1">
              <code className="selectable font-mono text-[12px]">{a.id}</code>
              <Button variant="ghost" size="xs" onClick={() => setRenaming(a.id)}>
                Change ID…
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => editor.apply("Delete animation", (q) => deleteObjectAnimation(q, sceneId, o.id, a.id))}
              >
                Delete
              </Button>
            </div>
            <AnimFields
              images={images}
              anim={a}
              editor={actions}
              fieldKey={(f) => key(`anim:${a.id}:${f}`)}
              onPatch={(label, patch, merge) => editor.apply(label, (q) => patchObjectAnimation(q, sceneId, o.id, a.id, patch), merge)}
              onBlur={blur}
            />
          </fieldset>
        ))}
        <Button
          variant="secondary"
          size="xs"
          className="justify-self-start"
          onClick={() => {
            const made = editor.applyWith("Add animation", (q) => addObjectAnimation(q, sceneId, o.id));
            if (made) setRenaming(made.id);
          }}
        >
          Add one-shot animation
        </Button>
      </section>
      {renaming && (
        <Prompt
          title="Change animation ID"
          label="ID (used by rules)"
          initial={renaming}
          action="Change ID"
          onCancel={() => setRenaming(null)}
          onSubmit={(to) => {
            if (editor.apply("Change animation ID", (q) => changeObjectAnimationId(q, sceneId, o.id, renaming, to))) setRenaming(null);
            else if (to === renaming) setRenaming(null);
          }}
        />
      )}
    </>
  );
}

/** Image, frames (as text), fps and a live preview for one object animation. */
function AnimFields(props: {
  images: CanvasImages;
  anim: ObjectAnimation;
  loop?: boolean;
  editor: Actions;
  fieldKey(field: string): string;
  onPatch(label: string, patch: Partial<ObjectAnimation>, mergeKey?: string): void;
  onBlur(): void;
}) {
  const { anim } = props;
  const all = props.editor.editor.project.assets?.data.images ?? [];
  const asset = all.find((i) => i.id === anim.image);
  const count = asset ? frameCountOf(asset) : 1;
  return (
    <div className="flex items-start gap-2">
      <div className="grid flex-1 gap-1.5">
        <div className="grid gap-1">
          <Label className="text-muted-foreground text-[11px] font-normal">Image</Label>
          <Select value={anim.image} onValueChange={(v) => props.onPatch("Change animation image", { image: v })}>
            <SelectTrigger size="sm" aria-label="Animation image" className="h-7 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent onPointerDown={(e) => e.stopPropagation()}>
              {!asset && <SelectItem value={anim.image}>{anim.image} (missing)</SelectItem>}
              {all.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TextField
          label={`Frames (0–${count - 1}, e.g. 0-3)`}
          value={formatFrames(anim.frames)}
          valid={(v) => parseFrames(v, count) !== null}
          onChange={(v) => props.onPatch("Change animation frames", { frames: parseFrames(v, count)! }, props.fieldKey("frames"))}
          onBlur={props.onBlur}
        />
        <NumberField
          label="Frames per second"
          min={0.1}
          max={60}
          value={anim.fps}
          onChange={(fps) => props.onPatch("Change animation speed", { fps }, props.fieldKey("fps"))}
          onBlur={props.onBlur}
        />
      </div>
      <AnimCanvas images={props.images} shown={{ anim: { ...anim, loop: true }, mirror: false, still: false }} box={72} />
    </div>
  );
}
