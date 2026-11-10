import { FolderOpen, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecentProject } from "../model/recent.ts";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { usePlatform } from "./hooks.ts";
import { cn } from "./lib/utils.ts";

interface Props {
  onOpen(root: string): void;
  onCreate(title: string, parent: string): void;
  recent: RecentProject[];
  onForget(root: string): void;
  error: string | null;
  titleRef?: React.Ref<HTMLInputElement>;
  /** Bumped by File › Open Folder… on the dev page, which lists sandbox folders here. */
  chooserRequest?: number;
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-muted-foreground mt-8 mb-2 text-[11px] font-semibold tracking-wider uppercase">{children}</h2>
);

/** Start screen (spec 08): New project · Open folder · recent projects. */
export function StartScreen({ onOpen, onCreate, recent, onForget, error, titleRef, chooserRequest = 0 }: Props) {
  const platform = usePlatform();
  const [title, setTitle] = useState("");
  const [choosing, setChoosing] = useState<string[] | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void Promise.all(recent.map(async (r) => [r.root, await platform.exists(r.root).catch(() => false)] as const)).then((xs) => {
      if (live) setMissing(new Set(xs.filter(([, ok]) => !ok).map(([root]) => root)));
    });
    return () => {
      live = false;
    };
  }, [recent, platform]);

  useEffect(() => {
    if (chooserRequest > 0) void platform.listProjects?.().then(setChoosing);
  }, [chooserRequest, platform]);

  const create = async () => {
    const parent = await platform.chooseParent();
    if (parent !== null) onCreate(title, parent);
  };
  const open = async () => {
    if (platform.listProjects) setChoosing(await platform.listProjects());
    else {
      const root = await platform.openFolder();
      if (root) onOpen(root);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <span className="text-muted-foreground text-[13px]">Questforge</span>
      </TitleBar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-xl px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Questforge</h1>
          <p className="text-muted-foreground mt-1">Build a point-and-click adventure without writing code.</p>
          {error && (
            <p className="text-err mt-4" role="alert">
              {error}
            </p>
          )}
          <Heading>New project</Heading>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input ref={titleRef} className="h-8 w-64" aria-label="Game title" placeholder="Game title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Button type="submit" size="sm" disabled={!title.trim()}>
              <Plus /> Create blank project
            </Button>
          </form>
          <Heading>Open</Heading>
          <Button size="sm" variant="outline" onClick={() => void open()}>
            <FolderOpen /> Open folder…
          </Button>
          {choosing && (
            <ul className="mt-2 grid gap-0.5" aria-label="Project folders">
              {choosing.map((root) => (
                <li key={root}>
                  <button className="hover:bg-muted w-full rounded-sm px-2 py-1 text-left" onClick={() => onOpen(root)}>
                    {platform.displayPath(root)}
                  </button>
                </li>
              ))}
              {choosing.length === 0 && <li className="text-muted-foreground">No project folders yet.</li>}
            </ul>
          )}
          <Heading>Recent projects</Heading>
          {recent.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
          <ul className="grid gap-0.5" aria-label="Recent projects">
            {recent.map((r) => {
              const gone = missing.has(r.root);
              return (
                <li key={r.root} className="group hover:bg-muted flex items-center gap-2 rounded-sm px-2 py-1">
                  <button className={cn("flex min-w-0 flex-1 flex-col text-left", gone && "opacity-50")} disabled={gone} onClick={() => onOpen(r.root)}>
                    <strong className={cn("font-medium", gone && "line-through")}>{r.title}</strong>
                    <span className="text-muted-foreground truncate text-[12px]">
                      {platform.displayPath(r.root)}
                      {gone && " (folder not found)"}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" aria-label={`Remove ${r.title} from recent projects`} onClick={() => onForget(r.root)}>
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
