import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Footprints,
  Ghost,
  Lock,
  LockOpen,
  Magnet,
  MapPin,
  Maximize,
  MousePointer2,
  Pentagon,
  Route,
  Scan,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useDndMonitor, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Actions, DeleteWarning } from "../../model/actions.ts";
import type { CommandId } from "../../model/appCommands.ts";
import { SceneTools } from "../../model/scene/tools.ts";
import { LAYERS, LAYER_LABEL, LAYER_TOOLS, TOOL_LABEL, type Aids, type Layer, type Tool } from "../../model/scene/sceneUi.ts";
import { LIST_LAYER, layerRows, sameThing, type LayerRow, type ThingRef } from "../../model/scene/things.ts";
import { zoomLabel } from "../../model/scene/view.ts";
import { Button } from "../components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.tsx";
import { ConfirmDelete } from "../Dialogs.tsx";
import { useCommands } from "../hooks.ts";
import { cn } from "../lib/utils.ts";
import { useCanvasImages } from "./images.ts";
import { SceneCanvas } from "./SceneCanvas.tsx";

const TOOL_ICON: Record<Tool, React.ReactNode> = {
  select: <MousePointer2 />,
  polygon: <Pentagon />,
  rect: <Square />,
  spawn: <MapPin />,
  walkto: <Footprints />,
};
const TOOL_KEY: Record<Tool, string> = { select: "V", polygon: "P", rect: "R", spawn: "S", walkto: "W" };

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
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

/** A scene tab: toolbar, Layers panel and canvas. */
export function SceneEditor({ actions, sceneId }: { actions: Actions; sceneId: string }) {
  const { ws, editor } = actions;
  const registry = useCommands();
  const images = useCanvasImages(editor.project);
  const [c] = useState(() => new SceneTools({ editor, ws, scene: sceneId, images: images.lookup }));
  useSyncExternalStore(ws.sceneUi.subscribe, () => ws.sceneUi.version);
  useSyncExternalStore(c.subscribe, () => c.version);
  const [confirm, setConfirm] = useState<{ warning: DeleteWarning; run(): void } | null>(null);

  // Debugging aid like window.editor: the open scene's controller and images.
  useEffect(() => {
    Object.assign(window, { scene: c, sceneImages: images });
  }, [c, images]);

  const remove = (ref: ThingRef) => {
    const warning = c.deleteWarning(ref);
    if (warning) setConfirm({ warning, run: () => c.deleteThing(ref) });
    else c.deleteThing(ref);
  };

  // Scene menu and Delete run through the command registry.
  const live = { c, remove };
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handlers close over the controller `c`; re-registering on other values would only churn the command registry
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
      offs.forEach((o) => {
        o();
      });
      off();
    };
  }, [c, registry, ws]);

  // Browser rows dropped on the canvas place objects and characters; Objects rows reorder.
  const canvasDrop = useDroppable({ id: `scene-canvas:${sceneId}`, data: { kind: "sceneCanvas" } });
  const canvasEl = useRef<HTMLElement | null>(null);
  useDndMonitor({
    onDragEnd: (e: DragEndEvent) => {
      const target = e.over?.data.current as { kind?: string; index?: number } | undefined;
      const item = e.active.data.current as { kind?: string; section?: string; id?: string } | undefined;
      if (!target || !item) return;
      if (target.kind === "sceneCanvas" && item.kind === "entry" && item.section && item.id) {
        const start = e.activatorEvent as PointerEvent | MouseEvent | null;
        const r = canvasEl.current?.getBoundingClientRect();
        if (!start || !r) return;
        c.dropEntry({ section: item.section, id: item.id }, [start.clientX + e.delta.x - r.left, start.clientY + e.delta.y - r.top]);
      }
      if (target.kind === "objectSlot" && item.kind === "layerObject" && item.id && target.index !== undefined) c.reorder(item.id, target.index);
    },
  });
  const draggingEntry = (() => {
    const a = canvasDrop.active?.data.current as { kind?: string; section?: string } | undefined;
    return a?.kind === "entry" && (a.section === "image" || a.section === "character");
  })();

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
        <ToolButton
          label={ui.snap ? "Snapping to vertices and edges is on" : "Snapping to vertices and edges is off"}
          pressed={ui.snap}
          onClick={() => c.toggleSnap()}
        >
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
        <SceneCanvas
          controller={c}
          redraw={images.subscribe}
          onDropFiles={(files, at) => void readFiles(files).then((read) => c.dropFiles(read, at))}
          dropRef={(el) => {
            canvasEl.current = el;
            canvasDrop.setNodeRef(el);
          }}
          highlight={draggingEntry && canvasDrop.isOver}
        >
          {!scene.background && !ui.hidden.includes("background") && <EmptyBackground c={c} />}
        </SceneCanvas>
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

const readFiles = (files: File[]) => Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));

/** The prompt on a scene with no background: drop an image, pick one, or import one. */
function EmptyBackground({ c }: { c: SceneTools }) {
  const picker = useRef<HTMLInputElement | null>(null);
  const images = c.editor.project.assets?.data.images ?? [];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
      <div
        className="bg-popover/95 pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] shadow-md"
        role="group"
        aria-label="Background"
      >
        <span className="text-muted-foreground">Drop an image or choose a background</span>
        <Select onValueChange={(v) => c.chooseBackground(v)}>
          <SelectTrigger size="sm" aria-label="Choose background" className="h-7 w-40 text-[12px]">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent onPointerDown={(e) => e.stopPropagation()}>
            {images.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="xs" variant="secondary" onClick={() => picker.current?.click()}>
          <ImageIcon /> Import image…
        </Button>
        <input
          ref={picker}
          type="file"
          hidden
          aria-label="Import background image"
          accept=".png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void readFiles(files).then((read) => c.dropFiles(read, null));
          }}
        />
      </div>
    </div>
  );
}

/**
 * A row in the Layers panel. Object rows can be dragged onto another row of the
 * Objects list to change draw order; every Objects row is a drop slot.
 */
function LayerRowItem({
  row,
  index,
  className,
  label,
  children,
}: {
  row: LayerRow;
  index: number;
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  const isObjects = LIST_LAYER[row.ref.list] === "objects";
  const drag = useDraggable({ id: `layer-row:${row.ref.list}:${row.ref.key}`, data: { kind: "layerObject", id: row.ref.key }, disabled: !row.draggable });
  const drop = useDroppable({ id: `object-slot:${row.ref.list}:${row.ref.key}`, data: { kind: "objectSlot", index }, disabled: !isObjects });
  const over = drop.isOver && (drop.active?.data.current as { kind?: string } | undefined)?.kind === "layerObject";
  return (
    <li
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      className={cn(className, drag.isDragging && "opacity-40", over && "shadow-[inset_0_2px_0_var(--color-primary)]")}
      aria-label={label}
      {...(row.draggable ? { ...drag.attributes, ...drag.listeners, tabIndex: undefined, role: undefined } : {})}
    >
      {children}
    </li>
  );
}

/** The fixed layer stack: show/lock per layer, and what's on it. */
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
              <button
                className={cn("min-w-0 flex-1 truncate py-1 text-left font-semibold", hidden && "text-muted-foreground")}
                aria-current={active}
                onClick={() => c.setLayer(layer)}
              >
                {LAYER_LABEL[layer]}
              </button>
              <span className="text-muted-foreground pr-1">{rows[layer].length || ""}</span>
            </div>
            <ul>
              {rows[layer].map((row, index) => {
                const selected = sameThing(sel, row.ref);
                return (
                  <LayerRowItem
                    key={`${row.ref.list}:${row.ref.key}`}
                    row={row}
                    index={index}
                    className={cn("group/row hover:bg-muted flex h-6 items-center gap-1 pr-1 pl-8", selected && "bg-selection hover:bg-selection")}
                    label={`${LAYER_LABEL[layer]}: ${row.title}`}
                  >
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
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                        aria-label={`Delete ${row.title}`}
                        onClick={() => onDelete(row.ref)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </LayerRowItem>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
