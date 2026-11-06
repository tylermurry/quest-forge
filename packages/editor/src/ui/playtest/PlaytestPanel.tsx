import { Bug, Play, RotateCcw, Square, StepForward, Undo2 } from "lucide-react";
import type { DebugFlags } from "@questforge/engine";
import type { Playtest } from "../../model/playtest/playtest.ts";
import { Button } from "../components/ui/button.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable.tsx";
import { useCommands } from "../hooks.ts";
import { cn } from "../lib/utils.ts";
import { GameView } from "./GameView.tsx";
import { usePlaytest } from "./hooks.ts";

const LAYERS: { key: keyof DebugFlags; label: string }[] = [
  { key: "walkable", label: "Walkable" },
  { key: "hotspots", label: "Hotspots" },
  { key: "regions", label: "Regions" },
  { key: "baselines", label: "Baselines" },
  { key: "path", label: "Path" },
];

function ToolButton(props: { label: string; onClick(): void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="xs" aria-label={props.label} title={props.label} disabled={props.disabled} onClick={props.onClick} className="gap-1 px-1.5 text-[12px]">
      {props.children}
    </Button>
  );
}

/** The Dock's Playtest tab (spec 12, D127): toolbar, the running game, state and log beside it. */
export function PlaytestPanel({ playtest, side }: { playtest: Playtest; side?: React.ReactNode }) {
  usePlaytest(playtest);
  const registry = useCommands();
  const run = playtest.run;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="toolbar" aria-label="Playtest" className="flex h-8 shrink-0 flex-wrap items-center gap-0.5 border-b px-1">
        <ToolButton label="Play (F5)" onClick={() => registry.run("play.start")} disabled={!registry.isEnabled("play.start")}>
          <Play className="size-3.5" /> Play
        </ToolButton>
        <ToolButton label="Play from here (F6)" onClick={() => registry.run("play.here")} disabled={!registry.isEnabled("play.here")}>
          <StepForward className="size-3.5" /> From here
        </ToolButton>
        <ToolButton label="Restart" onClick={() => registry.run("play.restart")} disabled={!run}>
          <RotateCcw className="size-3.5" /> Restart
        </ToolButton>
        <ToolButton label="Restart scene" onClick={() => registry.run("play.restartScene")} disabled={!playtest.session}>
          <Undo2 className="size-3.5" /> Restart scene
        </ToolButton>
        <ToolButton label="Stop (Shift+F5)" onClick={() => registry.run("play.stop")} disabled={!run}>
          <Square className="size-3.5" /> Stop
        </ToolButton>
        <span className="bg-border mx-1 h-4 w-px" />
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
        {playtest.stale && (
          <button className="text-warn ml-auto rounded-sm px-1.5 text-[12px] hover:underline" onClick={() => registry.run("play.restartScene")}>
            Project changed – Restart scene to apply
          </button>
        )}
      </div>
      {!run ? (
        <p className="text-muted-foreground p-3 text-[12px]">
          Press <b>Play</b> (F5) to start from the beginning, or <b>From here</b> (F6) to start in the open scene at the selected spawn point.
        </p>
      ) : (
        <ResizablePanelGroup orientation="horizontal" id="questforge.playtest" className="min-h-0 flex-1">
          <ResizablePanel id="game" defaultSize="55%" minSize="25%">
            <GameView key={run.id} playtest={playtest} run={run} />
          </ResizablePanel>
          {side && (
            <>
              <ResizableHandle />
              <ResizablePanel id="side" minSize="20%">
                {side}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );
}
