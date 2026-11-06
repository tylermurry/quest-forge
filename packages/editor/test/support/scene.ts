import type { LoadedImage, Vec } from "@questforge/engine";
import { MemoryFs, saveProject, type Project, type SceneFile } from "@questforge/schema";
import { Editor } from "../../src/model/editor.ts";
import { SceneTools } from "../../src/model/scene/tools.ts";
import { toScreen } from "../../src/model/scene/view.ts";
import { WorkspaceState } from "../../src/model/workspace.ts";
import { m1Project } from "./fixtures.ts";

// Scene editor tests drive the DOM-free controller with pointer input in scene
// coordinates, the way engine session tests drive taps.

/** Image sizes the m1 fixture's PNGs decode to (no DOM, so they're given here). */
export function sizedImages(p: Project, sizes: Record<string, [number, number]> = {}) {
  return (id: string): LoadedImage | undefined => {
    const asset = p.assets?.data.images.find((i) => i.id === id);
    if (!asset) return undefined;
    const [w, h] = sizes[id] ?? [32, 48];
    return { asset, size: { w, h } };
  };
}

export async function sceneEditor(project?: Project, sceneId = "garden", sizes?: Record<string, [number, number]>) {
  const p = project ?? (await m1Project());
  const fs = new MemoryFs();
  await saveProject(fs, { ...p, saved: {}, files: [], savedFolders: [] });
  const editor = await Editor.open({ fs });
  const ws = new WorkspaceState();
  // Always use the editor's current project, so newly added images resolve.
  const images = (id: string) => sizedImages(editor.project, sizes)(id);
  const c = new SceneTools({ editor, ws, scene: sceneId, images });
  c.setSize({ w: 1280, h: 800 });
  ws.sceneUi.setZoom(sceneId, { fit: false, scale: 2, pan: [0, 0] });
  const scene = () => editor.project.scenes.find((s) => s.data.id === c.sceneId)!.data as SceneFile;
  /** Pointer input at a scene point. */
  const at = (p: Vec, extra: Partial<{ alt: boolean; shift: boolean; mod: boolean; clicks: number; button: number }> = {}) => ({
    screen: toScreen(c.transform, p),
    button: 0,
    ...extra,
  });
  const click = (p: Vec, extra: Parameters<typeof at>[1] = {}) => {
    c.pointerDown(at(p, extra));
    c.pointerUp(at(p, extra));
  };
  const drag = (from: Vec, to: Vec, extra: Parameters<typeof at>[1] = {}) => {
    c.pointerDown(at(from, extra));
    c.pointerMove(at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], extra));
    c.pointerMove(at(to, extra));
    c.pointerUp(at(to, extra));
  };
  return { editor, ws, c, fs, scene, at, click, drag, dispose: () => editor.dispose() };
}
