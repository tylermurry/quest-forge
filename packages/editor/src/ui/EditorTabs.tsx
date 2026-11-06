import type { CharacterFile, DialogueFile, ItemFile, Project } from "@questforge/schema";
import { NOUN, type Actions } from "../model/actions.ts";
import { sectionEntries } from "../model/browser.ts";
import { renameEntry, updateDoc } from "../model/commands.ts";
import { refKey, type EntryRef } from "../model/workspace.ts";
import { X } from "lucide-react";
import { Label } from "./components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.tsx";
import { SceneEditor } from "./scene/SceneEditor.tsx";
import { CharacterAnimations } from "./sprites/CharacterAnimations.tsx";
import { ImageEditor } from "./sprites/ImageEditor.tsx";
import { TextField } from "./TextField.tsx";
import { cn } from "./lib/utils.ts";

const docData = (p: Project, ref: EntryRef) => {
  const list = { scene: p.scenes, item: p.items, character: p.characters, dialogue: p.dialogues }[ref.section as "scene"] as { data: { id: string; name: string } }[] | undefined;
  return list?.find((d) => d.data.id === ref.id)?.data;
};

/** The tabbed editor area (spec 08). A scene tab is the scene editor (D103); other assets get a details form (D89). */
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
      {active?.section === "scene" ? (
        <div className="min-h-0 flex-1" role="tabpanel">
          <SceneEditor key={refKey(active)} actions={actions} sceneId={active.id} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5" role="tabpanel">
          {!active && <p className="text-muted-foreground mt-16 text-center">Double-click a scene, item, character, dialogue or image to open it here.</p>}
          {active?.section === "image" && <ImageEditor key={refKey(active)} actions={actions} imageId={active.id} />}
          {active && active.section !== "image" && <TabContent key={refKey(active)} actions={actions} entry={active} />}
        </div>
      )}
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
    <div className={cn("flex flex-col gap-4", entry.section !== "character" && "max-w-2xl")}>
      <h2 className="text-lg font-semibold">
        {(data as { name: string }).name} <span className="text-muted-foreground ml-1 text-[13px] font-normal">{NOUN[entry.section]} · {entry.id}</span>
      </h2>
      {nameField}
      {entry.section === "item" && <ItemForm actions={actions} item={data as ItemFile} />}
      {entry.section === "character" && <CharacterSummary character={data as CharacterFile} />}
      {entry.section === "character" && <CharacterAnimations actions={actions} character={data as CharacterFile} />}
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
  return (
    <p className="text-muted-foreground">
      Text color <span style={{ color: character.textColor }}>■</span> {character.textColor} · walk speed {character.walkSpeed}
    </p>
  );
}
