import { useEffect, useRef, useState } from "react";
import { CommandRegistry } from "../model/appCommands.ts";
import { Editor, projectTitle } from "../model/editor.ts";
import { addRecent, removeRecent, type RecentProject } from "../model/recent.ts";
import { createBlankProject, folderNameFor } from "../model/template.ts";
import { StartScreen } from "./StartScreen.tsx";
import { Workspace } from "./Workspace.tsx";
import { CommandsContext, usePlatform, useShortcutKeys } from "./hooks.ts";

// Editor shell (spec 08). Components stay thin: logic lives in src/model.
export function App() {
  const platform = usePlatform();
  const [registry] = useState(() => new CommandRegistry());
  const [editor, setEditor] = useState<{ root: string; editor: Editor } | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chooserRequest, setChooserRequest] = useState(0);
  const titleInput = useRef<HTMLInputElement>(null);
  const native = !!platform.installMenu;

  useEffect(() => {
    let live = true;
    void (async () => {
      const list = await platform.loadRecent();
      if (!live) return;
      setRecent(list);
      const launch = await platform.launchProject?.();
      if (live && launch) void open(launch, list);
    })();
    return () => {
      live = false;
    };
    // Runs once per platform; `open` is recreated every render.
  }, [platform]);

  // The native menu bar (app) or page shortcuts (dev page) run the same commands (D92).
  useShortcutKeys(registry, !native);
  useEffect(() => {
    if (!platform.installMenu) return;
    let remove: (() => void) | null = null;
    let live = true;
    void platform.installMenu(registry).then((r) => (live ? (remove = r) : r()));
    return () => {
      live = false;
      remove?.();
    };
  }, [platform, registry]);

  const remember = (list: RecentProject[]) => {
    setRecent(list);
    void platform.saveRecent(list);
  };

  const open = async (root: string, known = recent) => {
    setError(null);
    try {
      const ed = await Editor.open(platform.host(root));
      (window as unknown as { editor: Editor }).editor = ed;
      remember(addRecent(known, { root, title: projectTitle(ed.project), openedAt: Date.now() }));
      setEditor((old) => {
        old?.editor.dispose();
        return { root, editor: ed };
      });
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

  // File menu commands.
  const latest = useRef({ close, open, editor });
  latest.current = { close, open, editor };
  useEffect(
    () =>
      registry.register({
        "project.new": {
          run: async () => {
            await latest.current.close();
            setTimeout(() => titleInput.current?.focus(), 0);
          },
        },
        "project.open": {
          run: async () => {
            if (platform.listProjects) {
              await latest.current.close();
              setChooserRequest((n) => n + 1);
              return;
            }
            const root = await platform.openFolder();
            if (root) await latest.current.open(root);
          },
        },
        "project.close": { run: () => void latest.current.close(), enabled: () => latest.current.editor !== null },
      }),
    [registry, platform],
  );
  useEffect(() => registry.changed(), [registry, editor]);

  return (
    <CommandsContext.Provider value={registry}>
      {editor ? (
        <Workspace key={editor.root} root={editor.root} editor={editor.editor} onClose={() => void close()} nativeMenu={native} />
      ) : (
        <StartScreen
          onOpen={(r) => void open(r)}
          onCreate={(t, p) => void create(t, p)}
          recent={recent}
          onForget={(r) => remember(removeRecent(recent, r))}
          error={error}
          titleRef={titleInput}
          chooserRequest={chooserRequest}
        />
      )}
    </CommandsContext.Provider>
  );
}
