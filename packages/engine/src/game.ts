import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  formatProblem,
  hasBlockingErrors,
  validateProject,
  type CharacterFile,
  type Problem,
  type Project,
  type SceneFile,
} from "@questforge/schema";
import { drawLoading, drawSession, present, type DebugFlags } from "./render.ts";
import { Session } from "./session.ts";
import { sheetFits } from "./sprite.ts";
import { FixedStep, fitViewport, toScene } from "./viewport.ts";
import type { LoadedImage, World } from "./world.ts";

// The engine entry point (spec 03): data in, no user code.

/** Everything the engine needs to play: the parsed project and where its files are served. */
export interface ProjectBundle {
  project: Project;
  /** URL for a project-relative asset path, e.g. `assets/images/beach.png`. */
  assetUrl(path: string): string;
}

export interface GameOptions {
  /** Start somewhere other than `game.startScene` / `game.startSpawn` (playtest "from here"). */
  scene?: string;
  spawn?: string;
  debug?: Partial<DebugFlags>;
}

export interface Game {
  /** Resolves once the first scene's assets are loaded and play has begun. */
  readonly ready: Promise<void>;
  /** The game being played, once loaded. */
  readonly session: Session | null;
  /** The playing scene, once loaded. */
  readonly world: World | null;
  readonly debug: DebugFlags;
  destroy(): void;
}

/** Thrown when a project has blocking validation errors (D38). */
export class ProjectErrors extends Error {
  constructor(readonly problems: Problem[]) {
    super(`This project has ${problems.length} problem(s) to fix before it can play:\n${problems.map(formatProblem).join("\n")}`);
  }
}

export function createGame(bundle: ProjectBundle, canvas: HTMLCanvasElement, options: GameOptions = {}): Game {
  const { project } = bundle;
  const problems = validateProject(project);
  if (hasBlockingErrors(problems)) throw new ProjectErrors(problems);
  const game = project.game!.data; // present: validation reports a missing game.yaml
  const sceneId = options.scene ?? game.startScene;
  const scene = project.scenes.find((s) => s.data.id === sceneId)?.data;
  if (!scene) throw new Error(`Scene ${sceneId} doesn't exist`);
  const characters = new Map<string, CharacterFile>(project.characters.map((c) => [c.data.id, c.data]));

  const screen = canvas.getContext("2d")!;
  const back = document.createElement("canvas");
  back.width = SCENE_WIDTH;
  back.height = SCENE_HEIGHT;
  const backCtx = back.getContext("2d")!;
  const debug: DebugFlags = { overlay: false, ...options.debug };

  let session: Session | null = null;
  let images = new Map<string, LoadedImage>();
  let progress = 0;
  let viewport = fitViewport(canvas.width, canvas.height);
  let destroyed = false;
  let raf = 0;

  // Size the canvas to its CSS box in device pixels so nearest-neighbor stays crisp.
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    viewport = fitViewport(canvas.width, canvas.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const scenePoint = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return toScene(viewport, ((e.clientX - rect.left) / rect.width) * canvas.width, ((e.clientY - rect.top) / rect.height) * canvas.height);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!session) return;
    e.preventDefault();
    if (e.button === 2) {
      session.secondaryClick();
      return;
    }
    if (e.button !== 0) return;
    if (session.ending) {
      session.restart();
      return;
    }
    const p = scenePoint(e);
    if (p) session.primaryClick(p);
  };
  const onContextMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.style.touchAction = "none";

  const loop = new FixedStep((dt) => session?.tick(dt));
  const frame = (now: number) => {
    if (destroyed) return;
    loop.advance(now);
    if (session) drawSession(backCtx, session, images.get(session.scene.background)?.el, debug);
    else drawLoading(backCtx, progress);
    present(screen, back, viewport);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // M2 T4: every scene's images up front; T5 loads per scene with prefetch.
  const ready = Promise.all(project.scenes.map((s) => loadSceneImages(project, s.data, characters, bundle.assetUrl, (p) => (progress = p)))).then((maps) => {
    if (destroyed) return;
    images = new Map(maps.flatMap((m) => [...m]));
    session = new Session(project, (id) => images.get(id), { ...(options.scene ? { scene: options.scene } : {}), ...(options.spawn ? { spawn: options.spawn } : {}) });
  });

  return {
    ready,
    get session() {
      return session;
    },
    get world() {
      return session?.world ?? null;
    },
    debug,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
    },
  };
}

/** Image IDs a scene needs: background, objects, and every character placed in it (plus the player). */
export function sceneImageIds(scene: SceneFile, characters: Map<string, CharacterFile>, player: string): string[] {
  const ids = new Set([scene.background, ...scene.objects.map((o) => o.image)]);
  for (const id of [player, ...scene.characters.map((c) => c.character)]) {
    for (const anim of Object.values(characters.get(id)?.animations ?? {})) if (anim) ids.add(anim.image);
  }
  return [...ids];
}

/** Preloads a scene's images (spec 03), reporting progress from 0 to 1. */
async function loadSceneImages(
  project: Project,
  scene: SceneFile,
  characters: Map<string, CharacterFile>,
  assetUrl: (path: string) => string,
  onProgress: (p: number) => void,
): Promise<Map<string, LoadedImage>> {
  const assets = new Map(project.assets!.data.images.map((a) => [a.id, a]));
  const ids = sceneImageIds(scene, characters, project.game!.data.player);
  const out = new Map<string, LoadedImage>();
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      const asset = assets.get(id)!;
      const el = new Image();
      el.src = assetUrl(asset.path);
      await el.decode();
      const size = { w: el.naturalWidth, h: el.naturalHeight };
      if (!sheetFits(asset, size)) console.warn(`Image ${id}: its sheet is larger than the ${size.w}×${size.h} image.`);
      out.set(id, { asset, size, el });
      onProgress(++done / ids.length);
    }),
  );
  return out;
}
