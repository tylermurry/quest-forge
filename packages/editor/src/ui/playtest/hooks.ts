import { useEffect, useReducer } from "react";
import type { Playtest } from "../../model/playtest/playtest.ts";

/**
 * Re-renders when the playtest changes (runs, log), at most once a frame, and
 * every 200 ms while a game runs, since play moves state without telling anyone.
 */
export function usePlaytest(playtest: Playtest): Playtest {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let raf = 0;
    const off = playtest.subscribe(() => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), bump()));
    });
    const timer = setInterval(() => playtest.session && bump(), 200);
    return () => {
      off();
      clearInterval(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [playtest]);
  return playtest;
}
