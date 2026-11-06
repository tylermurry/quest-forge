import type { CharacterFile, DialogueFile, ItemFile, Project, SceneFile } from "@questforge/schema";
import { useState } from "react";
import { NOUN, type Actions, type DeleteWarning } from "../model/actions.ts";
import { sectionEntries } from "../model/browser.ts";
import { renameEntry, updateDoc, type SceneList } from "../model/commands.ts";
import { refKey, type EntryRef } from "../model/workspace.ts";
import { Trash2, X } from "lucide-react";
import { Button } from "./components/ui/button.tsx";
import { Label } from "./components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.tsx";
import { ConfirmDelete } from "./Dialogs.tsx";
import { TextField } from "./TextField.tsx";
import { cn } from "./lib/utils.ts";

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-panel flex h-8 shrink-0 items-end gap-px overflow-x-auto border-b px-1" role="tablist">
        {ws.tabs.map((t) => {
          const name = sectionEntries(p, t.section).find((e) => e.id === t.id)?.name ?? t.id;
          const selected = refKey(t) === ws.active;
          return (
            <div
              key={refKey(t)}
              className={cn(
                "group flex h-7 items-center rounded-t-md border border-b-0 pl-3 pr-1 text-[12px]",
                selected ? "bg-background text-foreground" : "bg-muted/50 text-muted-foreground border-transparent",
              )}
            >
              <button role="tab" aria-selected={selected} onClick={() => ws.activate(t)} onMouseDown={(e) => e.button === 1 && ws.close(t)} className="whitespace-nowrap">
                {name}
              </button>
              <button className="hover:bg-muted ml-1 flex size-5 items-center justify-center rounded-sm opacity-60 hover:opacity-100" aria-label={`Close ${name}`} onClick={() => ws.close(t)}>
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5" role="tabpanel">
        {!active && <p className="text-muted-foreground mt-16 text-center">Double-click a scene, item, character or dialogue to open it here.</p>}
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
    <div className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {(data as { name: string }).name} <span className="text-muted-foreground ml-1 text-[13px] font-normal">{NOUN[entry.section]} · {entry.id}</span>
      </h2>
      {nameField}
      {entry.section === "scene" && <SceneOutline actions={actions} scene={data as SceneFile} />}
      {entry.section === "item" && <ItemForm actions={actions} item={data as ItemFile} />}
      {entry.section === "character" && <CharacterSummary character={data as CharacterFile} />}
      {entry.section === "dialogue" && (
        <p className="text-muted-foreground">
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
      <div className="grid gap-1.5">
        <Label className="text-muted-foreground text-[12px] font-normal">Icon</Label>
        <Select value={item.icon} onValueChange={(v) => set("Change item icon", (d) => ({ ...d, icon: v }))}>
          <SelectTrigger size="sm" aria-label="Icon" className="w-64 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!images.some((i) => i.id === item.icon) && <SelectItem value={item.icon}>{item.icon} (missing)</SelectItem>}
            {images.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function CharacterSummary({ character }: { character: CharacterFile }) {
  const slots = Object.entries(character.animations).filter(([, a]) => a);
  return (
    <p className="text-muted-foreground">
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
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground">
        Background <strong>{scene.background}</strong>
        {scene.music ? ` · music ${scene.music}` : ""} · walkable area with {scene.walkable.outer.length} points and {scene.walkable.holes.length} hole
        {scene.walkable.holes.length === 1 ? "" : "s"}. Canvas editing arrives in M4.
      </p>
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mt-4 mb-1 text-[12px] font-semibold">
            {g.title} <span className="text-muted-foreground ml-1 font-normal">{g.rows.length}</span>
          </h3>
          {g.rows.length === 0 && <p className="text-muted-foreground text-[12px]">None.</p>}
          <ul className="grid gap-px">
            {g.rows.map((row) => {
              const selected = sel?.kind === "sceneThing" && sel.scene === scene.id && sel.list === row.list && sel.key === row.key;
              return (
                <li key={row.key} className={cn("group hover:bg-muted flex h-7 items-center gap-2 rounded-sm px-2", selected && "bg-selection hover:bg-selection")} aria-label={`${g.title}: ${row.title}`}>
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => ws.select({ kind: "sceneThing", scene: scene.id, list: row.list, key: row.key })}>
                    {row.title} <span className="text-muted-foreground ml-1 text-[12px]">{row.detail}</span>
                  </button>
                  <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Delete ${row.title}`} onClick={() => remove(row)}>
                    <Trash2 />
                  </Button>
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
