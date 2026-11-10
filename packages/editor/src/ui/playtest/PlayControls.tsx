import { AppWindow, ChevronDown, Play, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { Playtest } from "../../model/playtest/playtest.ts";
import { Button } from "../components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useCommands } from "../hooks.ts";
import { cn } from "../lib/utils.ts";
import { usePlaytest } from "./hooks.ts";

/** Start-from-preset items for a split button's menu. */
function PresetItems({ playtest }: { playtest: Playtest }) {
  useSyncExternalStore(playtest.presets.subscribe, () => playtest.presets.version);
  const list = playtest.presets.list;
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-[11px]">Start from preset</DropdownMenuLabel>
      {list.length === 0 && (
        <p className="text-muted-foreground max-w-56 px-2 pb-1 text-[12px]">No presets yet. Save one from the state panel while playing.</p>
      )}
      {list.map((p) => (
        <DropdownMenuItem key={p.name} className="text-[13px]" onSelect={() => playtest.playPreset(p.name)}>
          {p.name}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** A main action with a chevron that opens related ones. */
function SplitButton(props: {
  label: string;
  title: string;
  icon: React.ReactNode;
  onClick(): void;
  disabled?: boolean;
  menuLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center rounded-md border">
      <Button
        variant="ghost"
        size="xs"
        aria-label={props.label}
        title={props.title}
        disabled={props.disabled}
        onClick={props.onClick}
        className="gap-1 rounded-r-none px-2 text-[12px]"
      >
        {props.icon}
        {props.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={props.menuLabel} title={props.menuLabel} className="w-5 rounded-l-none border-l">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48" onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {props.children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Play controls, in the title bar and the playtest window's toolbar.
 * Only what applies shows: Play (with From here and presets) while stopped; Restart
 * (with Restart scene and presets) and Stop while playing.
 */
export function PlayControls({ playtest, onShowWindow, className }: { playtest: Playtest; onShowWindow?: () => void; className?: string }) {
  usePlaytest(playtest);
  const registry = useCommands();
  useSyncExternalStore(registry.subscribe, () => registry.version);
  const playing = playtest.playing;
  return (
    <div role="toolbar" aria-label="Play controls" className={cn("flex items-center gap-1", className)}>
      {!playing ? (
        <SplitButton
          label="Play"
          title="Play from the start (F5)"
          icon={<Play className="text-ok size-3.5" />}
          onClick={() => registry.run("play.start")}
          disabled={!registry.isEnabled("play.start")}
          menuLabel="More ways to play"
        >
          <DropdownMenuItem className="text-[13px]" disabled={!registry.isEnabled("play.here")} onSelect={() => registry.run("play.here")}>
            Play from here
            <DropdownMenuShortcut>F6</DropdownMenuShortcut>
          </DropdownMenuItem>
          {!registry.isEnabled("play.here") && <p className="text-muted-foreground max-w-56 px-2 pb-1 text-[12px]">Open a scene to play from it.</p>}
          <DropdownMenuSeparator />
          <PresetItems playtest={playtest} />
        </SplitButton>
      ) : (
        <>
          {playtest.stale && (
            <Button
              variant="ghost"
              size="xs"
              className="text-warn gap-1 px-1.5 text-[12px]"
              title="The project changed since this run started"
              onClick={() => registry.run("play.restartScene")}
            >
              <TriangleAlert className="size-3.5" /> Restart scene to apply
            </Button>
          )}
          <SplitButton
            label="Restart"
            title="Restart from where this run started"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => registry.run("play.restart")}
            menuLabel="More ways to restart"
          >
            <DropdownMenuItem className="text-[13px]" disabled={!registry.isEnabled("play.restartScene")} onSelect={() => registry.run("play.restartScene")}>
              Restart scene
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <PresetItems playtest={playtest} />
          </SplitButton>
          <Button
            variant="ghost"
            size="xs"
            aria-label="Stop"
            title="Stop (Shift+F5)"
            onClick={() => registry.run("play.stop")}
            className="gap-1 border px-2 text-[12px]"
          >
            <Square className="text-err size-3" /> Stop
          </Button>
          {onShowWindow && (
            <Button variant="ghost" size="icon-xs" aria-label="Show playtest window" title="Show playtest window" onClick={onShowWindow}>
              <AppWindow />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
