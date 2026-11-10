import { createGame, type Game } from "@questforge/engine";
import { useContext, useEffect, useRef, useState } from "react";
import type { Playtest, Run } from "../../model/playtest/playtest.ts";
import { CanvasImagesContext } from "../scene/images.ts";

/**
 * The running game (spec 12): the real engine on a canvas, remounted for every run.
 * The canvas is focusable; while it has focus plain shortcuts stay with the game,
 * and Escape hands focus back to the editor (D131).
 */
export function GameView({ playtest, run }: { playtest: Playtest; run: Run }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const game = useRef<Game | null>(null);
  const images = useContext(CanvasImagesContext);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    setError(null);
    let g: Game;
    try {
      const { start } = run;
      g = createGame({ project: run.project, assetUrl: (path) => images?.urlFor(run.project, path) ?? path }, el, {
        ...(start.scene ? { scene: start.scene } : {}),
        ...(start.spawn ? { spawn: start.spawn } : {}),
        ...(start.state ? { state: start.state } : {}),
        ...(start.dialogue ? { dialogue: start.dialogue } : {}),
        ...playtest.hooks(run),
        debug: playtest.debug,
        // The playtest area grows the game as large as it fits (D135).
        fill: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    game.current = g;
    // Debug handle for the dev page and tests (`window.game`); Window has no such field, so the cast is deliberate.
    (window as unknown as { game?: Game }).game = g;
    g.ready.then(
      () => g.session && playtest.attach(run, g.session),
      (e: unknown) => setError(`The game couldn't load: ${e instanceof Error ? e.message : String(e)}`),
    );
    el.focus();
    return () => {
      g.destroy();
      if (game.current === g) game.current = null;
    };
  }, [playtest, run, images]);

  // Debug toggles apply to the running game at once.
  useEffect(() => {
    const off = playtest.subscribe(() => {
      if (game.current) Object.assign(game.current.debug, playtest.debug);
    });
    return () => void off();
  }, [playtest]);

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center bg-black">
      <canvas
        ref={canvas}
        data-playtest-game
        tabIndex={0}
        aria-label="Running game"
        className="h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.currentTarget as HTMLCanvasElement).blur();
        }}
        onPointerDown={(e) => e.currentTarget.focus()}
      />
      {error && <p className="text-err absolute inset-x-2 top-2 rounded-sm bg-black/80 p-2 text-[12px] whitespace-pre-wrap">{error}</p>}
    </div>
  );
}
