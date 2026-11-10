import { Bug } from "lucide-react";
import type { DebugFlags } from "@questforge/engine";
import { useDefaultLayout } from "react-resizable-panels";
import type { Actions } from "../../model/actions.ts";
import type { Playtest } from "../../model/playtest/playtest.ts";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable.tsx";
import { cn } from "../lib/utils.ts";
import { EventLog } from "./EventLog.tsx";
import { GameView } from "./GameView.tsx";
import { usePlaytest } from "./hooks.ts";
import { PresetSection } from "./Presets.tsx";
import { StatePanel } from "./StatePanel.tsx";

const LAYERS: { key: keyof DebugFlags; label: string }[] = [
  { key: "walkable", label: "Walkable" },
  { key: "hotspots", label: "Hotspots" },
  { key: "regions", label: "Regions" },
  { key: "baselines", label: "Baselines" },
  { key: "path", label: "Path" },
];

/** Panel sizes are a per-user preference, kept in the editor's storage. */
function layoutStorage() {
  try {
    return window.localStorage;
  } catch {
    // Blocked storage (the property getter can throw): panel sizes just aren't remembered.
    return undefined;
  }
}

/** The debug bar: the debug layer toggles. Play controls stay in the title bar. */
function DebugBar({ playtest }: { playtest: Playtest }) {
  usePlaytest(playtest);
  return (
    <div role="toolbar" aria-label="Playtest" className="bg-panel flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <Bug className="text-muted-foreground size-3.5" aria-hidden />
      <div role="group" aria-label="Debug layers" className="flex items-center gap-0.5">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            aria-pressed={playtest.debug[l.key]}
            onClick={() => {
              playtest.debug[l.key] = !playtest.debug[l.key];
              playtest.changed();
            }}
            className={cn("h-6 rounded-sm border px-1.5 text-[11px]", playtest.debug[l.key] ? "bg-muted" : "text-muted-foreground opacity-70")}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The playtest area: while a game runs it replaces the scene editor
 * and Problems in the centre. Debug bar on top; state on the left; the game as large
 * as fits; the event log along the bottom.
 */
export function PlaytestArea({ playtest, actions }: { playtest: Playtest; actions: Actions }) {
  usePlaytest(playtest);
  const storage = layoutStorage();
  const outer = useDefaultLayout({ id: "questforge.playtest.rows", storage });
  const inner = useDefaultLayout({ id: "questforge.playtest.columns", storage });
  const { editor, ws } = actions;
  const run = playtest.run;
  return (
    <div className="flex h-full min-h-0 flex-col text-[13px]">
      <DebugBar playtest={playtest} />
      <ResizablePanelGroup
        orientation="vertical"
        id="questforge.playtest.rows"
        defaultLayout={outer.defaultLayout}
        onLayoutChanged={outer.onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <ResizablePanel id="top" minSize="30%">
          <ResizablePanelGroup
            orientation="horizontal"
            id="questforge.playtest.columns"
            defaultLayout={inner.defaultLayout}
            onLayoutChanged={inner.onLayoutChanged}
          >
            <ResizablePanel id="state" defaultSize="300px" minSize="220px" maxSize="50%" className="bg-panel">
              <StatePanel playtest={playtest} project={editor.project} footer={<PresetSection playtest={playtest} />} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="game" minSize="30%">
              {run && <GameView key={run.id} playtest={playtest} run={run} />}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="log" defaultSize="28%" minSize="10%" className="bg-panel">
          <EventLog playtest={playtest} project={editor.project} ws={ws} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
