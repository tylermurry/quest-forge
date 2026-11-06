import { Eye, EyeOff, Footprints, Ghost, Lock, LockOpen, Magnet, MapPin, Maximize, MousePointer2, Pentagon, Route, Scan, Square, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Actions, DeleteWarning } from "../../model/actions.ts";
import type { CommandId } from "../../model/appCommands.ts";
import { SceneTools } from "../../model/scene/tools.ts";
import { LAYERS, LAYER_LABEL, LAYER_TOOLS, TOOL_LABEL, type Aids, type Layer, type Tool } from "../../model/scene/sceneUi.ts";
import { LIST_LAYER, layerRows, sameThing, type ThingRef } from "../../model/scene/things.ts";
import { zoomLabel } from "../../model/scene/view.ts";
import { Button } from "../components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.tsx";
import { ConfirmDelete } from "../Dialogs.tsx";
import { useCommands } from "../hooks.ts";
import { cn } from "../lib/utils.ts";
import { CanvasImages } from "./images.ts";
import { SceneCanvas } from "./SceneCanvas.tsx";

const TOOL_ICON: Record<Tool, React.ReactNode> = {
  select: <MousePointer2 />,
  polygon: <Pentagon />,
  rect: <Square />,
  spawn: <MapPin />,
  walkto: <Footprints />,
};
const TOOL_KEY: Record<Tool, string> = { select: "V", polygon: "P", rect: "R", spawn: "S", walkto: "W" };

function ToolButton({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn("size-7", pressed && "bg-selection text-foreground hover:bg-selection")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A scene tab (spec 09, D103): toolbar, Layers panel and canvas. */
export function SceneEditor({ actions, sceneId }: { actions: Actions; sceneId: string }) {
  const { ws, editor } = actions;
  const registry = useCommands();
  const [images] = useState(() => new CanvasImages((path) => actions.assetUrl?.(path)));
  const [c] = useState(() => new SceneTools({ editor, ws, scene: sceneId, images: images.lookup }));
  useSyncExternalStore(ws.sceneUi.subscribe, () => ws.sceneUi.version);
  useSyncExternalStore(images.subscribe, () => images.version);
  useSyncExternalStore(c.subscribe, () => c.version);
  const [confirm, setConfirm] = useState<{ warning: DeleteWarning; run(): void } | null>(null);

  useEffect(() => images.sync(editor.project), [images, editor.project]);
  // Debugging aid like window.editor: the open scene's controller and images.
  useEffect(() => {
    Object.assign(window, { scene: c, sceneImages: images });
  }, [c, images]);
  useEffect(() => () => images.dispose(), [images]);

  const remove = (ref: ThingRef) => {
    const warning = c.deleteWarning(ref);
    if (warning) setConfirm({ warning, run: () => c.deleteThing(ref) });
    else c.deleteThing(ref);
  };

  // Scene menu and Delete run through the command registry (D92).
  const live = { c, remove };
  useEffect(() => {
    const tool = (t: Tool) => ({ run: () => c.setTool(t), enabled: () => LAYER_TOOLS[c.ui.layer].includes(t) });
    const off = registry.register({
      "scene.tool.select": tool("select"),
      "scene.tool.polygon": tool("polygon"),
      "scene.tool.rect": tool("rect"),
      "scene.tool.spawn": tool("spawn"),
      "scene.tool.walkto": tool("walkto"),
      "scene.finish": { run: () => c.finish(), enabled: () => c.isDrawing },
      "scene.cancel": { run: () => c.cancel(), enabled: () => c.isDrawing || c.selection !== null },
      "scene.snap": { run: () => c.toggleSnap(), label: () => (c.ui.snap ? "Turn Off Snapping" : "Snap to Vertices and Edges") },
      "scene.zoomIn": { run: () => c.zoomIn() },
      "scene.zoomOut": { run: () => c.zoomOut() },
      "scene.zoomFit": { run: () => c.zoomFit() },
      "scene.zoomActual": { run: () => c.zoomActual() },
      "edit.delete": {
        run: () => {
          if (c.isDrawing) return c.removeLastPoint();
          const sel = live.c.selection;
          if (sel) live.remove(sel);
        },
        enabled: () => c.isDrawing || c.canDelete(),
      },
    } satisfies Partial<Record<CommandId, unknown>>);
    const offs = [c.subscribe(() => registry.changed()), ws.sceneUi.subscribe(() => registry.changed())];
    return () => {
      offs.forEach((o) => o());
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, registry, ws]);

  const scene = c.scene;
  if (!scene) return null;
  const ui = c.ui;
  const t = c.transform;
  const setAid = (k: keyof Aids) => ws.sceneUi.update(sceneId, (u) => ({ ...u, aids: { ...u.aids, [k]: !u.aids[k] } }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-panel flex h-9 shrink-0 items-center gap-0.5 border-b px-2" role="toolbar" aria-label="Scene tools">
        {LAYER_TOOLS[ui.layer].map((tool) => (
          <ToolButton key={tool} label={`${TOOL_LABEL[tool]} (${TOOL_KEY[tool]})`} pressed={ui.tool === tool} onClick={() => c.setTool(tool)}>
            {TOOL_ICON[tool]}
          </ToolButton>
        ))}
        <span className="bg-border mx-1.5 h-5 w-px" />
        <ToolButton label={ui.snap ? "Snapping to vertices and edges is on" : "Snapping to vertices and edges is off"} pressed={ui.snap} onClick={() => c.toggleSnap()}>
          <Magnet />
        </ToolButton>
        <ToolButton label="Depth preview (ghost of the player)" pressed={ui.aids.ghost} onClick={() => setAid("ghost")}>
          <Ghost />
        </ToolButton>
        <ToolButton label="Shade the walkable area" pressed={ui.aids.shading} onClick={() => setAid("shading")}>
          <Scan />
        </ToolButton>
        <ToolButton label="Path preview from the default spawn" pressed={ui.aids.path} onClick={() => setAid("path")}>
          <Route />
        </ToolButton>
        <span className="text-muted-foreground ml-3 truncate text-[12px]">{c.hint}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton label="Zoom out" onClick={() => c.zoomOut()}>
            <ZoomOut />
          </ToolButton>
          <button className="hover:bg-muted h-7 min-w-16 rounded-md px-1.5 text-[12px] tabular-nums" aria-label="Zoom to 1×" onClick={() => c.zoomActual()}>
            {zoomLabel(ui.zoom, t)}
          </button>
          <ToolButton label="Zoom in" onClick={() => c.zoomIn()}>
            <ZoomIn />
          </ToolButton>
          <ToolButton label="Zoom to fit" pressed={ui.zoom.fit} onClick={() => c.zoomFit()}>
            <Maximize />
          </ToolButton>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <LayersPanel c={c} onDelete={remove} />
        <SceneCanvas controller={c} redraw={images.subscribe} onDropFiles={(files, at) => c.dropFiles?.(files, at)} />
      </div>
      {confirm && (
        <ConfirmDelete
          warning={confirm.warning}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

/** The fixed layer stack (spec 09, D15, D103): show/lock per layer, and what's on it. */
function LayersPanel({ c, onDelete }: { c: SceneTools; onDelete(ref: ThingRef): void }) {
  const scene = c.scene!;
  const ui = c.ui;
  const rows = layerRows(scene, c.host.images);
  const store = c.host.ws.sceneUi;
  const sel = c.selection;
  return (
    <nav aria-label="Layers" className="bg-panel w-56 shrink-0 overflow-y-auto border-r py-1 text-[12px]">
      {LAYERS.map((layer: Layer) => {
        const hidden = ui.hidden.includes(layer);
        const locked = ui.locked.includes(layer);
        const active = ui.layer === layer;
        return (
          <section key={layer} aria-label={`${LAYER_LABEL[layer]} layer`} className="mb-1">
            <div className={cn("group flex h-7 items-center gap-0.5 px-1", active && "bg-selection")}>
              <button
                className="hover:bg-muted flex size-6 items-center justify-center rounded-sm [&_svg]:size-3.5"
                aria-label={`${hidden ? "Show" : "Hide"} ${LAYER_LABEL[layer]}`}
                aria-pressed={!hidden}
                onClick={() => store.toggleHidden(c.sceneId, layer)}
              >
                {hidden ? <EyeOff className="text-muted-foreground" /> : <Eye />}
              </button>
              <button
                className="hover:bg-muted flex size-6 items-center justify-center rounded-sm [&_svg]:size-3.5"
                aria-label={`${locked ? "Unlock" : "Lock"} ${LAYER_LABEL[layer]}`}
                aria-pressed={locked}
                onClick={() => store.toggleLocked(c.sceneId, layer)}
              >
                {locked ? <Lock /> : <LockOpen className="text-muted-foreground opacity-40 group-hover:opacity-100" />}
              </button>
              <button className={cn("min-w-0 flex-1 truncate py-1 text-left font-semibold", hidden && "text-muted-foreground")} aria-current={active} onClick={() => c.setLayer(layer)}>
                {LAYER_LABEL[layer]}
              </button>
              <span className="text-muted-foreground pr-1">{rows[layer].length || ""}</span>
            </div>
            <ul>
              {rows[layer].map((row) => {
                const selected = sameThing(sel, row.ref);
                return (
                  <li key={`${row.ref.list}:${row.ref.key}`} className={cn("group/row hover:bg-muted flex h-6 items-center gap-1 pr-1 pl-8", selected && "bg-selection hover:bg-selection")} aria-label={`${LAYER_LABEL[layer]}: ${row.title}`}>
                    <button
                      className={cn("min-w-0 flex-1 truncate text-left", (hidden || locked) && "text-muted-foreground")}
                      aria-selected={selected}
                      onClick={() => {
                        c.setLayer(LIST_LAYER[row.ref.list]);
                        c.select(row.ref);
                      }}
                    >
                      {row.title} <span className="text-muted-foreground ml-0.5">{row.detail}</span>
                    </button>
                    {row.deletable && (
                      <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" aria-label={`Delete ${row.title}`} onClick={() => onDelete(row.ref)}>
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
