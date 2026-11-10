// Per-scene editor UI state: active layer and tool, shown/locked layers,
// snapping, live aids and zoom. Never undone, never game data; kept in
// `.editor/view.json`. DOM-free.
import type { ProjectFs } from "@questforge/schema";
import type { Zoom } from "./view.ts";

/** The fixed layer stack, top to bottom. */
export const LAYERS = ["guides", "regions", "hotspots", "walkable", "objects", "background"] as const;
export type Layer = (typeof LAYERS)[number];

export const LAYER_LABEL: Record<Layer, string> = {
  guides: "Guides",
  regions: "Regions",
  hotspots: "Hotspots",
  walkable: "Walkable",
  objects: "Objects",
  background: "Background",
};

const TOOLS = ["select", "polygon", "rect", "spawn", "walkto"] as const;
export type Tool = (typeof TOOLS)[number];

export const TOOL_LABEL: Record<Tool, string> = {
  select: "Select / Move",
  polygon: "Polygon",
  rect: "Rectangle",
  spawn: "Spawn point",
  walkto: "Walk-to point",
};

/** The selected layer decides which tools are available. */
export const LAYER_TOOLS: Record<Layer, readonly Tool[]> = {
  guides: ["select", "spawn"],
  regions: ["select", "polygon", "rect"],
  hotspots: ["select", "polygon", "rect", "walkto"],
  walkable: ["select", "polygon", "rect"],
  objects: ["select", "polygon", "rect"],
  background: ["select"],
};

export interface Aids {
  /** Depth-preview ghost of the player. */
  ghost: boolean;
  /** Shade the walkable area. */
  shading: boolean;
  /** Path from the default spawn to the cursor. */
  path: boolean;
}

export interface SceneUi {
  layer: Layer;
  tool: Tool;
  hidden: Layer[];
  locked: Layer[];
  snap: boolean;
  aids: Aids;
  zoom: Zoom;
}

const defaultSceneUi = (): SceneUi => ({
  layer: "walkable",
  tool: "select",
  hidden: [],
  locked: [],
  snap: true,
  aids: { ghost: true, shading: true, path: true },
  zoom: { fit: true },
});

export const VIEW_FILE = ".editor/view.json";
/** view.json is written this long after the last change. */
export const VIEW_SAVE_DELAY_MS = 500;

const isLayer = (x: unknown): x is Layer => (LAYERS as readonly unknown[]).includes(x);
const isTool = (x: unknown): x is Tool => (TOOLS as readonly unknown[]).includes(x);

/** Reads one scene's saved state, ignoring anything unexpected (the file is ours, but may be stale). */
function readSceneUi(raw: unknown): SceneUi {
  const d = defaultSceneUi();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const layers = (x: unknown) => (Array.isArray(x) ? x.filter(isLayer) : []);
  const aids = (r.aids ?? {}) as Record<string, unknown>;
  const z = r.zoom as Record<string, unknown> | undefined;
  const pan = z?.pan;
  const zoom: Zoom =
    z && z.fit === false && typeof z.scale === "number" && Array.isArray(pan) && pan.length === 2 && pan.every((n) => typeof n === "number")
      ? { fit: false, scale: z.scale, pan: [pan[0] as number, pan[1] as number] }
      : { fit: true };
  const layer = isLayer(r.layer) ? r.layer : d.layer;
  const tool = isTool(r.tool) && LAYER_TOOLS[layer].includes(r.tool) ? r.tool : "select";
  return {
    layer,
    tool,
    hidden: layers(r.hidden),
    locked: layers(r.locked),
    snap: typeof r.snap === "boolean" ? r.snap : d.snap,
    aids: {
      ghost: typeof aids.ghost === "boolean" ? aids.ghost : d.aids.ghost,
      shading: typeof aids.shading === "boolean" ? aids.shading : d.aids.shading,
      path: typeof aids.path === "boolean" ? aids.path : d.aids.path,
    },
    zoom,
  };
}

export class SceneUiStore {
  private scenes = new Map<string, SceneUi>();
  private _version = 0;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private fs: ProjectFs | null = null;

  get version() {
    return this._version;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  get(scene: string): SceneUi {
    return this.scenes.get(scene) ?? defaultSceneUi();
  }

  update(scene: string, f: (ui: SceneUi) => SceneUi) {
    const next = f(this.get(scene));
    // Keep the tool valid for the layer.
    if (!LAYER_TOOLS[next.layer].includes(next.tool)) next.tool = "select";
    this.scenes.set(scene, next);
    this._version++;
    for (const l of this.listeners) l();
    this.scheduleSave();
  }

  setLayer(scene: string, layer: Layer) {
    this.update(scene, (ui) => ({ ...ui, layer }));
  }

  setTool(scene: string, tool: Tool) {
    this.update(scene, (ui) => (LAYER_TOOLS[ui.layer].includes(tool) ? { ...ui, tool } : ui));
  }

  toggleHidden(scene: string, layer: Layer) {
    this.update(scene, (ui) => ({ ...ui, hidden: toggle(ui.hidden, layer) }));
  }

  toggleLocked(scene: string, layer: Layer) {
    this.update(scene, (ui) => ({ ...ui, locked: toggle(ui.locked, layer) }));
  }

  setZoom(scene: string, zoom: Zoom) {
    this.update(scene, (ui) => ({ ...ui, zoom }));
  }

  /** A scene's ID changed: its view follows. */
  renamed(from: string, to: string) {
    const ui = this.scenes.get(from);
    if (!ui) return;
    this.scenes.delete(from);
    this.scenes.set(to, ui);
    this.scheduleSave();
  }

  toJSON(): string {
    return `${JSON.stringify({ scenes: Object.fromEntries([...this.scenes].sort(([a], [b]) => a.localeCompare(b))) }, null, 2)}\n`;
  }

  /** Loads saved view state (missing or broken file: defaults) and saves future changes there. */
  async attach(fs: ProjectFs) {
    this.fs = fs;
    // No view.json yet (first open), or it can't be read: start from defaults.
    const text = await fs.readText(VIEW_FILE).catch(() => null);
    if (text === null) return;
    try {
      const raw = JSON.parse(text) as { scenes?: Record<string, unknown> };
      for (const [id, s] of Object.entries(raw.scenes ?? {})) this.scenes.set(id, readSceneUi(s));
      this._version++;
      for (const l of this.listeners) l();
    } catch {
      // A broken view file only loses zoom and layer toggles.
    }
  }

  private scheduleSave() {
    if (!this.fs) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), VIEW_SAVE_DELAY_MS);
  }

  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    // Stays silent on purpose: view.json only holds zoom and layer toggles, which fall back to
    // defaults next time, so an error notice on every pan or zoom would cost more than the loss.
    if (this.fs) await this.fs.writeText(VIEW_FILE, this.toJSON()).catch(() => undefined);
  }

  detach() {
    if (this.saveTimer) void this.flush();
    this.fs = null;
  }
}

const toggle = <T>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

const isHiddenLayer = (ui: SceneUi, layer: Layer) => ui.hidden.includes(layer);
const isLockedLayer = (ui: SceneUi, layer: Layer) => ui.locked.includes(layer);
/** A layer whose contents can be clicked and edited. */
export const isEditable = (ui: SceneUi, layer: Layer) => !isHiddenLayer(ui, layer) && !isLockedLayer(ui, layer);
