import { useEffect, useState } from "react";
import { Editor, projectTitle } from "../model/editor.ts";
import { addRecent, removeRecent, type RecentProject } from "../model/recent.ts";
import { createBlankProject, folderNameFor } from "../model/template.ts";
import { StartScreen } from "./StartScreen.tsx";
import { Workspace } from "./Workspace.tsx";
import { usePlatform } from "./hooks.ts";

// Editor shell (spec 08). Components stay thin: logic lives in src/model.
export function App() {
  const platform = usePlatform();
  const [editor, setEditor] = useState<{ root: string; editor: Editor } | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void platform.loadRecent().then(setRecent);
  }, [platform]);

  const remember = (list: RecentProject[]) => {
    setRecent(list);
    void platform.saveRecent(list);
  };

  const open = async (root: string) => {
    setError(null);
    try {
      const ed = await Editor.open(platform.host(root));
      (window as unknown as { editor: Editor }).editor = ed;
      remember(addRecent(recent, { root, title: projectTitle(ed.project), openedAt: Date.now() }));
      setEditor({ root, editor: ed });
    } catch (e) {
      setError(`Couldn't open ${platform.displayPath(root)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const create = async (title: string, parent: string) => {
    setError(null);
    const root = platform.joinPath(parent, folderNameFor(title));
    try {
      await platform.makeProjectFolder(root);
      await createBlankProject(platform.host(root).fs, title);
    } catch (e) {
      setError(`Couldn't create the project: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    await open(root);
  };

  const close = async () => {
    if (!editor) return;
    await editor.editor.flush();
    editor.editor.dispose();
    setEditor(null);
  };

  if (editor) return <Workspace key={editor.root} root={editor.root} editor={editor.editor} onClose={() => void close()} />;
  return <StartScreen onOpen={(r) => void open(r)} onCreate={(t, p) => void create(t, p)} recent={recent} onForget={(r) => remember(removeRecent(recent, r))} error={error} />;
}
