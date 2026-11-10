/// <reference types="vite/client" />
// Dev page: plays the hand-written engine fixture with the real engine, or a
// built game: open a `.quest` file, drop one on the page, or pass `?quest=<url>`.
import { MemoryFs, QuestError, formatProblem, loadProject } from "@questforge/schema";
import { DEBUG_ALL, DEBUG_OFF, ProjectErrors, createGame, loadQuest, score, type Game, type ProjectBundle, type QuestBundle } from "../src/index.ts";

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
const stateBox = document.querySelector<HTMLDivElement>("#state")!;
const questInput = document.querySelector<HTMLInputElement>("#quest")!;
const source = document.querySelector<HTMLSpanElement>("#source")!;

const { project, problems } = await loadProject(new MemoryFs(files));
const fixture: ProjectBundle = { project, assetUrl: (p) => assetUrls.get(p) ?? p };
let bundle: ProjectBundle = fixture;
let quest: QuestBundle | null = null;
let game: Game | null = null;

function showError(text: string) {
  errors.hidden = false;
  errors.textContent = text;
}

function start(scene?: string) {
  game?.destroy();
  errors.hidden = true;
  try {
    if (bundle === fixture && problems.length) throw new ProjectErrors(problems);
    game = createGame(bundle, canvas, { ...(scene ? { scene } : {}), debug: debugBox.checked ? DEBUG_ALL : DEBUG_OFF });
    (window as unknown as { game: Game }).game = game;
  } catch (e) {
    showError(e instanceof ProjectErrors ? e.problems.map(formatProblem).join("\n") : String(e));
    return;
  }
  void game.ready.then(syncBoulder);
}

/** Plays a built game from its bytes, from its own start scene. */
async function playQuest(name: string, bytes: Uint8Array) {
  let next: QuestBundle;
  try {
    next = await loadQuest(bytes);
  } catch (e) {
    showError(e instanceof QuestError ? `${name} ${e.message}` : `Couldn't open ${name}: ${String(e)}`);
    return;
  }
  game?.destroy();
  game = null;
  quest?.dispose();
  quest = next;
  bundle = next;
  source.textContent = `${name} · ${next.project.game!.data.title}`;
  sceneSelect.replaceChildren(...next.project.scenes.map((s) => new Option(s.data.name || s.data.id, s.data.id)));
  sceneSelect.value = next.project.game!.data.startScene;
  start();
}

const openFile = async (file: File) => playQuest(file.name, new Uint8Array(await file.arrayBuffer()));
questInput.addEventListener("change", () => {
  const file = questInput.files?.[0];
  if (file) void openFile(file);
  questInput.value = "";
});
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) void openFile(file);
});

function syncBoulder() {
  const w = game?.world;
  const has = !!w?.scene.objects.some((o) => o.id === "boulder");
  boulderBtn.disabled = !has;
  boulderBtn.textContent = w && has && !w.isObjectVisible("boulder") ? "Show boulder" : "Hide boulder";
}

/** One-line readout of the game state (the editor's playtest state panel does this properly). */
function showState() {
  const s = game?.session;
  if (s) {
    const st = s.state;
    const flags = Object.entries(st.flags).map(([k, v]) => `${k}=${v}`);
    stateBox.textContent =
      `scene ${st.scene} · verb ${s.verb}${s.item ? ` (${s.item})` : ""} · inventory [${st.inventory.join(", ")}] · ` +
      `${flags.join(" ")} · score ${score(st)}/${s.game.maxScore} · visited [${st.visited.join(", ")}]` +
      (s.log.length ? `\nlast note: ${s.log.at(-1)}` : "");
    syncBoulder();
  }
  setTimeout(showState, 250);
}
showState();

sceneSelect.addEventListener("change", () => start(sceneSelect.value));
debugBox.addEventListener("change", () => game && Object.assign(game.debug, debugBox.checked ? DEBUG_ALL : DEBUG_OFF));
boulderBtn.addEventListener("click", () => {
  const s = game?.session;
  if (!s) return;
  // Through the session so game state stays in step with the world.
  s.setObjectVisible(s.scene.id, "boulder", !s.world.isObjectVisible("boulder"));
  syncBoulder();
});

// Frame-time readout for the frame-rate check.
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

const questUrl = new URLSearchParams(location.search).get("quest");
if (questUrl) {
  const res = await fetch(questUrl).catch(() => null);
  if (res?.ok) await playQuest(questUrl.split("/").pop() ?? questUrl, new Uint8Array(await res.arrayBuffer()));
  else showError(`Couldn't download ${questUrl}.`);
} else start(sceneSelect.value);
