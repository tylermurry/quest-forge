import { DndContext, PointerSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { ArrowLeft, CircleAlert, LoaderCircle, PanelBottom, PanelLeft, PanelRight, Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDefaultLayout, type PanelImperativeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { Actions } from "../model/actions.ts";
import type { Editor } from "../model/editor.ts";
import { projectTitle } from "../model/editor.ts";
import { GameBuilder } from "../model/build.ts";
import { togglePanels, type PanelName } from "../model/panels.ts";
import { Playtest } from "../model/playtest/playtest.ts";
import { WorkspaceState } from "../model/workspace.ts";
import { Button } from "./components/ui/button.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip.tsx";
import { Dock } from "./Dock.tsx";
import { EditorTabs } from "./EditorTabs.tsx";
import { Inspector } from "./Inspector.tsx";
import { ProjectBrowser } from "./ProjectBrowser.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { CanvasImages, CanvasImagesContext } from "./scene/images.ts";
import { PlayControls } from "./playtest/PlayControls.tsx";
import { PlaytestArea } from "./playtest/PlaytestArea.tsx";
import { useCommands, useEditor, usePlatform } from "./hooks.ts";
import { cn } from "./lib/utils.ts";
import { saveNow } from "./saveNow.ts";

interface Props {
  root: string;
  editor: Editor;
  onClose(): void;
}

/** Panel sizes are a per-user preference, kept in the webview's storage. */
function layoutStorage() {
  try {
    return window.localStorage;
  } catch {
    // Blocked storage (the property getter can throw): panel sizes just aren't remembered.
    return undefined;
  }
}

function SaveStatus({ editor }: { editor: Editor }) {
  const s = editor.status;
  if (s.state === "saved") return null; // a save shows a toast instead
  const icon = {
    unsaved: <span className="bg-muted-foreground size-2 rounded-full" />,
    saving: <LoaderCircle className="size-3.5 animate-spin" />,
    error: <CircleAlert className="text-err size-3.5" />,
  }[s.state];
  const text = s.state === "error" ? s.message : { unsaved: "Unsaved changes", saving: "Saving…" }[s.state];
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-[12px]", s.state === "error" ? "text-err" : "text-muted-foreground")}>
      {icon}
      <span role="status" aria-label="Save status" className="truncate">
        {text}
      </span>
    </span>
  );
}

function IconButton({ label, onClick, disabled, active, className, children }: { label: string; onClick(): void; disabled?: boolean; active?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={cn(active === false && "text-muted-foreground", className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Main layout: browser · tabs · inspector · dock, each resizable. */
export function Workspace({ root, editor, onClose }: Props) {
  const registry = useCommands();
  const ed = useEditor(editor);
  const platform = usePlatform();
  const [actions] = useState(() => new Actions(editor, new WorkspaceState(), (path) => platform.assetUrl(root, path)));
  const ws = actions.ws;
  useSyncExternalStore(ws.subscribe, () => ws.version);
  const [playtest] = useState(() => new Playtest(editor, ws));
  useEffect(() => () => playtest.stop(), [playtest]);
  // Presets live in .editor/presets.json.
  useEffect(() => {
    void playtest.presets.attach(ed.host.fs);
    return () => playtest.presets.detach();
  }, [playtest, ed]);
  // Build Game reads asset files through the same URLs the canvas uses.
  const [builder] = useState(
    () =>
      new GameBuilder(editor, ws, {
        readFile: async (path) => {
          const res = await fetch(platform.assetUrl(root, path));
          if (!res.ok) throw new Error(res.status === 404 ? "the file isn't in the project folder" : `error ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
        saveBuild: (name, bytes) => platform.saveBuild(name, bytes),
      }),
  );
  const [images] = useState(() => new CanvasImages((path) => platform.assetUrl(root, path)));
  useEffect(() => () => images.dispose(), [images]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const storage = layoutStorage();
  const columns = useDefaultLayout({ id: "questforge.columns", storage });
  const rows = useDefaultLayout({ id: "questforge.rows", storage });
  const browser = useRef<PanelImperativeHandle | null>(null);
  const inspector = useRef<PanelImperativeHandle | null>(null);
  const dock = useRef<PanelImperativeHandle | null>(null);
  const [, setTick] = useState(0);
  const toggle = (p: React.RefObject<PanelImperativeHandle | null>) => {
    const panel = p.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
    setTick((t) => t + 1);
  };
  const shown = (p: React.RefObject<PanelImperativeHandle | null>) => !(p.current?.isCollapsed() ?? false);
  // Ctrl+\ hides every panel, then brings back the ones that were up.
  const hiddenPanels = useRef<PanelName[] | null>(null);
  const toggleAll = () => {
    const refs = { browser, inspector, dock };
    const next = togglePanels({ browser: shown(browser), inspector: shown(inspector), dock: shown(dock) }, hiddenPanels.current);
    hiddenPanels.current = next.saved;
    for (const name of ["browser", "inspector", "dock"] as const) {
      const panel = refs[name].current;
      if (!panel) continue;
      if (next.shown[name] && panel.isCollapsed()) panel.expand();
      if (!next.shown[name] && !panel.isCollapsed()) panel.collapse();
    }
    setTick((t) => t + 1);
    registry.changed();
  };

  // While a game runs, the playtest area replaces the scene editor and the browser and
  // inspector are hidden (as with Ctrl+\\); stopping brings back the ones that were up.
  const playing = useSyncExternalStore(playtest.subscribe, () => playtest.playing);
  const hiddenForPlay = useRef<("browser" | "inspector")[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: collapse/expand only when `playing` flips; the panel refs and `shown` are read fresh at that moment
  useEffect(() => {
    if (playing) {
      const up = (["browser", "inspector"] as const).filter((n) => shown(n === "browser" ? browser : inspector));
      hiddenForPlay.current = up;
      for (const n of up) (n === "browser" ? browser : inspector).current?.collapse();
    } else if (hiddenForPlay.current) {
      for (const n of hiddenForPlay.current) (n === "browser" ? browser : inspector).current?.expand();
      hiddenForPlay.current = null;
    }
    setTick((t) => t + 1);
  }, [playing]);

  // Notices (outside reloads, refused imports, command errors) show as toasts.
  useEffect(() => {
    const n = ed.notice;
    if (!n) return;
    if (n.kind === "error") toast.error(n.text);
    else toast(n.text, { duration: 8000 });
    ed.dismissNotice();
  }, [ed, ed.notice]);

  // Edit and View menu commands; the registry refreshes menus when the editor changes.
  const panels = useRef({ browser, inspector, dock, toggle, toggleAll, shown });
  panels.current = { browser, inspector, dock, toggle, toggleAll, shown };
  useEffect(() => {
    const off = registry.register({
      "edit.undo": { run: () => ed.undo(), enabled: () => ed.history.canUndo, label: () => (ed.history.undoLabel ? `Undo ${ed.history.undoLabel}` : "Undo") },
      "edit.redo": { run: () => ed.redo(), enabled: () => ed.history.canRedo, label: () => (ed.history.redoLabel ? `Redo ${ed.history.redoLabel}` : "Redo") },
      "view.browser": { run: () => panels.current.toggle(panels.current.browser) },
      "view.inspector": { run: () => panels.current.toggle(panels.current.inspector) },
      "view.dock": { run: () => panels.current.toggle(panels.current.dock) },
      "view.panels": {
        run: () => panels.current.toggleAll(),
        label: () => {
          const { shown: up, browser: b, inspector: i, dock: d } = panels.current;
          return up(b) || up(i) || up(d) ? "Hide All Panels" : "Show Panels";
        },
      },
    });
    const unsub = ed.subscribe(() => registry.changed());
    return () => {
      unsub();
      off();
    };
  }, [ed, registry]);

  // File ▸ Build Game. Errors and failures arrive as notices; success is a toast.
  useEffect(
    () =>
      registry.register({
        "project.build": {
          run: async () => {
            const r = await builder.build();
            if (r.kind === "built") toast.success("Game built", { description: r.where });
          },
          enabled: () => !builder.building,
        },
      }),
    [builder, registry],
  );

  // Play menu.
  useEffect(() => {
    const off = registry.register({
      "play.start": { run: () => playtest.play() },
      "play.here": { run: () => playtest.playHere(), enabled: () => playtest.hereTarget() !== null },
      "play.node": { run: () => playtest.playNode(), enabled: () => playtest.nodeTarget() !== null },
      "play.restart": { run: () => playtest.restart(), enabled: () => playtest.playing },
      "play.restartScene": { run: () => playtest.restartScene(), enabled: () => playtest.session !== null },
      "play.stop": { run: () => playtest.stop(), enabled: () => playtest.playing },
    });
    // Trace events change the playtest often; menus only care whether a game runs.
    let shown = "";
    const refresh = () => {
      const now = `${playtest.playing}/${playtest.session !== null}/${playtest.hereTarget() !== null}/${playtest.nodeTarget() !== null}`;
      if (now !== shown) (shown = now), registry.changed();
    };
    const unsubs = [playtest.subscribe(refresh), ws.subscribe(refresh)];
    return () => {
      unsubs.forEach((u) => u());
      off();
    };
  }, [playtest, ws, registry]);

  // Something asked to show the Problems dock (Play blocked by errors).
  const dockRequest = ws.dockRequest;
  useEffect(() => {
    if (dockRequest > 0 && dock.current?.isCollapsed()) dock.current.expand();
  }, [dockRequest]);

  // A jump-to (a problem, a log line) shows the Inspector so the highlighted rule is visible.
  const inspectorRequest = ws.inspectorRequest;
  useEffect(() => {
    if (inspectorRequest > 0 && inspector.current?.isCollapsed()) {
      inspector.current.expand();
      setTick((t) => t + 1);
    }
  }, [inspectorRequest]);

  // Scene canvas view state lives in .editor/view.json.
  useEffect(() => {
    void ws.sceneUi.attach(ed.host.fs);
    return () => ws.sceneUi.detach();
  }, [ws, ed]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (ed.hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [ed]);

  return (
    <TooltipProvider delayDuration={500}>
    {/* One drag context for the whole workspace: browser rows drop on folders and on scene canvases. */}
    <CanvasImagesContext.Provider value={images}>
    <DndContext sensors={sensors} collisionDetection={pointerWithin}>
    <div className="flex h-full flex-col">
      <TitleBar>
        <IconButton label="Back to project selector" onClick={onClose}>
          <ArrowLeft />
        </IconButton>
        <span className="truncate text-[13px] font-semibold">{projectTitle(ed.project)}</span>
        <div className="flex items-center">
          <IconButton label={ed.history.undoLabel ? `Undo ${ed.history.undoLabel}` : "Undo"} disabled={!ed.history.canUndo} onClick={() => ed.undo()}>
            <Undo2 />
          </IconButton>
          <IconButton label={ed.history.redoLabel ? `Redo ${ed.history.redoLabel}` : "Redo"} disabled={!ed.history.canRedo} onClick={() => ed.redo()}>
            <Redo2 />
          </IconButton>
        </div>
        <Button variant="ghost" size="xs" disabled={ed.status.state === "saved" || ed.status.state === "saving"} onClick={() => void saveNow(ed)}>
          <Save /> Save
        </Button>
        <SaveStatus editor={ed} />
        <div className="ml-auto flex items-center gap-0.5">
          <PlayControls playtest={playtest} />
          <span className="bg-border mx-2 h-4 w-px" aria-hidden />
          <IconButton label="Show project browser" active={shown(browser)} onClick={() => toggle(browser)}>
            <PanelLeft />
          </IconButton>
          <IconButton label="Show problems" active={shown(dock)} onClick={() => toggle(dock)}>
            <PanelBottom />
          </IconButton>
          <IconButton label="Show inspector" active={shown(inspector)} onClick={() => toggle(inspector)}>
            <PanelRight />
          </IconButton>
        </div>
      </TitleBar>
      <ResizablePanelGroup orientation="horizontal" id="questforge.columns" defaultLayout={columns.defaultLayout} onLayoutChanged={columns.onLayoutChanged} className="min-h-0 flex-1">
        <ResizablePanel id="browser" panelRef={browser} defaultSize="260px" minSize="180px" maxSize="45%" collapsible className="bg-panel" onResize={() => setTick((t) => t + 1)}>
          <aside aria-label="Project browser" className="h-full">
            <ProjectBrowser actions={actions} />
          </aside>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="center" minSize="30%">
          {playing ? (
            <PlaytestArea playtest={playtest} actions={actions} />
          ) : (
            <ResizablePanelGroup orientation="vertical" id="questforge.rows" defaultLayout={rows.defaultLayout} onLayoutChanged={rows.onLayoutChanged}>
              <ResizablePanel id="tabs" minSize="25%">
                <main className="h-full">
                  <EditorTabs actions={actions} />
                </main>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="dock" panelRef={dock} defaultSize="28%" minSize="80px" collapsible className="bg-panel" onResize={() => setTick((t) => t + 1)}>
                <footer className="flex h-full flex-col">
                  <Dock actions={actions} />
                </footer>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="inspector" panelRef={inspector} defaultSize="280px" minSize="200px" maxSize="45%" collapsible className="bg-panel" onResize={() => setTick((t) => t + 1)}>
          <aside aria-label="Inspector" className="h-full overflow-auto px-3 pb-3">
            <Inspector actions={actions} />
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
    </DndContext>
    </CanvasImagesContext.Provider>
    </TooltipProvider>
  );
}
