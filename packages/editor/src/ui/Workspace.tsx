import { useEffect, useState, useSyncExternalStore } from "react";
import { Actions } from "../model/actions.ts";
import type { Editor } from "../model/editor.ts";
import { projectTitle } from "../model/editor.ts";
import { WorkspaceState } from "../model/workspace.ts";
import { ProjectBrowser } from "./ProjectBrowser.tsx";
import { useEditor } from "./hooks.ts";

interface Props {
  root: string;
  editor: Editor;
  onClose(): void;
}

const STATUS_TEXT = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…" } as const;

/** Main layout (spec 08): browser · tabs · inspector · dock. */
export function Workspace({ editor, onClose }: Props) {
  const ed = useEditor(editor);
  const [actions] = useState(() => new Actions(editor, new WorkspaceState()));
  const ws = actions.ws;
  useSyncExternalStore(ws.subscribe, () => ws.version);
  const status = ed.status;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        ed.redo();
      }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (ed.hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [ed]);

  return (
    <div className="shell">
      <header className="topbar">
        <strong>{projectTitle(ed.project)}</strong>
        <button onClick={() => ed.undo()} disabled={!ed.history.canUndo} title={ed.history.undoLabel ? `Undo ${ed.history.undoLabel}` : "Nothing to undo"}>
          Undo
        </button>
        <button onClick={() => ed.redo()} disabled={!ed.history.canRedo} title={ed.history.redoLabel ? `Redo ${ed.history.redoLabel}` : "Nothing to redo"}>
          Redo
        </button>
        <span className={`status status-${status.state}`} role="status" aria-label="Save status">
          {status.state === "error" ? status.message : STATUS_TEXT[status.state]}
        </span>
        <button className="push" onClick={onClose}>
          Close project
        </button>
      </header>
      {ed.notice && (
        <div className={`notice notice-${ed.notice.kind}`} role="alert">
          {ed.notice.text}
          <button className="small" onClick={() => ed.dismissNotice()}>
            Dismiss
          </button>
        </div>
      )}
      <aside className="browser">
        <ProjectBrowser actions={actions} />
      </aside>
      <main className="tabs">Editor</main>
      <aside className="inspector">Inspector</aside>
      <footer className="dock">Problems</footer>
    </div>
  );
}
