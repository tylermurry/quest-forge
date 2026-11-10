import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LayoutGrid, Maximize, Play, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { nodePorts, type DialogueFile, type Project } from "@questforge/schema";
import type { Actions } from "../../model/actions.ts";
import type { CommandId } from "../../model/appCommands.ts";
import { pathWithin } from "../../model/locate.ts";
import { CREATE_TYPES, NODE_LABEL, addNode, connect, deleteNodes, layoutDialogue, moveNodes, type NodeType } from "../../model/dialogue/commands.ts";
import { problemsByNode } from "../../model/dialogue/problems.ts";
import { Button } from "../components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { useCommands } from "../hooks.ts";
import { NodeCard, type FlowNode } from "./NodeCard.tsx";

// The dialogue graph tab: React Flow over the dialogue file.
// Every change is one editor command (one undo step); a drag commits on drop.
// Selecting a node edits it in the Inspector (NodeInspector).

const NODE_TYPES = { dialogue: NodeCard };
const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/** Edge IDs name the port they leave from: `<node>|<port>`. */
const edgeId = (node: string, port: string) => `${node}|${port}`;

function edgesOf(d: DialogueFile): Edge[] {
  const ids = new Set(d.nodes.map((n) => n.id));
  return d.nodes.flatMap((n) =>
    nodePorts(n).flatMap((p) =>
      p.next !== null && ids.has(p.next) ? [{ id: edgeId(n.id, p.port), source: n.id, sourceHandle: p.port, target: p.next, type: "default" }] : [],
    ),
  );
}

export function DialogueEditor({ actions, dialogueId }: { actions: Actions; dialogueId: string }) {
  return (
    <ReactFlowProvider>
      <Graph actions={actions} dialogueId={dialogueId} />
    </ReactFlowProvider>
  );
}

interface CreateMenu {
  /** Where it opens, in the graph area's pixels. */
  at: { x: number; y: number };
  /** Where the node goes, in graph coordinates. */
  pos: [number, number];
  from?: { node: string; port: string };
}

function Graph({ actions, dialogueId }: { actions: Actions; dialogueId: string }) {
  const { editor, ws } = actions;
  const registry = useCommands();
  const rf = useReactFlow<FlowNode, Edge>();
  const wrapper = useRef<HTMLDivElement | null>(null);
  const project = editor.project;
  const doc = project.dialogues.find((d) => d.data.id === dialogueId);
  const d = doc?.data;
  const sel = ws.selection;
  const selectedNode = sel?.kind === "dialogueNode" && sel.dialogue === dialogueId ? sel.node : null;
  const byNode = useMemo(() => (doc ? problemsByNode(editor.problems, doc.path, doc.data) : new Map()), [editor.problems, doc]);
  const [flash, setFlash] = useState<{ node: string; seq: number; log: boolean } | null>(null);
  const [menu, setMenu] = useState<CreateMenu | null>(null);

  // Local React Flow state follows the file; drags change it until the drop commits.
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  useEffect(() => {
    if (!d) return;
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return d.nodes.map((n): FlowNode => {
        const was = old.get(n.id);
        return {
          ...was,
          id: n.id,
          type: "dialogue",
          position: { x: n.pos[0], y: n.pos[1] },
          deletable: n.type !== "start",
          selected: n.id === selectedNode || (selectedNode === null && !!was?.selected),
          data: {
            node: n,
            project,
            problems: byNode.get(n.id) ?? [],
            flash: flash?.node === n.id ? flash.seq : 0,
            flashLog: flash?.node === n.id && flash.log,
          },
        };
      });
    });
    setEdges((prev) => {
      const picked = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      return edgesOf(d).map((e) => ({ ...e, selected: picked.has(e.id) }));
    });
  }, [d, project, byNode, selectedNode, flash]);

  // Jump-to: centre the node the problem points at and flash it.
  const highlight = ws.highlight;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per jump request (seq); re-running when other values change would re-centre the view
  useEffect(() => {
    if (!highlight || !doc || highlight.location.file !== doc.path) return;
    const i = highlight.location.path[1];
    const n = typeof i === "number" && pathWithin(highlight.location.path, ["nodes", i]) ? doc.data.nodes[i] : undefined;
    if (!n) return;
    setFlash({ node: n.id, seq: highlight.seq, log: highlight.tone === "log" });
    void rf.setCenter(n.pos[0] + 120, n.pos[1] + 40, { zoom: Math.max(rf.getZoom(), 0.8), duration: 300 });
  }, [highlight?.seq]);

  const run = (label: string, f: (p: Project) => Project): boolean => editor.apply(label, f);
  const selectNode = (node: string) => ws.select({ kind: "dialogueNode", dialogue: dialogueId, node });

  const create = (type: NodeType, m: CreateMenu) => {
    const made = editor.applyWith(`Add ${NODE_LABEL[type]} node`, (p) => addNode(p, dialogueId, type, m.pos, m.from));
    setMenu(null);
    if (made) selectNode(made.id);
  };

  /** A new node from the toolbar goes in the middle of the view. */
  const createAtCentre = (type: NodeType) => {
    const box = wrapper.current?.getBoundingClientRect();
    const c = rf.screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 });
    create(type, { at: { x: 0, y: 0 }, pos: [c.x - 120, c.y - 30] });
  };

  // After auto-layout, fit once the new positions are on screen.
  const fitAfterSync = useRef(false);
  useEffect(() => {
    if (!fitAfterSync.current) return;
    fitAfterSync.current = false;
    requestAnimationFrame(() => void rf.fitView({ duration: 300, padding: 0.15, maxZoom: 1 }));
  }, [nodes, rf]);

  // Registry: Delete, Auto-layout, Fit. Delete takes selected nodes, else selected edges.
  const live = useRef({ nodes, edges });
  live.current = { nodes, edges };
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handlers read the latest values through refs and `run`; re-registering on every change would only churn the command registry
  useEffect(() => {
    const selectedNodes = () => live.current.nodes.filter((n) => n.selected && n.data.node.type !== "start").map((n) => n.id);
    const selectedEdges = () => live.current.edges.filter((e) => e.selected);
    const off = registry.register({
      "edit.delete": {
        run: () => {
          const ns = selectedNodes();
          if (ns.length) {
            run(ns.length === 1 ? "Delete node" : `Delete ${ns.length} nodes`, (p) => deleteNodes(p, dialogueId, ns));
            return;
          }
          const es = selectedEdges();
          if (es.length)
            run(es.length === 1 ? "Disconnect" : `Disconnect ${es.length}`, (p) =>
              es.reduce((q, e) => connect(q, dialogueId, e.source, e.sourceHandle!, null), p),
            );
        },
        enabled: () => selectedNodes().length > 0 || selectedEdges().length > 0,
      },
      "dialogue.layout": {
        run: () => {
          if (run("Auto-layout", (p) => layoutDialogue(p, dialogueId))) fitAfterSync.current = true;
        },
      },
      "dialogue.fit": { run: () => void rf.fitView({ duration: 300, padding: 0.15, maxZoom: 1 }) },
    } satisfies Partial<Record<CommandId, unknown>>);
    return off;
  }, [registry, dialogueId, rf]);
  useEffect(() => registry.changed(), [nodes, edges, registry]);

  useEffect(() => {
    Object.assign(window, { dialogueGraph: rf });
  }, [rf]);

  if (!d) return null;

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    setNodes((ns) =>
      applyNodeChanges(
        changes.filter((c) => c.type !== "remove"),
        ns,
      ),
    );
    // Space/Enter on a focused node only marks it selected in React Flow; open it in the Inspector like a click does.
    // The sync above sets `selected` on local state directly and never emits changes, so this cannot loop.
    const picked = changes.flatMap((c) => (c.type === "select" && c.selected ? [c.id] : []));
    if (picked.length === 1 && picked[0] !== selectedNode) selectNode(picked[0]!);
  };
  const onEdgesChange = (changes: EdgeChange[]) =>
    setEdges((es) =>
      applyEdgeChanges(
        changes.filter((c) => c.type !== "remove"),
        es,
      ),
    );

  const onConnect = (c: Connection) => {
    if (!c.sourceHandle || c.source === c.target) return;
    run("Connect", (p) => connect(p, dialogueId, c.source, c.sourceHandle!, c.target));
  };

  // Dropping a dragged port on empty space opens the "create node" menu.
  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source" || !state.fromHandle.id) return;
    const target = (event.target as Element | null)?.closest?.(".react-flow__node");
    if (target) return;
    const pt = "changedTouches" in event ? event.changedTouches[0]! : event;
    const box = wrapper.current!.getBoundingClientRect();
    const pos = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
    setMenu({
      at: { x: pt.clientX - box.left, y: pt.clientY - box.top },
      pos: [pos.x, pos.y - 20],
      from: { node: state.fromNode.id, port: state.fromHandle.id },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-panel flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-[12px]">
              <Plus className="size-3.5" /> Node
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onPointerDown={stop} onClick={stop}>
            {CREATE_TYPES.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => createAtCentre(t)}>
                {NODE_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => registry.run("dialogue.layout")}>
          <LayoutGrid className="size-3.5" /> Auto-layout
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => registry.run("dialogue.fit")}>
          <Maximize className="size-3.5" /> Fit
        </Button>
        <span className="flex-1" />
        <span className="text-muted-foreground hidden truncate text-[12px] xl:inline" title="Drag from a port to empty space to add a node">
          Drag from a port to empty space to add a node
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-2 h-7 text-[12px]"
          disabled={!registry.isEnabled("play.node")}
          onClick={() => registry.run("play.node")}
          title="Play from the selected node (Shift+F6)"
        >
          <Play className="size-3.5" /> Play from node
        </Button>
      </div>
      <div ref={wrapper} className="relative min-h-0 flex-1" data-dialogue-graph={dialogueId}>
        <ReactFlow<FlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          colorMode="dark"
          style={{ "--xy-edge-stroke-selected": "#f5b942" } as CSSProperties}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.2}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) => c.source !== c.target && !!c.sourceHandle && d.nodes.find((n) => n.id === c.target)?.type !== "start"}
          onNodeClick={(_, n) => selectNode(n.id)}
          onPaneClick={() => {
            setMenu(null);
            ws.select({ kind: "entry", section: "dialogue", id: dialogueId });
          }}
          onNodeDragStop={(_, __, dragged) => {
            const moves = dragged.map((n) => ({ id: n.id, pos: [n.position.x, n.position.y] as [number, number] }));
            run(moves.length === 1 ? "Move node" : `Move ${moves.length} nodes`, (p) => moveNodes(p, dialogueId, moves));
          }}
        >
          <Background gap={24} />
          <MiniMap pannable zoomable className="!bg-panel" style={{ width: 160, height: 110 }} nodeStrokeWidth={3} ariaLabel="Dialogue minimap" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {menu && (
          <DropdownMenu open onOpenChange={(o) => !o && setMenu(null)}>
            <DropdownMenuTrigger asChild>
              <div className="pointer-events-none absolute size-px" style={{ left: menu.at.x, top: menu.at.y }} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onPointerDown={stop} onClick={stop} aria-label="Create node">
              <DropdownMenuLabel className="text-muted-foreground text-[11px]">Create node</DropdownMenuLabel>
              {CREATE_TYPES.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => create(t, menu)}>
                  {NODE_LABEL[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
