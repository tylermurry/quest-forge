import { ChevronDown, ChevronRight, Ellipsis, Folder, FolderOpen, Search } from "lucide-react";
import { DragOverlay, useDndMonitor, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useMemo, useRef, useState, type DragEvent, type ReactNode, type Ref } from "react";
import { NOUN, type Actions, type DeleteWarning, type DragItem } from "../model/actions.ts";
import { SECTIONS, buildSection, countEntries, filterTree, isAssetKind, opensTab, sectionEntries, type Entry, type FolderNode, type Section } from "../model/browser.ts";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "./components/ui/context-menu.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu.tsx";
import { Input } from "./components/ui/input.tsx";
import { ConfirmDelete, MenuItems, Prompt, type MenuItem, type MenuParts } from "./Dialogs.tsx";
import { cn } from "./lib/utils.ts";

const CONTEXT: MenuParts = { Item: ContextMenuItem, Separator: ContextMenuSeparator };
const DROPDOWN: MenuParts = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator };

type Popup = { kind: "delete"; warning: DeleteWarning; run(): void } | { kind: "changeId"; section: Section; id: string } | null;

type Editing = { section: Section; kind: "entry"; id: string; value: string } | { section: Section; kind: "folder"; path: string; value: string } | null;

/** Reads dropped or picked files and imports them (D88). */
async function importInto(actions: Actions, section: Section, folder: string, files: File[]) {
  const read = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  actions.importFiles(section, folder, read);
}

/** A row with a right-click menu and a "⋯" button showing the same items. */
function MenuRow({
  items,
  label,
  className,
  children,
  rowRef,
  ...rest
}: { items: MenuItem[]; label: string; className?: string; children: ReactNode; rowRef?: Ref<HTMLDivElement> } & React.HTMLAttributes<HTMLDivElement>) {
  // When a menu closes, an inline rename box it opened gets focus instead of the row.
  const keepFocus = (e: Event) => {
    const box = document.querySelector<HTMLInputElement>("input[data-rename]");
    if (!box) return;
    e.preventDefault();
    box.focus();
    box.select();
  };
  // Menu content is portaled, but React still bubbles its events to the row (click would toggle or select it).
  const contain = {
    onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.SyntheticEvent) => e.stopPropagation(),
    onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={rowRef} className={cn("group flex h-6 items-center gap-1 rounded-sm pr-1 outline-none", className)} {...rest}>
          {children}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={label}
              className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44" onCloseAutoFocus={keepFocus} {...contain}>
              <MenuItems items={items} parts={DROPDOWN} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44" onCloseAutoFocus={keepFocus} {...contain}>
        <MenuItems items={items} parts={CONTEXT} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Drop target data: a folder (`""` = the section root). */
/** Browser rows carry their DragItem; other draggables (Objects rows) carry other data. */
const isDragItem = (x: unknown): x is DragItem => !!x && typeof x === "object" && "section" in x && ((x as DragItem).kind === "entry" || (x as DragItem).kind === "folder");

interface DropTarget {
  kind: "browserFolder";
  section: Section;
  folder: string;
}

const dragId = (item: DragItem) => (item.kind === "entry" ? `entry:${item.section}:${item.id}` : `folder:${item.section}:${item.path}`);

/**
 * A browser row that can be dragged (dnd-kit, D92) and, for folders and section
 * headers, dropped on. Files dragged in from the OS still arrive as HTML5 drops (D88).
 */
function DndRow({
  drag,
  drop,
  onFiles,
  onPointerDown,
  className,
  ...props
}: React.ComponentProps<typeof MenuRow> & { drag?: DragItem; drop?: DropTarget; onFiles?(files: File[]): void }) {
  const draggable = useDraggable({ id: drag ? dragId(drag) : `none:${props.label}`, data: drag, disabled: !drag });
  const droppable = useDroppable({ id: drop ? `drop:${drop.section}:${drop.folder}` : `nodrop:${props.label}`, data: drop, disabled: !drop });
  const [filesOver, setFilesOver] = useState(false);
  const ref = (el: HTMLDivElement | null) => {
    draggable.setNodeRef(el);
    droppable.setNodeRef(el);
  };
  const over = (droppable.isOver && droppable.active?.data.current?.section === drop?.section) || filesOver;
  const fileDrop = onFiles && {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      setFilesOver(true);
    },
    onDragLeave: () => setFilesOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFilesOver(false);
      if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
    },
  };
  return (
    <MenuRow
      {...props}
      {...fileDrop}
      rowRef={ref}
      data-drop={over ? "true" : undefined}
      className={cn(className, draggable.isDragging && "opacity-40")}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        draggable.listeners?.onPointerDown?.(e);
      }}
    />
  );
}

/** The project browser (spec 08). Thin: every change goes through Actions. */
export function ProjectBrowser({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const project = editor.project;
  const [popup, setPopup] = useState<Popup>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [pickTarget, setPickTarget] = useState<{ section: Section; folder: string } | null>(null);
  const trees = useMemo(() => SECTIONS.map((s) => ({ ...s, tree: buildSection(project, s.section) })), [project]);
  const onImport = (section: Section, folder: string, files: File[]) => void importInto(actions, section, folder, files);

  const askDelete = (warning: DeleteWarning | null, run: () => void) => (warning ? setPopup({ kind: "delete", warning, run }) : run());

  const entryMenu = (e: Entry): MenuItem[] => [
    ...(opensTab(e.section) ? [{ label: "Open", onSelect: () => ws.open({ section: e.section, id: e.id }) }] : []),
    { label: "Rename", onSelect: () => setEditing({ section: e.section, kind: "entry", id: e.id, value: e.name }) },
    ...(isAssetKind(e.section) ? [{ label: "Change ID…", onSelect: () => setPopup({ kind: "changeId", section: e.section, id: e.id }) }] : []),
    ...(e.section !== "image" && e.section !== "audio" ? [{ label: "Duplicate", onSelect: () => actions.duplicate(e.section, e.id) }] : []),
    { label: "Delete", separated: true, destructive: true, onSelect: () => askDelete(actions.deleteWarning(e.section, e.id), () => actions.delete(e.section, e.id)) },
  ];

  const folderMenu = (section: Section, path: string): MenuItem[] => [
    { label: "New folder", onSelect: () => startNewFolder(section, path) },
    ...(section !== "image" && section !== "audio" ? [{ label: `New ${NOUN[section]}`, onSelect: () => actions.newEntry(section, path) }] : []),
    ...(section === "image" || section === "audio"
      ? [
          {
            label: "Import files…",
            onSelect: () => {
              setPickTarget({ section, folder: path });
              picker.current?.click();
            },
          },
        ]
      : []),
    ...(path
      ? [
          { label: "Rename folder", separated: true, onSelect: () => setEditing({ section, kind: "folder", path, value: path.split("/").pop()! }) },
          { label: "Delete folder", destructive: true, onSelect: () => askDelete(actions.deleteFolderWarning(section, path), () => actions.deleteFolder(section, path)) },
        ]
      : []),
  ];

  /** New folders start in rename mode, like Finder. */
  const startNewFolder = (section: Section, parent: string) => {
    const made = actions.newFolder(section, parent);
    if (made) setEditing({ section, kind: "folder", path: made, value: made.split("/").pop()! });
  };

  // ── Drag and drop: moves inside a section (D83, D92); files from the OS (D88) ──
  // The DndContext is the Workspace's (rows can also be dropped on a scene canvas); listen to it here.
  const [dragging, setDragging] = useState<DragItem | null>(null);
  useDndMonitor({
    onDragStart: (e: DragStartEvent) => setDragging(isDragItem(e.active.data.current) ? e.active.data.current : null),
    onDragEnd: (e: DragEndEvent) => {
      setDragging(null);
      const item = e.active.data.current;
      const target = e.over?.data.current as DropTarget | undefined;
      if (isDragItem(item) && target?.kind === "browserFolder") actions.drop(item, target.section, target.folder);
    },
    onDragCancel: () => setDragging(null),
  });
  const filesInto = (section: Section, folder: string) => (files: File[]) => onImport(section, folder, files);
  const draggingLabel =
    dragging &&
    (dragging.kind === "folder" ? dragging.path.split("/").pop() : (sectionEntries(project, dragging.section).find((e) => e.id === dragging.id)?.name ?? dragging.id));

  const commitEdit = () => {
    if (!editing) return;
    if (editing.kind === "entry") actions.rename(editing.section, editing.id, editing.value);
    else if (editing.value.trim() !== "") actions.renameFolder(editing.section, editing.path, editing.value);
    setEditing(null);
  };
  const editBox = (label: string) =>
    editing && (
      <input
        className="bg-background border-ring h-5 min-w-0 flex-1 rounded-sm border px-1 text-[13px] outline-none"
        aria-label={label}
        data-rename=""
        autoFocus
        value={editing.value}
        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commitEdit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          if (e.key === "Escape") setEditing(null);
          e.stopPropagation();
        }}
      />
    );

  const rowClass = (selected: boolean) =>
    cn("hover:bg-muted/70 data-[drop=true]:bg-accent data-[drop=true]:ring-ring ring-inset data-[drop=true]:ring-1", selected && "bg-selection hover:bg-selection");
  const sel = ws.selection;
  const indent = (depth: number) => ({ paddingLeft: 4 + depth * 14 });

  const renderFolder = (node: FolderNode, depth: number, searching: boolean): ReactNode => {
    const open = searching || ws.isExpanded(node.section, node.path);
    return (
      <>
        {node.folders.map((f) => {
          const isOpen = searching || ws.isExpanded(f.section, f.path);
          const selected = sel?.kind === "folder" && sel.section === f.section && sel.path === f.path;
          const isEditing = editing?.kind === "folder" && editing.section === f.section && editing.path === f.path;
          const Icon = isOpen ? FolderOpen : Folder;
          return (
            <li key={`f:${f.path}`} role="treeitem" aria-expanded={isOpen} aria-selected={selected} aria-label={`Folder ${f.path}`} className="group/item">
              <DndRow
                items={folderMenu(f.section, f.path)}
                label={`Actions for folder ${f.path}`}
                className={rowClass(selected)}
                style={indent(depth)}
                aria-selected={selected}
                drag={isEditing ? undefined : { section: f.section, kind: "folder", path: f.path }}
                drop={{ kind: "browserFolder", section: f.section, folder: f.path }}
                onFiles={filesInto(f.section, f.path)}
                onClick={() => ws.select({ kind: "folder", section: f.section, path: f.path })}
                onDoubleClick={() => ws.toggleFolder(f.section, f.path)}
              >
                <button
                  className="text-muted-foreground flex size-4 shrink-0 items-center justify-center"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                  onClick={(e) => (e.stopPropagation(), ws.toggleFolder(f.section, f.path))}
                >
                  {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <Icon className="text-muted-foreground size-3.5 shrink-0" />
                {isEditing ? editBox("Folder name") : <span className="flex-1 truncate">{f.name}</span>}
              </DndRow>
              {isOpen && <ul role="group">{renderFolder(f, depth + 1, searching)}</ul>}
            </li>
          );
        })}
        {open &&
          node.entries.map((e) => {
            const selected = sel?.kind === "entry" && sel.section === e.section && sel.id === e.id;
            const isEditing = editing?.kind === "entry" && editing.section === e.section && editing.id === e.id;
            return (
              <li key={`e:${e.id}`} role="treeitem" aria-selected={selected} aria-label={`${NOUN[e.section]} ${e.name}`}>
                <DndRow
                  items={entryMenu(e)}
                  label={`Actions for ${NOUN[e.section]} ${e.id}`}
                  className={rowClass(selected)}
                  style={indent(depth + 1.15)}
                  aria-selected={selected}
                  tabIndex={0}
                  drag={isEditing ? undefined : { section: e.section, kind: "entry", id: e.id }}
                  onClick={() => ws.select({ kind: "entry", section: e.section, id: e.id })}
                  onDoubleClick={() => opensTab(e.section) && ws.open({ section: e.section, id: e.id })}
                  onKeyDown={(ev) => {
                    if (ev.key === "F2") setEditing({ section: e.section, kind: "entry", id: e.id, value: e.name });
                    if (ev.key === "Enter" && opensTab(e.section)) ws.open({ section: e.section, id: e.id });
                    if (ev.key === "Delete" || ev.key === "Backspace") askDelete(actions.deleteWarning(e.section, e.id), () => actions.delete(e.section, e.id));
                  }}
                >
                  {isEditing ? (
                    editBox(isAssetKind(e.section) ? "Name" : "ID")
                  ) : (
                    <span className="flex-1 truncate">
                      {e.name}
                      {e.name !== e.id && <span className="text-muted-foreground ml-1.5 text-[12px]">{e.id}</span>}
                    </span>
                  )}
                </DndRow>
              </li>
            );
          })}
      </>
    );
  };

  const searching = ws.search.trim() !== "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        aria-label="Import files"
        accept=".png,.jpg,.jpeg,.webp,.mp3,.ogg,.wav"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (pickTarget && files.length) onImport(pickTarget.section, pickTarget.folder, files);
        }}
      />
      <div className="relative p-2">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2" />
        <Input className="h-7 pl-7 text-[13px]" type="search" placeholder="Search names and IDs" aria-label="Search" value={ws.search} onChange={(e) => ws.setSearch(e.target.value)} />
      </div>
      <ul role="tree" aria-label="Project" className="min-h-0 flex-1 overflow-auto px-1 pb-4">
        {trees.map(({ section, title, tree }) => {
          const shown = filterTree(tree, ws.search);
          if (searching && !shown) return null;
          const open = searching || ws.isExpanded(section, "");
          return (
            <li key={section} role="treeitem" aria-expanded={open} aria-label={title} className="mt-1.5">
              <DndRow
                items={folderMenu(section, "")}
                label={`Actions for ${title}`}
                className={cn("text-muted-foreground text-[11px] font-semibold tracking-wider uppercase", rowClass(false))}
                drop={{ kind: "browserFolder", section, folder: "" }}
                onFiles={filesInto(section, "")}
                onClick={() => ws.toggleFolder(section, "")}
              >
                <button className="flex size-4 shrink-0 items-center justify-center" aria-label={open ? `Collapse ${title}` : `Expand ${title}`} onClick={(e) => (e.stopPropagation(), ws.toggleFolder(section, ""))}>
                  {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <span className="flex-1">{title}</span>
                <span className="font-normal tabular-nums">{countEntries(shown ?? tree)}</span>
              </DndRow>
              {open && shown && <ul role="group">{renderFolder(shown, 1, searching)}</ul>}
            </li>
          );
        })}
      </ul>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="bg-popover text-popover-foreground flex h-6 w-fit items-center gap-1.5 rounded-sm border px-2 shadow-md">
            {dragging.kind === "folder" && <Folder className="text-muted-foreground size-3.5" />}
            {draggingLabel}
          </div>
        )}
      </DragOverlay>
      {popup?.kind === "delete" && (
        <ConfirmDelete
          warning={popup.warning}
          onCancel={() => setPopup(null)}
          onConfirm={() => {
            popup.run();
            setPopup(null);
          }}
        />
      )}
      {popup?.kind === "changeId" && (
        <Prompt
          title={`Change the ID of ${NOUN[popup.section]} ${popup.id}`}
          label="New ID"
          initial={popup.id}
          action="Change ID"
          hint={() => actions.changeIdImpact(popup.section, popup.id)}
          onCancel={() => setPopup(null)}
          onSubmit={(v) => {
            if (actions.changeId(popup.section, popup.id, v.trim())) setPopup(null);
          }}
        />
      )}
    </div>
  );
}
