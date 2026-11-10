// /play: runs a `.quest` with the real engine. Same path as the engine
// dev page: loadQuest → createGame, then destroy + dispose on the way out.
import { formatProblem, QuestError } from "@questforge/schema";
import { createGame, loadQuest, ProjectErrors, type Game, type QuestBundle } from "@questforge/engine";
import { useEffect, useRef, useState } from "react";
import { Mark } from "./Mark.tsx";
import { onPendingQuest, takePendingQuest } from "./questFile.ts";
import { QuestPicker } from "./QuestPicker.tsx";
import { navigate } from "./router.ts";

type Fullscreenable = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

const fullscreenElement = () => document.fullscreenElement ?? (document as FullscreenDoc).webkitFullscreenElement ?? null;

function describe(e: unknown, name: string): string[] {
  if (e instanceof QuestError) return [`${name} ${e.message}`];
  if (e instanceof ProjectErrors) return [`${name} has problems that stop it from running:`, ...e.problems.filter((p) => p.severity === "error").map(formatProblem)];
  return [`Couldn't open ${name}.`, String(e instanceof Error ? e.message : e)];
}

export function Play() {
  const [file, setFile] = useState<File | null>(takePendingQuest);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [native, setNative] = useState(false); // real Fullscreen API
  const [filled, setFilled] = useState(false); // fallback where there's none (iPhone)
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => onPendingQuest(() => setFile(takePendingQuest())), []);

  useEffect(() => {
    document.title = title ? `${title} — Quest Forge` : "Play — Quest Forge";
  }, [title]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let quest: QuestBundle | null = null;
    let game: Game | null = null;
    setError(null);
    setTitle("");
    setLoading(true);
    (async () => {
      try {
        const bundle = await loadQuest(new Uint8Array(await file.arrayBuffer()));
        if (cancelled) return bundle.dispose();
        quest = bundle;
        setTitle(bundle.project.game?.data.title || file.name);
        game = createGame(bundle, canvas.current!);
        await game.ready;
      } catch (e) {
        if (!cancelled) setError(describe(e, file.name));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      game?.destroy();
      quest?.dispose();
    };
  }, [file]);

  useEffect(() => {
    const sync = () => setNative(fullscreenElement() === stage.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!filled) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFilled(false);
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [filled]);

  const enterFullscreen = () => {
    const el = stage.current as Fullscreenable | null;
    if (!el) return;
    if (el.requestFullscreen && document.fullscreenEnabled) void el.requestFullscreen().catch(() => setFilled(true));
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else setFilled(true);
  };

  const close = () => {
    if (fullscreenElement()) void document.exitFullscreen?.().catch(() => {});
    navigate("/");
  };

  return (
    <div className="play">
      <header className="play-bar">
        <a
          className="play-home"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <Mark size={18} />
          <span>Quest Forge</span>
        </a>
        <span className="play-title">{title}</span>
        <div className="play-actions">
          {file && !error && (
            <button type="button" className="btn btn-quiet" onClick={enterFullscreen}>
              Full screen
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={close}>
            Close
          </button>
        </div>
      </header>

      <div ref={stage} className={`play-stage${filled ? " filled" : ""}${native ? " native" : ""}`}>
        {file && !error && <canvas ref={canvas} className="play-canvas" aria-label={title || "Game"} />}
        {filled && (
          <button type="button" className="play-exit" onClick={() => setFilled(false)}>
            Exit full screen
          </button>
        )}
        {file && loading && !error && <p className="play-note">Opening {file.name}…</p>}
        {(!file || error) && (
          <div className="play-empty">
            {error ? (
              <div className="play-error" role="alert">
                {error.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : (
              <>
                <h1>Play a quest</h1>
                <p>Pick a <code>.quest</code> file made with Quest Forge’s Build Game, or drop one on this page. It runs here in your browser; nothing is uploaded.</p>
              </>
            )}
            <QuestPicker className="btn btn-primary">{error ? "Choose another file" : "Choose a .quest file"}</QuestPicker>
          </div>
        )}
      </div>
    </div>
  );
}
