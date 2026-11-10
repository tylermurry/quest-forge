import { useEffect, useRef, useState } from "react";
import { CommandRegistry } from "../model/appCommands.ts";
import { Editor, projectTitle } from "../model/editor.ts";
import { addRecent, removeRecent, type RecentProject } from "../model/recent.ts";
import { createBlankProject, folderNameFor } from "../model/template.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog.tsx";
import { StartScreen } from "./StartScreen.tsx";
import { Workspace } from "./Workspace.tsx";
import { CommandsContext, usePlatform, useShortcutKeys } from "./hooks.ts";
import { saveNow } from "./saveNow.ts";

// Editor shell. Components stay thin: logic lives in src/model.
export function App() {
  const platform = usePlatform();
  const [registry] = useState(() => new CommandRegistry());
  const [editor, setEditor] = useState<{ root: string; editor: Editor } | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chooserRequest, setChooserRequest] = useState(0);
  const titleInput = useRef<HTMLInputElement>(null);
  const native = !!platform.installMenu;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per platform; `open` is recreated every render, and re-running would reload the recent list and relaunch the project
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
  }, [platform]);

  // The native menu bar (app) or page shortcuts (dev page) run the same commands.
  useShortcutKeys(registry, native);
  useEffect(() => {
    if (!platform.installMenu) return;
    let remove: (() => void) | null = null;
    let live = true;
    void platform.installMenu(registry).then((r) => {
      if (live) remove = r;
      else r();
    });
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
      const ed = await Editor.open(platform.host(root), { autosave: false });
      // Debug handle for the dev page and tests (`window.editor`); Window has no such field, so the cast is deliberate.
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

  // Saving is manual: leaving with unsaved changes asks first.
  const [leaving, setLeaving] = useState<((ok: boolean) => void) | null>(null);
  const confirmLeave = async (): Promise<boolean> => {
    if (!editor?.editor.hasUnsavedChanges) return true;
    const ok = await new Promise<boolean>((resolve) => setLeaving(() => resolve));
    setLeaving(null);
    return ok;
  };

  const close = async () => {
    if (!editor || !(await confirmLeave())) return;
    editor.editor.dispose();
    setEditor(null);
  };

  // File menu commands.
  const latest = useRef({ close, open, editor, confirmLeave });
  latest.current = { close, open, editor, confirmLeave };
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
            if (!(await latest.current.confirmLeave())) return;
            const root = await platform.openFolder();
            if (root) await latest.current.open(root);
          },
        },
        "project.save": { run: () => void (latest.current.editor && saveNow(latest.current.editor.editor)), enabled: () => latest.current.editor !== null },
        "project.close": { run: () => void latest.current.close(), enabled: () => latest.current.editor !== null },
      }),
    [registry, platform],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `editor` is a trigger: opening or closing a project changes which commands are enabled
  useEffect(() => registry.changed(), [registry, editor]);

  return (
    <CommandsContext.Provider value={registry}>
      {editor ? (
        <Workspace key={editor.root} root={editor.root} editor={editor.editor} onClose={() => void close()} />
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
      <AlertDialog open={leaving !== null} onOpenChange={(o) => !o && leaving?.(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Go back without saving?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. If you go back to the project selector now, they will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => leaving?.(true)}>
              Go back without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CommandsContext.Provider>
  );
}
