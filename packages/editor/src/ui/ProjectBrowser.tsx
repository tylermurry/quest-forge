import { useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { NOUN, type Actions, type DeleteWarning, type DragItem } from "../model/actions.ts";
import { SECTIONS, buildSection, countEntries, filterTree, isAssetKind, type Entry, type FolderNode, type Section } from "../model/browser.ts";
import { ConfirmDelete, Menu, Prompt, type MenuItem } from "./Dialogs.tsx";

const DRAG_TYPE = "application/x-questforge";

type Popup =
  | { kind: "menu"; x: number; y: number; items: MenuItem[] }
  | { kind: "delete"; warning: DeleteWarning; run(): void }
  | { kind: "changeId"; section: Section; id: string }
  | null;

type Editing = { section: Section; kind: "entry"; id: string; value: string } | { section: Section; kind: "folder"; path: string; value: string } | null;

interface Props {
  actions: Actions;
}

/** Reads dropped or picked files and imports them (D88). */
async function importInto(actions: Actions, section: Section, folder: string, files: File[]) {
  const read = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  actions.importFiles(section, folder, read);
}

/** The project browser (spec 08). Thin: every change goes through Actions. */
export function ProjectBrowser({ actions }: Props) {
  const onImport = (section: Section, folder: string, files: File[]) => void importInto(actions, section, folder, files);
  const picker = useRef<HTMLInputElement>(null);
  const [pickTarget, setPickTarget] = useState<{ section: Section; folder: string } | null>(null);
  const { editor, ws } = actions;
  const project = editor.project;
  const [popup, setPopup] = useState<Popup>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const trees = useMemo(() => SECTIONS.map((s) => ({ ...s, tree: buildSection(project, s.section) })), [project]);

  const menuAt = (e: MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopup({ kind: "menu", x: e.type === "contextmenu" ? e.clientX : r.left, y: e.type === "contextmenu" ? e.clientY : r.bottom, items });
  };

  const askDelete = (warning: DeleteWarning | null, run: () => void) => (warning ? setPopup({ kind: "delete", warning, run }) : run());

  const entryMenu = (e: Entry): MenuItem[] => [
    ...(isAssetKind(e.section) ? [{ label: "Open", onSelect: () => ws.open({ section: e.section, id: e.id }) }] : []),
    { label: "Rename", onSelect: () => setEditing({ section: e.section, kind: "entry", id: e.id, value: e.name }) },
    ...(isAssetKind(e.section) ? [{ label: "Change ID…", onSelect: () => setPopup({ kind: "changeId", section: e.section, id: e.id }) }] : []),
    ...(e.section !== "image" && e.section !== "audio" ? [{ label: "Duplicate", onSelect: () => actions.duplicate(e.section, e.id) }] : []),
    { label: "Delete", onSelect: () => askDelete(actions.deleteWarning(e.section, e.id), () => actions.delete(e.section, e.id)) },
  ];

  const folderMenu = (section: Section, path: string): MenuItem[] => [
    { label: "New folder", onSelect: () => actions.newFolder(section, path) },
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
          { label: "Rename folder", onSelect: () => setEditing({ section, kind: "folder", path, value: path.split("/").pop()! }) },
          { label: "Delete folder", onSelect: () => askDelete(actions.deleteFolderWarning(section, path), () => actions.deleteFolder(section, path)) },
        ]
      : []),
  ];

  // ── Drag and drop: moves inside a section (D83), files from the OS (D88) ──
  const dragStart = (e: DragEvent, item: DragItem) => {
    e.stopPropagation();
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
    e.dataTransfer.effectAllowed = "move";
  };
  const dropProps = (section: Section, folder: string) => {
    const key = `${section}/${folder}`;
    return {
      onDragOver: (e: DragEvent) => {
        const types = [...e.dataTransfer.types];
        if (!types.includes(DRAG_TYPE) && !types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) actions.drop(JSON.parse(raw) as DragItem, section, folder);
        else if (e.dataTransfer.files.length) onImport(section, folder, [...e.dataTransfer.files]);
      },
      "data-drop": dropTarget === key ? "true" : undefined,
    };
  };

  const commitEdit = () => {
    if (!editing) return;
    const ok =
      editing.kind === "entry"
        ? actions.rename(editing.section, editing.id, editing.value)
        : editing.value.trim() !== "" && actions.renameFolder(editing.section, editing.path, editing.value);
    void ok;
    setEditing(null);
  };
  const editBox = (label: string) =>
    editing && (
      <input
        className="rename"
        aria-label={label}
        autoFocus
        value={editing.value}
        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          if (e.key === "Escape") setEditing(null);
          e.stopPropagation();
        }}
      />
    );

  const sel = ws.selection;
  const renderFolder = (node: FolderNode, depth: number, searching: boolean): ReactNode => {
    const open = searching || ws.isExpanded(node.section, node.path);
    return (
      <>
        {node.folders.map((f) => {
          const isOpen = searching || ws.isExpanded(f.section, f.path);
          const selected = sel?.kind === "folder" && sel.section === f.section && sel.path === f.path;
          const isEditing = editing?.kind === "folder" && editing.section === f.section && editing.path === f.path;
          return (
            <li key={`f:${f.path}`} role="treeitem" aria-expanded={isOpen} aria-selected={selected} aria-label={`Folder ${f.path}`}>
              <div
                className={`node folder${selected ? " selected" : ""}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                draggable={!isEditing}
                onDragStart={(e) => dragStart(e, { section: f.section, kind: "folder", path: f.path })}
                {...dropProps(f.section, f.path)}
                onClick={() => ws.select({ kind: "folder", section: f.section, path: f.path })}
                onDoubleClick={() => ws.toggleFolder(f.section, f.path)}
                onContextMenu={(e) => menuAt(e, folderMenu(f.section, f.path))}
              >
                <button className="twisty" aria-label={isOpen ? "Collapse" : "Expand"} onClick={(e) => (e.stopPropagation(), ws.toggleFolder(f.section, f.path))}>
                  {isOpen ? "▾" : "▸"}
                </button>
                <span className="icon">📁</span>
                {isEditing ? editBox("Folder name") : <span className="label">{f.name}</span>}
                <button className="more" aria-label={`Actions for folder ${f.path}`} onClick={(e) => menuAt(e, folderMenu(f.section, f.path))}>
                  ⋯
                </button>
              </div>
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
                <div
                  className={`node entry${selected ? " selected" : ""}`}
                  style={{ paddingLeft: 22 + depth * 14 }}
                  draggable={!isEditing}
                  onDragStart={(ev) => dragStart(ev, { section: e.section, kind: "entry", id: e.id })}
                  onClick={() => ws.select({ kind: "entry", section: e.section, id: e.id })}
                  onDoubleClick={() => isAssetKind(e.section) && ws.open({ section: e.section, id: e.id })}
                  onContextMenu={(ev) => menuAt(ev, entryMenu(e))}
                  onKeyDown={(ev) => {
                    if (ev.key === "F2") setEditing({ section: e.section, kind: "entry", id: e.id, value: e.name });
                    if (ev.key === "Delete" || ev.key === "Backspace") askDelete(actions.deleteWarning(e.section, e.id), () => actions.delete(e.section, e.id));
                  }}
                  tabIndex={0}
                >
                  {isEditing ? (
                    editBox(isAssetKind(e.section) ? "Name" : "ID")
                  ) : (
                    <span className="label">
                      {e.name}
                      {e.name !== e.id && <span className="muted"> {e.id}</span>}
                    </span>
                  )}
                  <button className="more" aria-label={`Actions for ${NOUN[e.section]} ${e.id}`} onClick={(ev) => menuAt(ev, entryMenu(e))}>
                    ⋯
                  </button>
                </div>
              </li>
            );
          })}
      </>
    );
  };

  const searching = ws.search.trim() !== "";
  return (
    <div className="project-browser">
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
      <input className="search" type="search" placeholder="Search names and IDs" aria-label="Search" value={ws.search} onChange={(e) => ws.setSearch(e.target.value)} />
      <ul role="tree" aria-label="Project">
        {trees.map(({ section, title, tree }) => {
          const shown = filterTree(tree, ws.search);
          if (searching && !shown) return null;
          const open = searching || ws.isExpanded(section, "");
          return (
            <li key={section} role="treeitem" aria-expanded={open} aria-label={title}>
              <div className="node section" {...dropProps(section, "")} onContextMenu={(e) => menuAt(e, folderMenu(section, ""))}>
                <button className="twisty" aria-label={open ? `Collapse ${title}` : `Expand ${title}`} onClick={() => ws.toggleFolder(section, "")}>
                  {open ? "▾" : "▸"}
                </button>
                <span className="label">{title}</span>
                <span className="muted count">{countEntries(shown ?? tree)}</span>
                <button className="more" aria-label={`Actions for ${title}`} onClick={(e) => menuAt(e, folderMenu(section, ""))}>
                  +
                </button>
              </div>
              {open && shown && <ul role="group">{renderFolder(shown, 1, searching)}</ul>}
            </li>
          );
        })}
      </ul>
      {popup?.kind === "menu" && <Menu x={popup.x} y={popup.y} items={popup.items} onClose={() => setPopup(null)} />}
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
