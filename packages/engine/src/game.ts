import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  formatProblem,
  hasBlockingErrors,
  resolveStyle,
  validateProject,
  type CharacterFile,
  type ImageAsset,
  type Problem,
  type Project,
  type SceneFile,
} from "@questforge/schema";
import { AudioSync, sceneAudioIds } from "./audio.ts";
import { DEBUG_OFF, type DebugFlags } from "./debug.ts";
import { drawLoading, drawSession, present } from "./render.ts";
import { SaveSlots, readSettings, writeSettings, type KeyValueStore } from "./saves.ts";
import { loadStyleAssets, resolveFontFamily, type LoadedFont } from "./styleassets.ts";
import { Session, linkedScenes, type SessionStart } from "./session.ts";
import type { GameState } from "./state.ts";
import type { Trace } from "./trace.ts";
import { PlayerUi, type PointerKind } from "./ui/controller.ts";
import { textStyle } from "./ui/typography.ts";
import { sheetProblem } from "./sprite.ts";
import { FixedStep, fitViewport, toScene } from "./viewport.ts";
import { WebAudio } from "./webaudio.ts";
import type { LoadedImage, World } from "./world.ts";

// The engine entry point: data in, no user code.

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
  /** Start from a saved state (playtest presets and Restart scene). Wins over `scene`/`spawn`. */
  state?: GameState;
  /** Playtest "Play from this node": play this dialogue once the scene is entered. */
  dialogue?: { id: string; node?: string };
  /** Playtest event log sink; the exported game passes none. */
  trace?: Trace;
  /** Playtest: what the in-game Restart button does instead. */
  restart?: () => void;
  /** Playtest debug layers, changeable while playing through `Game.debug`. */
  debug?: Partial<DebugFlags>;
  /** Scale to fill the canvas instead of whole multiples (the editor's playtest area). Still letterboxed. */
  fill?: boolean;
  /** Where save slots and volumes are kept. Default: the page's localStorage; null turns saving off. */
  storage?: KeyValueStore | null;
  /** Play sound (default true). */
  audio?: boolean;
}

export interface Game {
  /** Resolves once the first scene's assets are loaded and play has begun. */
  readonly ready: Promise<void>;
  /** The game being played, once loaded. */
  readonly session: Session | null;
  /** Its player UI (icon bar, inventory), once loaded. */
  readonly ui: PlayerUi | null;
  /** The playing scene, once loaded. */
  readonly world: World | null;
  readonly debug: DebugFlags;
  /** CSS font-family for the game's text: the custom font once loaded, else the built-in family. */
  readonly fontFamily: string;
  /** Audio state, for debugging: has a gesture unlocked it, and which track is sounding. Null with `audio: false`. */
  readonly audio: { readonly unlocked: boolean; readonly playing: string | null } | null;
  destroy(): void;
}

/** Thrown when a project has blocking validation errors. */
export class ProjectErrors extends Error {
  constructor(readonly problems: Problem[]) {
    super(`This project has ${problems.length} problem(s) to fix before it can play:\n${problems.map(formatProblem).join("\n")}`);
  }
}

/** Numbers font family names, so no two loaded fonts share one. */
let fontNumber = 0;

/**
 * Loads a font file and registers it with `doc` under a family name of its own, ready to draw with.
 * Rejects when the file can't be fetched or decoded. The editor's Styling preview uses this too.
 */
export async function registerFont(doc: Document, url: string, id: string): Promise<LoadedFont> {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view?.FontFace) throw new Error("this browser can't load custom fonts");
  // One family name per load, so a restarted game never shares a name with the one it replaces.
  const family = `qf-font-${id}-${++fontNumber}`;
  const face = new view.FontFace(family, `url("${url}")`);
  await face.load();
  doc.fonts.add(face);
  return { family, release: () => doc.fonts.delete(face) };
}

export function createGame(bundle: ProjectBundle, canvas: HTMLCanvasElement, options: GameOptions = {}): Game {
  const { project } = bundle;
  const problems = validateProject(project);
  if (hasBlockingErrors(problems)) throw new ProjectErrors(problems);
  const game = project.game!.data; // present: validation reports a missing game.yaml
  const sceneId = options.state?.scene ?? options.scene ?? game.startScene;
  const scene = project.scenes.find((s) => s.data.id === sceneId)?.data;
  if (!scene) throw new Error(`Scene ${sceneId} doesn't exist`);
  const characters = new Map<string, CharacterFile>(project.characters.map((c) => [c.data.id, c.data]));

  // The canvas's own window drives frames and pixel ratio, so a game in a pop-up
  // window (the editor's playtest) keeps animating while its opener is hidden.
  const view = (canvas.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
  const screen = canvas.getContext("2d")!;
  const back = document.createElement("canvas");
  back.width = SCENE_WIDTH;
  back.height = SCENE_HEIGHT;
  const backCtx = back.getContext("2d")!;
  const debug: DebugFlags = { ...DEBUG_OFF, ...options.debug };

  let session: Session | null = null;
  let ui: PlayerUi | null = null;
  // Images load before the session exists, so their problems wait here until it can note them.
  const earlyNotes: string[] = [];
  const note = (m: string) => (session ? session.note(m) : earlyNotes.push(m));
  const images = new ImageCache(project, characters, bundle.assetUrl, note);
  let viewport = fitViewport(canvas.width, canvas.height);
  const storage = options.storage !== undefined ? options.storage : pageStorage(view);
  const settings = readSettings(storage, game.id);
  const audio = options.audio === false ? null : new WebAudio(project.assets!.data.audio, bundle.assetUrl, view, (m) => session?.note(m));
  const audioSync = audio ? new AudioSync(audio) : null;
  audioSync?.setVolumes(settings);
  let audioScene: string | null = null;
  let destroyed = false;
  let raf = 0;
  let fontFamily = resolveFontFamily(resolveStyle(game.style).typography, null);
  let releaseFont = () => {};
  /** Registers a font asset with the canvas's own document, ready before any text is laid out. */
  const loadFont = async (id: string): Promise<LoadedFont> => {
    const asset = project.assets!.data.fonts?.find((f) => f.id === id);
    if (!asset) throw new Error(`there is no font asset ${id}`);
    return registerFont(doc, bundle.assetUrl(asset.path), id);
  };

  // Size the canvas to its CSS box in device pixels so nearest-neighbor stays crisp.
  const resize = () => {
    const dpr = view.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    viewport = fitViewport(canvas.width, canvas.height, dpr, options.fill);
    // CSS px per scene px, for the 44 CSS px minimum.
    ui?.setScale(viewport.scale / dpr);
  };
  const observer = new view.ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const scenePoint = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return toScene(viewport, ((e.clientX - rect.left) / rect.width) * canvas.width, ((e.clientY - rect.top) / rect.height) * canvas.height);
  };
  const kindOf = (e: PointerEvent): PointerKind => (e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse");
  const onPointerDown = (e: PointerEvent) => {
    audio?.unlock();
    if (!ui) return;
    e.preventDefault();
    // Keep the moves and the release of a touch even if it leaves the canvas.
    // Capture can fail (e.g. the pointer already ended); input must not depend on it.
    if (e.pointerType !== "mouse") {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore: without capture we still get the events over the canvas.
      }
    }
    ui.pointerDown(scenePoint(e), kindOf(e), e.button);
  };
  const onPointerMove = (e: PointerEvent) => ui?.pointerMove(scenePoint(e), kindOf(e));
  const onPointerUp = (e: PointerEvent) => {
    // iOS counts pointerup (not a touch's pointerdown) as the gesture that may start audio.
    audio?.unlock();
    ui?.pointerUp(scenePoint(e), kindOf(e));
  };
  const onPointerCancel = () => ui?.pointerCancel();
  const onPointerLeave = (e: PointerEvent) => e.pointerType === "mouse" && ui?.pointerMove(null, "mouse");
  const onContextMenu = (e: Event) => e.preventDefault();
  const listeners = [
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["pointercancel", onPointerCancel],
    ["pointerleave", onPointerLeave],
    ["contextmenu", onContextMenu],
  ] as const;
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn as EventListener);
  canvas.style.touchAction = "none";
  const doc = canvas.ownerDocument;
  const onVisibility = () => audio?.setHidden(doc.visibilityState === "hidden");
  doc.addEventListener("visibilitychange", onVisibility);
  // The cursor is drawn in the back buffer.
  canvas.style.cursor = "none";

  const loop = new FixedStep((dt) => {
    session?.tick(dt);
    ui?.tick(dt);
  });
  /** Music and sounds follow the session; a new scene's audio is fetched on entry. */
  const syncAudio = () => {
    if (!session || !audio || !audioSync) return;
    if (session.scene.id !== audioScene) {
      audioScene = session.scene.id;
      const linked = linkedSceneFiles(session);
      audio.prefetch([...sceneAudioIds(session.scene), ...linked.flatMap((sc) => (sc.music === undefined ? [] : [sc.music]))]);
    }
    audioSync.update(session);
  };
  const frame = (now: number) => {
    if (destroyed) return;
    loop.advance(now);
    syncAudio();
    const loading = session ? session.loading : scene;
    // The game's typography, the font that loaded, and the player's Text Size.
    const text = textStyle(game.style, fontFamily, ui?.settings.textSize ?? settings.textSize);
    if (session && ui && !loading) drawSession(backCtx, ui, (id) => images.loaded.get(id)?.el, (session.scene.background === undefined ? undefined : images.loaded.get(session.scene.background)?.el), debug, text);
    else drawLoading(backCtx, loading ? images.progress(loading) : 0, text);
    present(screen, back, viewport);
    raf = view.requestAnimationFrame(frame);
  };
  raf = view.requestAnimationFrame(frame);

  // The first scene (and every item icon) before play starts; later scenes load on
  // change_scene and are prefetched on entry.
  const itemIcons = project.items.map((i) => i.data.icon);
  // The skin's images and font come with the game, not with a scene, and load before the first
  // text layout. A failure falls back (loadStyleAssets never rejects), so it can't hold up startup.
  const style = resolveStyle(game.style);
  const warnStyle = (m: string) => {
    console.warn(m);
    note(m);
  };
  const styleLoaded = loadStyleAssets(
    style,
    { loadImage: (id) => images.load([id]), loadFont },
    warnStyle,
  );
  const ready = Promise.all([images.loadScene(scene), images.load(itemIcons), styleLoaded]).then(([, , styleAssets]) => {
    fontFamily = styleAssets.fontFamily;
    releaseFont = styleAssets.release;
    if (destroyed) return releaseFont();
    const start: SessionStart = {
      ...(options.scene ? { scene: options.scene } : {}),
      ...(options.spawn ? { spawn: options.spawn } : {}),
      ...(options.state ? { state: options.state } : {}),
      ...(options.dialogue ? { dialogue: options.dialogue } : {}),
    };
    session = new Session(project, (id) => images.loaded.get(id), start, { ready: images.ready, prefetch: images.prefetch }, { ...(options.trace ? { trace: options.trace } : {}), ...(options.restart ? { restart: options.restart } : {}) });
    for (const m of earlyNotes.splice(0)) session.note(m);
    ui = new PlayerUi(session, {
      slots: new SaveSlots(storage, game),
      settings,
      onSettings: (next) => {
        audioSync?.setVolumes(next);
        writeSettings(storage, game.id, next);
      },
    });
    resize();
  });

  return {
    ready,
    get session() {
      return session;
    },
    get ui() {
      return ui;
    },
    get world() {
      return session?.world ?? null;
    },
    debug,
    get fontFamily() {
      return fontFamily;
    },
    audio,
    destroy() {
      destroyed = true;
      view.cancelAnimationFrame(raf);
      observer.disconnect();
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn as EventListener);
      doc.removeEventListener("visibilitychange", onVisibility);
      audio?.close();
      releaseFont();
    },
  };
}

/** The page's localStorage, or null where the browser blocks it. */
function pageStorage(view: Window): KeyValueStore | null {
  try {
    return view.localStorage;
  } catch {
    // Browsers throw here when site data is blocked. The game then runs without saves, and
    // the save UI says so (SaveSlots.error), so there is nothing more to report.
    return null;
  }
}

/** Scenes the current scene's rules can change to, for prefetching their music. */
function linkedSceneFiles(session: Session): SceneFile[] {
  return linkedScenes(session.scene).flatMap((id) => session.sceneFile(id) ?? []);
}

/** Image IDs a scene needs: background, objects, and every character placed in it (plus the player). */
export function sceneImageIds(scene: SceneFile, characters: Map<string, CharacterFile>, player: string): string[] {
  const ids = new Set([...(scene.background === undefined ? [] : [scene.background]), ...scene.objects.map((o) => o.image)]);
  for (const id of [player, ...scene.characters.map((c) => c.character)]) {
    for (const anim of Object.values(characters.get(id)?.animations ?? {})) if (anim) ids.add(anim.image);
  }
  return [...ids];
}

async function decodeImage(url: string) {
  const el = new Image();
  el.src = url;
  await el.decode();
  return { el, size: { w: el.naturalWidth, h: el.naturalHeight } };
}

/**
 * Loads images by ID once and keeps them. A scene is ready when all its
 * images are; `prefetch` starts loading in the background.
 */
export class ImageCache {
  readonly loaded = new Map<string, LoadedImage>();
  private readonly started = new Set<string>();
  private readonly assets: Map<string, ImageAsset>;

  constructor(
    private readonly project: Project,
    private readonly characters: Map<string, CharacterFile>,
    private readonly assetUrl: (path: string) => string,
    private readonly onProblem: (message: string) => void,
    /** Fetches and decodes one image. The browser one by default; tests pass a fake. */
    private readonly decode: (url: string) => Promise<{ el: HTMLImageElement; size: { w: number; h: number } }> = decodeImage,
  ) {
    this.assets = new Map(project.assets!.data.images.map((a) => [a.id, a]));
  }

  private idsFor(scene: SceneFile) {
    return sceneImageIds(scene, this.characters, this.project.game!.data.player);
  }

  /** Share of the scene's images that are loaded, 0–1. */
  progress(scene: SceneFile): number {
    const ids = this.idsFor(scene);
    return ids.length === 0 ? 1 : ids.filter((id) => this.loaded.has(id)).length / ids.length;
  }

  ready = (scene: SceneFile) => this.progress(scene) === 1;

  prefetch = (scene: SceneFile) => {
    void this.load(this.idsFor(scene));
  };

  /** Loads images (skipping ones already loaded or loading); resolves when all are. */
  async load(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        if (this.started.has(id)) return;
        this.started.add(id);
        try {
          const asset = this.assets.get(id)!;
          const { el, size } = await this.decode(this.assetUrl(asset.path));
          const problem = sheetProblem(asset, size);
          if (problem) this.onProblem(problem);
          this.loaded.set(id, { asset, size, el });
        } catch (e) {
          // A failed image is not "started": a scene that needs it tries again instead of waiting for ever.
          this.started.delete(id);
          throw e;
        }
      }),
    );
  }

  /** Load a scene and wait until every image it needs is in. */
  async loadScene(scene: SceneFile): Promise<void> {
    await this.load(this.idsFor(scene));
    while (!this.ready(scene)) await new Promise((r) => setTimeout(r, 16));
  }
}
