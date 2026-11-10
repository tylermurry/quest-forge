import { lazy, Suspense, useEffect } from "react";
import { Home } from "./Home.tsx";
import { isQuestFile, playQuestFile } from "./questFile.ts";
import { Privacy } from "./Privacy.tsx";
import { pageFor, usePath } from "./router.ts";

// The player pulls in the engine and schema; the home page shouldn't have to.
const Play = lazy(() => import("./Play.tsx").then((m) => ({ default: m.Play })));

export function App() {
  const path = usePath();

  // A `.quest` dropped anywhere on the site plays it.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && isQuestFile(file)) playQuestFile(file);
    };
    addEventListener("dragover", over);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragover", over);
      removeEventListener("drop", drop);
    };
  }, []);

  const page = pageFor(path);
  if (page === "privacy") return <Privacy />;
  return page === "play" ? (
    <Suspense fallback={<div className="play" />}>
      <Play />
    </Suspense>
  ) : (
    <Home />
  );
}
