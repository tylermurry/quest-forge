import { NOUN, type Actions } from "../model/actions.ts";
import { entriesInFolder } from "../model/commands.ts";
import { SECTIONS, isAssetKind, sectionEntries } from "../model/browser.ts";
import type { Reference } from "@questforge/schema";
import { entryReferences, groupReferences, renameEntry } from "../model/commands.ts";
import { locate } from "../model/locate.ts";
import { SceneSettings, SceneThingInspector } from "./scene/SceneInspector.tsx";
import { Button } from "./components/ui/button.tsx";
import { NodeInspector } from "./dialogue/NodeInspector.tsx";
import { InspectorShell } from "./InspectorShell.tsx";
import { TextField } from "./TextField.tsx";

const DT = "text-muted-foreground mt-3 text-[11px] font-semibold tracking-wider uppercase first-of-type:mt-0";

/** Inspector: what's selected, where it lives, and what uses it. */
export function Inspector({ actions }: { actions: Actions }) {
  const { ws, editor } = actions;
  const p = editor.project;
  const sel = ws.selection;
  if (!sel) return <p className="text-muted-foreground pt-3">Select something to see its details.</p>;

  if (sel.kind === "folder") {
    const title = SECTIONS.find((s) => s.section === sel.section)!.title;
    const n = entriesInFolder(p, sel.section, sel.path).length;
    return (
      <InspectorShell actions={actions} title={`Folder ${sel.path.split("/").pop()}`} subtitle={`${title} folder`}>
        <dl className="grid gap-0.5">
          <dt className={DT}>Section</dt>
          <dd>{title}</dd>
          <dt className={DT}>Path</dt>
          <dd>{sel.path}</dd>
          <dt className={DT}>Contains</dt>
          <dd>
            {n} {n === 1 ? NOUN[sel.section] : `${NOUN[sel.section]}s`}
          </dd>
        </dl>
      </InspectorShell>
    );
  }

  if (sel.kind === "sceneThing") {
    return <SceneThingInspector key={`${sel.scene}:${sel.list}:${sel.key}`} actions={actions} sceneId={sel.scene} thing={{ list: sel.list, key: sel.key }} />;
  }

  if (sel.kind === "game") {
    return (
      <InspectorShell actions={actions} title={p.game?.data.title ?? "Game"} subtitle="Game settings and rules that work anywhere">
        <p className="text-muted-foreground text-[12px]">Start, score, default responses, rules and styling are edited in the Game Settings tab.</p>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => ws.openGame()}>
          Open Game Settings
        </Button>
      </InspectorShell>
    );
  }

  if (sel.kind === "dialogueNode") {
    return <NodeInspector key={`${sel.dialogue}/${sel.node}`} actions={actions} dialogue={sel.dialogue} nodeId={sel.node} />;
  }

  const entry = sectionEntries(p, sel.section).find((e) => e.id === sel.id);
  if (!entry) return null;
  const refs = entryReferences(p, sel.section, sel.id);
  const image = sel.section === "image" ? p.assets?.data.images.find((i) => i.id === sel.id) : undefined;
  const audio = sel.section === "audio" ? p.assets?.data.audio.find((i) => i.id === sel.id) : undefined;
  const sceneOwner = sel.section === "scene" ? ({ kind: "scene", scene: sel.id } as const) : null;
  return (
    <InspectorShell actions={actions} title={entry.name} subtitle={NOUN[sel.section][0]!.toUpperCase() + NOUN[sel.section].slice(1)} owner={sceneOwner}>
      <dl className="grid gap-0.5">
        {sel.section === "scene" && (
          <dd className="grid gap-2">
            <TextField
              label="Name"
              value={entry.name}
              onChange={(v) => editor.apply("Rename scene", (q) => renameEntry(q, "scene", sel.id, v), `scene:${sel.id}:name`)}
              onBlur={() => editor.history.breakMerge()}
            />
            <SceneSettings actions={actions} sceneId={sel.id} />
          </dd>
        )}
        {sel.section === "dialogue" && (
          <dd className="grid gap-2">
            <TextField
              label="Name"
              value={entry.name}
              onChange={(v) => editor.apply("Rename dialogue", (q) => renameEntry(q, "dialogue", sel.id, v), `dialogue:${sel.id}:name`)}
              onBlur={() => editor.history.breakMerge()}
            />
            <p className="text-muted-foreground text-[12px]">Select a node on the graph to edit it.</p>
          </dd>
        )}
        {isAssetKind(sel.section) && sel.section !== "dialogue" && (
          <>
            <dt className={DT}>Name</dt>
            <dd>{entry.name}</dd>
          </>
        )}
        <dt className={DT}>ID</dt>
        <dd>
          <code className="font-mono text-[12px] selectable">{entry.id}</code>
        </dd>
        <dt className={DT}>Folder</dt>
        <dd>{entry.folder || "(top level)"}</dd>
        {entry.detail && (
          <>
            <dt className={DT}>Type</dt>
            <dd>{entry.detail}</dd>
          </>
        )}
        {(image ?? audio) && (
          <>
            <dt className={DT}>File</dt>
            <dd>
              <code className="font-mono text-[12px] selectable">{(image ?? audio)!.path}</code>
            </dd>
          </>
        )}
        {image && <ImagePreview path={image.path} actions={actions} />}
        {audio && <AudioPreview path={audio.path} actions={actions} />}
        <References actions={actions} refs={refs} />
      </dl>
    </InspectorShell>
  );
}

function ImagePreview({ path, actions }: { path: string; actions: Actions }) {
  const url = actions.assetUrl?.(path);
  if (!url || !actions.editor.project.files.includes(path)) return null;
  return (
    <img
      className="mt-3 block max-w-full rounded-sm border [image-rendering:pixelated]"
      style={{ background: "repeating-conic-gradient(#333 0 25%, #2a2a2a 0 50%) 0 0 / 16px 16px" }}
      src={url}
      alt=""
    />
  );
}

/** Listen to an imported sound. Shown once the file is saved into the project. */
function AudioPreview({ path, actions }: { path: string; actions: Actions }) {
  const url = actions.assetUrl?.(path);
  if (!url || !actions.editor.project.files.includes(path)) return null;
  return <audio className="mt-3 h-8 w-full" controls preload="none" src={url} aria-label="Listen" />;
}

/** "Used by": a header per file, with one link per use: click to show where it is, flashed blue like a playtest log jump. */
export function References({ actions, refs }: { actions: Actions; refs: Reference[] }) {
  const p = actions.editor.project;
  return (
    <>
      <dt className={DT}>Used by</dt>
      <dd>
        {refs.length === 0 && "Nothing uses it yet."}
        {groupReferences(p, refs).map((g) => (
          <section key={g.title} className="mt-2 first:mt-0" aria-label={g.title}>
            <h4 className="text-[12px] font-semibold">{g.title}</h4>
            <ul className="mt-0.5 list-disc pl-4">
              {g.items.map((it, i) => {
                const jump = locate(p, it.location);
                return (
                  <li key={i}>
                    {jump ? (
                      <button className="text-primary block cursor-pointer text-left underline-offset-2 hover:underline" title="Show where it's used" onClick={() => actions.ws.jumpTo(jump, "log")}>
                        {it.text}
                      </button>
                    ) : (
                      it.text
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </dd>
    </>
  );
}
