import type { SceneFile } from "@questforge/schema";
import { NOUN, type Actions } from "../model/actions.ts";
import { entriesInFolder } from "../model/commands.ts";
import { SECTIONS, isAssetKind, sectionEntries } from "../model/browser.ts";
import { describeReferences, entryReferences, sceneThingReferences, summarizeReferences } from "../model/commands.ts";

/** Inspector (D89): what's selected, where it lives, and what uses it. */
export function Inspector({ actions }: { actions: Actions }) {
  const { ws, editor } = actions;
  const p = editor.project;
  const sel = ws.selection;
  if (!sel) return <p className="muted">Select something to see its details.</p>;

  if (sel.kind === "folder") {
    const title = SECTIONS.find((s) => s.section === sel.section)!.title;
    const n = entriesInFolder(p, sel.section, sel.path).length;
    return (
      <dl className="props">
        <h3>Folder {sel.path.split("/").pop()}</h3>
        <dt>Section</dt>
        <dd>{title}</dd>
        <dt>Path</dt>
        <dd>{sel.path}</dd>
        <dt>Contains</dt>
        <dd>
          {n} {n === 1 ? NOUN[sel.section] : `${NOUN[sel.section]}s`}
        </dd>
      </dl>
    );
  }

  if (sel.kind === "sceneThing") {
    const scene = p.scenes.find((s) => s.data.id === sel.scene)?.data as SceneFile | undefined;
    if (!scene) return null;
    const thing =
      sel.list === "spawns"
        ? scene.spawns[sel.key]
        : sel.list === "characters"
          ? scene.characters[Number(sel.key.split("#")[1])]
          : (scene[sel.list] as { id: string; rules: unknown[] }[]).find((x) => x.id === sel.key);
    const refKind = sel.list === "spawns" ? "spawn" : sel.list === "objects" ? "object" : null;
    const refs = refKind ? sceneThingReferences(p, scene.id, refKind, sel.key) : [];
    return (
      <dl className="props">
        <h3>{sel.key.split("#")[0]}</h3>
        <dt>In scene</dt>
        <dd>{scene.name}</dd>
        {thing && "rules" in thing && (
          <>
            <dt>Rules</dt>
            <dd>{thing.rules.length} (the rule inspector arrives in M5)</dd>
          </>
        )}
        <References summary={summarizeReferences(refs)} lines={describeReferences(p, refs)} />
      </dl>
    );
  }

  const entry = sectionEntries(p, sel.section).find((e) => e.id === sel.id);
  if (!entry) return null;
  const refs = entryReferences(p, sel.section, sel.id);
  const image = sel.section === "image" ? p.assets?.data.images.find((i) => i.id === sel.id) : undefined;
  const audio = sel.section === "audio" ? p.assets?.data.audio.find((i) => i.id === sel.id) : undefined;
  return (
    <dl className="props">
      <h3>{entry.name}</h3>
      <dt>Kind</dt>
      <dd>{NOUN[sel.section]}</dd>
      {isAssetKind(sel.section) && (
        <>
          <dt>Name</dt>
          <dd>{entry.name}</dd>
        </>
      )}
      <dt>ID</dt>
      <dd>
        <code>{entry.id}</code>
      </dd>
      <dt>Folder</dt>
      <dd>{entry.folder || "(top level)"}</dd>
      {entry.detail && (
        <>
          <dt>Type</dt>
          <dd>{entry.detail}</dd>
        </>
      )}
      {(image ?? audio) && (
        <>
          <dt>File</dt>
          <dd>
            <code>{(image ?? audio)!.path}</code>
          </dd>
        </>
      )}
      {image && <ImagePreview path={image.path} actions={actions} />}
      <References summary={summarizeReferences(refs)} lines={describeReferences(p, refs)} />
    </dl>
  );
}

function ImagePreview({ path, actions }: { path: string; actions: Actions }) {
  const url = actions.assetUrl?.(path);
  if (!url || !actions.editor.project.files.includes(path)) return null;
  return <img className="preview" src={url} alt="" />;
}

function References({ summary, lines }: { summary: string | null; lines: string[] }) {
  return (
    <>
      <dt>Used by</dt>
      <dd>
        {summary ?? "Nothing uses it yet."}
        {lines.length > 0 && (
          <ul className="refs">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </dd>
    </>
  );
}
