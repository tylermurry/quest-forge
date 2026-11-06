/// <reference types="vite/client" />
// Dev page (D68): plays the hand-written M1 fixture with the real engine.
import { MemoryFs, formatProblem, loadProject } from "@questforge/schema";
import { ProjectErrors, createGame, type Game } from "../src/index.ts";

const PREFIX = "../fixtures/m1/";
const yaml = import.meta.glob<string>("../fixtures/m1/**/*.yaml", { query: "?raw", import: "default", eager: true });
const urls = import.meta.glob<string>("../fixtures/m1/assets/**/*", { query: "?url", import: "default", eager: true });

const rel = (key: string) => key.slice(PREFIX.length);
const files: Record<string, string> = {};
for (const [k, v] of Object.entries(yaml)) files[rel(k)] = v;
// Asset files only need to exist for validation; the engine fetches them by URL.
for (const k of Object.keys(urls)) files[rel(k)] = "";
const assetUrls = new Map(Object.entries(urls).map(([k, v]) => [rel(k), v]));

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const sceneSelect = document.querySelector<HTMLSelectElement>("#scene")!;
const debugBox = document.querySelector<HTMLInputElement>("#debug")!;
const boulderBtn = document.querySelector<HTMLButtonElement>("#boulder")!;
const stats = document.querySelector<HTMLSpanElement>("#stats")!;
const errors = document.querySelector<HTMLDivElement>("#errors")!;

const { project, problems } = await loadProject(new MemoryFs(files));
let game: Game | null = null;

function start(scene: string) {
  game?.destroy();
  errors.hidden = true;
  try {
    if (problems.length) throw new ProjectErrors(problems);
    game = createGame({ project, assetUrl: (p) => assetUrls.get(p) ?? p }, canvas, { scene, debug: { overlay: debugBox.checked } });
    (window as unknown as { game: Game }).game = game;
  } catch (e) {
    errors.hidden = false;
    errors.textContent = e instanceof ProjectErrors ? e.problems.map(formatProblem).join("\n") : String(e);
    return;
  }
  void game.ready.then(syncBoulder);
}

function syncBoulder() {
  const w = game?.world;
  const has = !!w?.scene.objects.some((o) => o.id === "boulder");
  boulderBtn.disabled = !has;
  boulderBtn.textContent = w && has && !w.isObjectVisible("boulder") ? "Show boulder" : "Hide boulder";
}

sceneSelect.addEventListener("change", () => start(sceneSelect.value));
debugBox.addEventListener("change", () => game && (game.debug.overlay = debugBox.checked));
boulderBtn.addEventListener("click", () => {
  const w = game?.world;
  if (!w) return;
  w.setObjectVisible("boulder", !w.isObjectVisible("boulder"));
  syncBoulder();
});

// Frame-time readout for the spec 03 frame-rate check.
let frames = 0;
let last = performance.now();
let worst = 0;
let prev = last;
const meter = (now: number) => {
  worst = Math.max(worst, now - prev);
  prev = now;
  frames++;
  if (now - last >= 1000) {
    stats.textContent = `${Math.round((frames * 1000) / (now - last))} fps · worst frame ${worst.toFixed(1)} ms`;
    frames = 0;
    worst = 0;
    last = now;
  }
  requestAnimationFrame(meter);
};
requestAnimationFrame(meter);

start(sceneSelect.value);
