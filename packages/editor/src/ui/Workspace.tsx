import { DndContext, PointerSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { CircleAlert, CircleCheck, LoaderCircle, PanelBottom, PanelLeft, PanelRight, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDefaultLayout, type PanelImperativeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { Actions } from "../model/actions.ts";
import type { Editor } from "../model/editor.ts";
import { projectTitle } from "../model/editor.ts";
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
import { useCommands, useEditor, usePlatform } from "./hooks.ts";
import { cn } from "./lib/utils.ts";

interface Props {
  root: string;
  editor: Editor;
  onClose(): void;
  /** The app's native menu bar owns Close Project, so the title bar doesn't repeat it. */
  nativeMenu?: boolean;
}

/** Panel sizes are a per-user preference, kept in the webview's storage (D92). */
function layoutStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function SaveStatus({ editor }: { editor: Editor }) {
  const s = editor.status;
  const icon = {
    saved: <CircleCheck className="text-ok size-3.5" />,
    unsaved: <span className="bg-muted-foreground size-2 rounded-full" />,
    saving: <LoaderCircle className="size-3.5 animate-spin" />,
    error: <CircleAlert className="text-err size-3.5" />,
  }[s.state];
  const text = s.state === "error" ? s.message : { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…" }[s.state];
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-[12px]", s.state === "error" ? "text-err" : "text-muted-foreground")}>
      {icon}
      <span role="status" aria-label="Save status" className="truncate">
        {text}
      </span>
    </span>
  );
}

function IconButton({ label, onClick, disabled, active, children }: { label: string; onClick(): void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={cn(active === false && "text-muted-foreground")}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Main layout (spec 08): browser · tabs · inspector · dock, each resizable (D92). */
export function Workspace({ root, editor, onClose, nativeMenu = false }: Props) {
  const registry = useCommands();
  const ed = useEditor(editor);
  const platform = usePlatform();
  const [actions] = useState(() => new Actions(editor, new WorkspaceState(), (path) => platform.assetUrl(root, path)));
  const ws = actions.ws;
  useSyncExternalStore(ws.subscribe, () => ws.version);
  const [playtest] = useState(() => new Playtest(editor, ws));
  useEffect(() => () => playtest.stop(), [playtest]);
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

  // Notices (outside reloads, refused imports, command errors) show as toasts.
  useEffect(() => {
    const n = ed.notice;
    if (!n) return;
    if (n.kind === "error") toast.error(n.text);
    else toast(n.text, { duration: 8000 });
    ed.dismissNotice();
  }, [ed, ed.notice]);

  // Edit and View menu commands (D92); the registry refreshes menus when the editor changes.
  const panels = useRef({ browser, inspector, dock, toggle });
  panels.current = { browser, inspector, dock, toggle };
  useEffect(() => {
    const off = registry.register({
      "edit.undo": { run: () => ed.undo(), enabled: () => ed.history.canUndo, label: () => (ed.history.undoLabel ? `Undo ${ed.history.undoLabel}` : "Undo") },
      "edit.redo": { run: () => ed.redo(), enabled: () => ed.history.canRedo, label: () => (ed.history.redoLabel ? `Redo ${ed.history.redoLabel}` : "Redo") },
      "view.browser": { run: () => panels.current.toggle(panels.current.browser) },
      "view.inspector": { run: () => panels.current.toggle(panels.current.inspector) },
      "view.dock": { run: () => panels.current.toggle(panels.current.dock) },
    });
    const unsub = ed.subscribe(() => registry.changed());
    return () => {
      unsub();
      off();
    };
  }, [ed, registry]);

  // Play menu (spec 12, D131).
  useEffect(() => {
    const off = registry.register({
      "play.start": { run: () => playtest.play() },
      "play.here": { run: () => playtest.playHere(), enabled: () => playtest.hereTarget() !== null },
      "play.restart": { run: () => playtest.restart(), enabled: () => playtest.playing },
      "play.restartScene": { run: () => playtest.restartScene(), enabled: () => playtest.session !== null },
      "play.stop": { run: () => playtest.stop(), enabled: () => playtest.playing },
    });
    // Trace events change the playtest often; menus only care whether a game runs.
    let shown = "";
    const refresh = () => {
      const now = `${playtest.playing}/${playtest.session !== null}/${playtest.hereTarget() !== null}`;
      if (now !== shown) (shown = now), registry.changed();
    };
    const unsubs = [playtest.subscribe(refresh), ws.subscribe(refresh)];
    return () => {
      unsubs.forEach((u) => u());
      off();
    };
  }, [playtest, ws, registry]);

  // Something asked to show the Dock (Play opens Playtest; errors open Problems, D38).
  const dockRequest = ws.dockRequest;
  useEffect(() => {
    if (dockRequest > 0 && dock.current?.isCollapsed()) dock.current.expand();
  }, [dockRequest]);

  // Scene canvas view state lives in .editor/view.json (D101).
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
    {/* One drag context for the whole workspace: browser rows drop on folders and on scene canvases (D92). */}
    <CanvasImagesContext.Provider value={images}>
    <DndContext sensors={sensors} collisionDetection={pointerWithin}>
    <div className="flex h-full flex-col">
      <TitleBar>
        <span className="truncate text-[13px] font-semibold">{projectTitle(ed.project)}</span>
        <div className="flex items-center">
          <IconButton label={ed.history.undoLabel ? `Undo ${ed.history.undoLabel}` : "Undo"} disabled={!ed.history.canUndo} onClick={() => ed.undo()}>
            <Undo2 />
          </IconButton>
          <IconButton label={ed.history.redoLabel ? `Redo ${ed.history.redoLabel}` : "Redo"} disabled={!ed.history.canRedo} onClick={() => ed.redo()}>
            <Redo2 />
          </IconButton>
        </div>
        <SaveStatus editor={ed} />
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label="Show project browser" active={shown(browser)} onClick={() => toggle(browser)}>
            <PanelLeft />
          </IconButton>
          <IconButton label="Show problems and playtest" active={shown(dock)} onClick={() => toggle(dock)}>
            <PanelBottom />
          </IconButton>
          <IconButton label="Show inspector" active={shown(inspector)} onClick={() => toggle(inspector)}>
            <PanelRight />
          </IconButton>
          {!nativeMenu && (
            <Button variant="ghost" size="xs" className="ml-2" onClick={onClose}>
              Close project
            </Button>
          )}
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
          <ResizablePanelGroup orientation="vertical" id="questforge.rows" defaultLayout={rows.defaultLayout} onLayoutChanged={rows.onLayoutChanged}>
            <ResizablePanel id="tabs" minSize="25%">
              <main className="h-full">
                <EditorTabs actions={actions} />
              </main>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="dock" panelRef={dock} defaultSize="28%" minSize="80px" collapsible className="bg-panel" onResize={() => setTick((t) => t + 1)}>
              <footer className="flex h-full flex-col">
                <Dock actions={actions} playtest={playtest} />
              </footer>
            </ResizablePanel>
          </ResizablePanelGroup>
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
