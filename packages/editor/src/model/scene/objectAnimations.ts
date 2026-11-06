// Object animations in the scene editor (spec 05, D111, D112): one looping animation
// and named one-shots per object. Pure commands; the Inspector runs them through
// `editor.apply`, one undo step each.
import { ObjectAnimation, RenameError, renameObjectAnimation, type NamedObjectAnimation, type Project, type SceneObject } from "@questforge/schema";
import { CommandError, uniqueId } from "../commands.ts";
import { frameCountOf } from "../sprites.ts";
import { updateScene } from "./commands.ts";

const gone = () => new CommandError("That's no longer in the scene.");

function updateObject(p: Project, sceneId: string, id: string, f: (o: SceneObject) => SceneObject): Project {
  return updateScene(p, sceneId, (s) => {
    if (!s.objects.some((o) => o.id === id)) throw gone();
    return { ...s, objects: s.objects.map((o) => (o.id === id ? f(o) : o)) };
  });
}

/** Checks fields an animation is about to get, in plain English. */
function check(p: Project, a: ObjectAnimation) {
  if (!p.assets?.data.images.some((i) => i.id === a.image)) throw new CommandError(`There's no image with ID ${a.image}.`);
  if (a.frames.length === 0) throw new CommandError("An animation needs at least one frame.");
  if (!ObjectAnimation.safeParse({ image: a.image, frames: a.frames, fps: a.fps }).success) throw new CommandError("Frames per second must be more than 0 and at most 60.");
}

/** Changing the image keeps only frames it has (frame 0 if none). */
function retarget(p: Project, base: ObjectAnimation, patch: Partial<ObjectAnimation>): ObjectAnimation {
  const next = { ...base, ...patch };
  if (patch.image && patch.image !== base.image && !patch.frames) {
    const img = p.assets?.data.images.find((i) => i.id === patch.image);
    const kept = next.frames.filter((f) => f < (img ? frameCountOf(img) : 1));
    next.frames = kept.length ? kept : [0];
  }
  return { image: next.image, frames: next.frames, fps: next.fps };
}

/** A new animation of an object starts on its own image: frame 0, 8 fps. */
const starter = (o: SceneObject): ObjectAnimation => ({ image: o.image, frames: [0], fps: 8 });

/** Sets fields of the looping animation, adding it if there's none. */
export function patchObjectLoop(p: Project, sceneId: string, id: string, patch: Partial<ObjectAnimation>): Project {
  return updateObject(p, sceneId, id, (o) => {
    const animation = retarget(p, o.animation ?? starter(o), patch);
    check(p, animation);
    return { ...o, animation };
  });
}

export function removeObjectLoop(p: Project, sceneId: string, id: string): Project {
  return updateObject(p, sceneId, id, ({ animation: _gone, ...o }) => o);
}

/** Adds a one-shot named `anim`, `anim_2`, …; returns its ID. */
export function addObjectAnimation(p: Project, sceneId: string, id: string): { project: Project; id: string } {
  let made = "";
  const project = updateObject(p, sceneId, id, (o) => {
    made = uniqueId("anim", (o.animations ?? []).map((a) => a.id));
    return { ...o, animations: [...(o.animations ?? []), { id: made, ...starter(o) }] };
  });
  return { project, id: made };
}

export function patchObjectAnimation(p: Project, sceneId: string, id: string, animId: string, patch: Partial<ObjectAnimation>): Project {
  return updateObject(p, sceneId, id, (o) => {
    const current = o.animations?.find((a) => a.id === animId);
    if (!current) throw gone();
    const next: NamedObjectAnimation = { id: animId, ...retarget(p, current, patch) };
    check(p, next);
    return { ...o, animations: o.animations!.map((a) => (a === current ? next : a)) };
  });
}

/** Removes a one-shot; rules that play it then show a missing-reference problem (D86). */
export function deleteObjectAnimation(p: Project, sceneId: string, id: string, animId: string): Project {
  return updateObject(p, sceneId, id, ({ animations, ...o }) => {
    const rest = (animations ?? []).filter((a) => a.id !== animId);
    if (rest.length === (animations ?? []).length) throw gone();
    return rest.length ? { ...o, animations: rest } : o;
  });
}

/** Change ID… for a one-shot: updates every `play_animation` that plays it. */
export function changeObjectAnimationId(p: Project, sceneId: string, id: string, from: string, to: string): Project {
  try {
    return renameObjectAnimation(p, sceneId, id, from, to);
  } catch (e) {
    if (e instanceof RenameError) throw new CommandError(e.message);
    throw e;
  }
}
