import type { CharacterFile, DialogueFile, ItemFile, Project, SceneFile } from "@questforge/schema";
import { useState } from "react";
import { NOUN, type Actions, type DeleteWarning } from "../model/actions.ts";
import { sectionEntries } from "../model/browser.ts";
import { renameEntry, updateDoc, type SceneList } from "../model/commands.ts";
import { refKey, type EntryRef } from "../model/workspace.ts";
import { ConfirmDelete } from "./Dialogs.tsx";
import { TextField } from "./TextField.tsx";

const docData = (p: Project, ref: EntryRef) => {
  const list = { scene: p.scenes, item: p.items, character: p.characters, dialogue: p.dialogues }[ref.section as "scene"] as { data: { id: string; name: string } }[] | undefined;
  return list?.find((d) => d.data.id === ref.id)?.data;
};

/** The tabbed editor area (spec 08). In M3 a tab is a scene outline or a details form (D89). */
export function EditorTabs({ actions }: { actions: Actions }) {
  const { ws, editor } = actions;
  const p = editor.project;
  const active = ws.tabs.find((t) => refKey(t) === ws.active) ?? null;
  return (
    <div className="editor-tabs">
      <div className="tabstrip" role="tablist">
        {ws.tabs.map((t) => {
          const name = sectionEntries(p, t.section).find((e) => e.id === t.id)?.name ?? t.id;
          const selected = refKey(t) === ws.active;
          return (
            <div key={refKey(t)} className={`tab${selected ? " active" : ""}`}>
              <button role="tab" aria-selected={selected} onClick={() => ws.activate(t)}>
                {name}
              </button>
              <button className="close" aria-label={`Close ${name}`} onClick={() => ws.close(t)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="tabbody" role="tabpanel">
        {!active && <p className="muted center">Double-click a scene, item, character or dialogue to open it here.</p>}
        {active && <TabContent key={refKey(active)} actions={actions} entry={active} />}
      </div>
    </div>
  );
}

function TabContent({ actions, entry }: { actions: Actions; entry: EntryRef }) {
  const { editor } = actions;
  const data = docData(editor.project, entry);
  if (!data) return null;
  const nameKey = `${entry.section}:${entry.id}:name`;
  const nameField = (
    <TextField
      label="Name"
      value={(data as { name: string }).name}
      onChange={(v) => editor.apply(`Rename ${NOUN[entry.section]}`, (p) => renameEntry(p, entry.section, entry.id, v), nameKey)}
      onBlur={() => editor.history.breakMerge()}
    />
  );
  return (
    <div className="tab-content">
      <h2>
        {(data as { name: string }).name} <span className="muted">{NOUN[entry.section]} · {entry.id}</span>
      </h2>
      {nameField}
      {entry.section === "scene" && <SceneOutline actions={actions} scene={data as SceneFile} />}
      {entry.section === "item" && <ItemForm actions={actions} item={data as ItemFile} />}
      {entry.section === "character" && <CharacterSummary character={data as CharacterFile} />}
      {entry.section === "dialogue" && (
        <p className="muted">
          {(data as DialogueFile).nodes.length} nodes. The dialogue graph arrives in M7.
        </p>
      )}
    </div>
  );
}

function ItemForm({ actions, item }: { actions: Actions; item: ItemFile }) {
  const { editor } = actions;
  const images = editor.project.assets?.data.images ?? [];
  const set = (label: string, f: (d: ItemFile) => ItemFile, key?: string) => editor.apply(label, (p) => updateDoc<ItemFile>(p, "item", item.id, f), key);
  return (
    <>
      <TextField
        label="Description"
        multiline
        value={item.description}
        onChange={(v) => set("Edit item description", (d) => ({ ...d, description: v }), `item:${item.id}:description`)}
        onBlur={() => editor.history.breakMerge()}
      />
      <label className="field">
        <span className="muted">Icon</span>
        <select aria-label="Icon" value={item.icon} onChange={(e) => set("Change item icon", (d) => ({ ...d, icon: e.target.value }))}>
          {!images.some((i) => i.id === item.icon) && <option value={item.icon}>{item.icon} (missing)</option>}
          {images.map((i) => (
            <option key={i.id} value={i.id}>
              {i.id}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function CharacterSummary({ character }: { character: CharacterFile }) {
  const slots = Object.entries(character.animations).filter(([, a]) => a);
  return (
    <p className="muted">
      Text color <span style={{ color: character.textColor }}>■</span> {character.textColor} · walk speed {character.walkSpeed} · {slots.length} animation
      {slots.length === 1 ? "" : "s"}. Character editing arrives with the scene editor (M4).
    </p>
  );
}

type Row = { list: SceneList | "spawns"; index: number; key: string; title: string; detail: string; refKind?: "object" | "spawn" };

/** M3 scene tab (D89): an outline of what's in the scene; each thing can be selected and deleted. */
function SceneOutline({ actions, scene }: { actions: Actions; scene: SceneFile }) {
  const { ws } = actions;
  const [confirm, setConfirm] = useState<{ warning: DeleteWarning; run(): void } | null>(null);
  const rules = (n: number) => `${n} rule${n === 1 ? "" : "s"}`;
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Spawn points",
      rows: Object.entries(scene.spawns).map(([id, s], index) => ({ list: "spawns", index, key: id, title: id, detail: `(${s.x}, ${s.y}) facing ${s.facing}`, refKind: "spawn" })),
    },
    {
      title: "Objects",
      rows: scene.objects.map((o, index) => ({ list: "objects", index, key: o.id, title: o.name ? `${o.name} (${o.id})` : o.id, detail: `image ${o.image} · ${rules(o.rules.length)}${o.visible ? "" : " · hidden"}`, refKind: "object" })),
    },
    {
      title: "Characters",
      rows: scene.characters.map((c, index) => ({ list: "characters", index, key: `${c.character}#${index}`, title: c.character, detail: `at (${c.x}, ${c.y}) · ${rules(c.rules.length)}` })),
    },
    { title: "Hotspots", rows: scene.hotspots.map((h, index) => ({ list: "hotspots", index, key: h.id, title: `${h.name} (${h.id})`, detail: rules(h.rules.length) })) },
    { title: "Regions", rows: scene.regions.map((r, index) => ({ list: "regions", index, key: r.id, title: r.id, detail: rules(r.rules.length) })) },
  ];
  const remove = (row: Row) => {
    const label = { spawns: "spawn point", objects: "object", characters: "character placement", hotspots: "hotspot", regions: "region" }[row.list];
    const run = () => (row.list === "spawns" ? actions.deleteSpawn(scene.id, row.key) : actions.deleteSceneThing(scene.id, row.list, row.index, label));
    const warning = row.refKind ? actions.sceneThingWarning(scene.id, row.refKind, row.key) : null;
    if (warning) setConfirm({ warning, run });
    else run();
  };
  const sel = ws.selection;
  return (
    <div className="outline">
      <p className="muted">
        Background <strong>{scene.background}</strong>
        {scene.music ? ` · music ${scene.music}` : ""} · walkable area with {scene.walkable.outer.length} points and {scene.walkable.holes.length} hole
        {scene.walkable.holes.length === 1 ? "" : "s"}. Canvas editing arrives in M4.
      </p>
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3>
            {g.title} <span className="muted">{g.rows.length}</span>
          </h3>
          {g.rows.length === 0 && <p className="muted small">None.</p>}
          <ul className="rows">
            {g.rows.map((row) => {
              const selected = sel?.kind === "sceneThing" && sel.scene === scene.id && sel.list === row.list && sel.key === row.key;
              return (
                <li key={row.key} className={selected ? "selected" : ""} aria-label={`${g.title}: ${row.title}`}>
                  <button className="link grow" onClick={() => ws.select({ kind: "sceneThing", scene: scene.id, list: row.list, key: row.key })}>
                    {row.title} <span className="muted">{row.detail}</span>
                  </button>
                  <button className="small" aria-label={`Delete ${row.title}`} onClick={() => remove(row)}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {confirm && (
        <ConfirmDelete
          warning={confirm.warning}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
