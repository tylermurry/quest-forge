import { useEffect, useState } from "react";
import type { RecentProject } from "../model/recent.ts";
import { usePlatform } from "./hooks.ts";

interface Props {
  onOpen(root: string): void;
  onCreate(title: string, parent: string): void;
  recent: RecentProject[];
  onForget(root: string): void;
  error: string | null;
}

/** Start screen (spec 08): New project · Open folder · recent projects. */
export function StartScreen({ onOpen, onCreate, recent, onForget, error }: Props) {
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
    <div className="start">
      <h1>Questforge</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <section>
        <h2>New project</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input aria-label="Game title" placeholder="Game title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit" disabled={!title.trim()}>
            Create blank project
          </button>
          <button type="button" disabled title="The demo template arrives with milestone M9">
            From demo template
          </button>
        </form>
      </section>
      <section>
        <h2>Open</h2>
        <button onClick={() => void open()}>Open folder…</button>
        {choosing && (
          <ul className="list" aria-label="Project folders">
            {choosing.map((root) => (
              <li key={root}>
                <button className="link" onClick={() => onOpen(root)}>
                  {platform.displayPath(root)}
                </button>
              </li>
            ))}
            {choosing.length === 0 && <li className="muted">No project folders yet.</li>}
          </ul>
        )}
      </section>
      <section>
        <h2>Recent projects</h2>
        {recent.length === 0 && <p className="muted">Nothing yet.</p>}
        <ul className="list" aria-label="Recent projects">
          {recent.map((r) => (
            <li key={r.root} className={missing.has(r.root) ? "missing" : ""}>
              <button className="link" disabled={missing.has(r.root)} onClick={() => onOpen(r.root)}>
                <strong>{r.title}</strong> <span className="muted">{platform.displayPath(r.root)}</span>
              </button>
              {missing.has(r.root) && <span className="muted"> (folder not found)</span>}
              <button className="small" aria-label={`Remove ${r.title} from recent projects`} onClick={() => onForget(r.root)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
