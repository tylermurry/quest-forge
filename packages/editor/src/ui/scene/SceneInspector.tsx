import type { Facing, Problem, SceneFile } from "@questforge/schema";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Actions } from "../../model/actions.ts";
import { sceneThingReferences } from "../../model/commands.ts";
import {
  addObstacle,
  changeThingId,
  removeObstacle,
  setBackground,
  setBaseline,
  setDepthScale,
  setDepthY,
  setObjectFields,
  setPlacement,
  setSpawn,
  setThingName,
  setWalkTo,
  thingNoun,
} from "../../model/scene/commands.ts";
import { sceneProblems, thingKey } from "../../model/scene/problems.ts";
import { holeIndex, type ThingList, type ThingRef } from "../../model/scene/things.ts";
import { Button } from "../components/ui/button.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { Prompt } from "../Dialogs.tsx";
import { References } from "../Inspector.tsx";
import { NumberField } from "../NumberField.tsx";
import { TextField } from "../TextField.tsx";
import { useCanvasImages } from "./images.ts";
import { ObjectAnimations } from "../sprites/ObjectAnimations.tsx";
import { InspectorShell } from "../InspectorShell.tsx";
import { thingOwner } from "../../model/rules/owner.ts";
import { objectFrameSize } from "@questforge/engine";

// The Inspector for things on a scene canvas (spec 09, D99). Every change is one
// labelled undo step through Editor.apply; typing merges per field until blur (D84).

const DT = "text-muted-foreground mt-3 text-[11px] font-semibold tracking-wider uppercase";
const FACINGS: Facing[] = ["down", "up", "left", "right"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5" aria-label={title}>
      <h4 className={DT}>{title}</h4>
      {children}
    </section>
  );
}

function FacingSelect({ value, onChange, label = "Facing" }: { value: Facing; onChange(f: Facing): void; label?: string }) {
  return (
    <div className="grid gap-1">
      <Label className="text-muted-foreground text-[11px] font-normal">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Facing)}>
        <SelectTrigger size="sm" aria-label={label} className="h-7 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent onPointerDown={(e) => e.stopPropagation()}>
          {FACINGS.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" className="accent-primary size-3.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ImageSelect({ actions, value, onChange, label, allowNone }: { actions: Actions; value: string | undefined; onChange(v: string | undefined): void; label: string; allowNone?: boolean }) {
  const images = actions.editor.project.assets?.data.images ?? [];
  return (
    <div className="grid gap-1">
      <Label className="text-muted-foreground text-[11px] font-normal">{label}</Label>
      <Select value={value ?? "__none"} onValueChange={(v) => onChange(v === "__none" ? undefined : v)}>
        <SelectTrigger size="sm" aria-label={label} className="h-7 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent onPointerDown={(e) => e.stopPropagation()}>
          {allowNone && <SelectItem value="__none">None (black)</SelectItem>}
          {value !== undefined && !images.some((i) => i.id === value) && <SelectItem value={value}>{value} (missing)</SelectItem>}
          {images.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Problems with the selected thing, in plain English (D100). */
function Problems({ problems }: { problems: Problem[] }) {
  if (!problems.length) return null;
  return (
    <ul className="border-err/40 bg-err/10 text-err mt-2 grid gap-1 rounded-md border p-2 text-[12px]" aria-label="Problems with this">
      {problems.map((p, i) => (
        <li key={i} className="flex gap-1.5">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{p.message}</span>
        </li>
      ))}
    </ul>
  );
}

const TITLE: Record<ThingList, string> = {
  objects: "Object",
  characters: "Character",
  hotspots: "Hotspot",
  regions: "Region",
  spawns: "Spawn point",
  walkable: "Walkable area",
  depth: "Depth lines",
  background: "Background",
};

/** Inspector for one thing in a scene. */
export function SceneThingInspector({ actions, sceneId, thing }: { actions: Actions; sceneId: string; thing: ThingRef }) {
  const { editor, ws } = actions;
  const p = editor.project;
  const doc = p.scenes.find((s) => s.data.id === sceneId);
  const images = useCanvasImages(p);
  const [changingId, setChangingId] = useState(false);
  const nameBox = useRef<HTMLDivElement | null>(null);

  // A new hotspot or region asks for its name right away (D99).
  useEffect(() => {
    if (ws.focusRequest !== "name") return;
    ws.takeFocusRequest();
    const input = nameBox.current?.querySelector("input");
    input?.focus();
    input?.select();
  });

  if (!doc) return null;
  const scene = doc.data as SceneFile;
  // Problems inside rules show on their rule cards in red (spec 10); the rest show here.
  const problems = (sceneProblems(editor.problems, doc.path, scene).get(thingKey(thing)) ?? []).filter((x) => !x.location.path.includes("rules"));
  const ruleOwner = thingOwner(sceneId, thing.list, thing.key);
  const run = (label: string, f: Parameters<typeof editor.apply>[1], field?: string) => editor.apply(label, f, field && `${sceneId}:${thing.list}:${thing.key}:${field}`);
  const blur = () => editor.history.breakMerge();
  const num = (label: string, value: number, apply: (n: number) => void, opts: { integer?: boolean; min?: number; max?: number; step?: number } = { integer: true }) => (
    <NumberField label={label} value={value} onChange={apply} onBlur={blur} {...opts} />
  );
  const idRow = (
    <div className="flex items-center gap-2">
      <code className="selectable font-mono text-[12px]">{thing.key}</code>
      <Button variant="ghost" size="xs" onClick={() => setChangingId(true)}>
        Change ID…
      </Button>
    </div>
  );
  const kind = ({ objects: "object", spawns: "spawn" } as const)[thing.list as "objects" | "spawns"];
  const refs = kind ? sceneThingReferences(p, sceneId, kind, thing.key) : [];
  let body: React.ReactNode = null;

  switch (thing.list) {
    case "hotspots": {
      const h = scene.hotspots.find((x) => x.id === thing.key);
      if (!h) return null;
      const w = h.walkTo;
      body = (
        <>
          <div ref={nameBox}>
            <TextField label="Name (shown to the player)" value={h.name} onChange={(v) => run("Rename hotspot", (q) => setThingName(q, sceneId, thing, v), "name")} onBlur={blur} />
          </div>
          <Section title="ID">{idRow}</Section>
          <Section title="Walk-to point">
            {w ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {num("X", w.x, (x) => run("Move walk-to point", (q) => setWalkTo(q, sceneId, h.id, { ...w, x }), "walkx"))}
                  {num("Y", w.y, (y) => run("Move walk-to point", (q) => setWalkTo(q, sceneId, h.id, { ...w, y }), "walky"))}
                  <FacingSelect value={w.facing} onChange={(facing) => run("Change walk-to facing", (q) => setWalkTo(q, sceneId, h.id, { ...w, facing }))} />
                </div>
                <Button variant="ghost" size="xs" className="justify-self-start" onClick={() => run("Remove walk-to point", (q) => setWalkTo(q, sceneId, h.id, undefined))}>
                  Remove walk-to point
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground text-[12px]">Not set: the player walks to the nearest walkable point. Use the Walk-to tool (W) to place one.</p>
            )}
          </Section>
        </>
      );
      break;
    }
    case "regions": {
      const r = scene.regions.find((x) => x.id === thing.key);
      if (!r) return null;
      body = (
        <>
          <Section title="ID">
            <div ref={nameBox}>{idRow}</div>
          </Section>
        </>
      );
      break;
    }
    case "objects": {
      const o = scene.objects.find((x) => x.id === thing.key);
      if (!o) return null;
      const size = objectFrameSize(o, images.lookup) ?? undefined;
      const autoBaseline = size ? o.y + size.h : undefined;
      body = (
        <>
          <TextField
            label="Name (empty: scenery the player can't click)"
            value={o.name ?? ""}
            valid={() => true}
            onChange={(v) => run("Rename object", (q) => setThingName(q, sceneId, thing, v), "name")}
            onBlur={blur}
          />
          <Section title="ID">{idRow}</Section>
          <ImageSelect actions={actions} label="Image" value={o.image} onChange={(v) => v && run("Change object image", (q) => setObjectFields(q, sceneId, o.id, { image: v }))} />
          <ObjectAnimations actions={actions} sceneId={sceneId} object={o} />
          <Section title="Position (top-left)">
            <div className="grid grid-cols-2 gap-2">
              {num("X", o.x, (x) => run("Move object", (q) => setObjectFields(q, sceneId, o.id, { x }), "x"), { integer: true, min: -640, max: 1280 })}
              {num("Y", o.y, (y) => run("Move object", (q) => setObjectFields(q, sceneId, o.id, { y }), "y"), { integer: true, min: -400, max: 800 })}
            </div>
          </Section>
          <Section title="Baseline">
            <Check
              label={`Auto (bottom edge${autoBaseline !== undefined ? `, y ${autoBaseline}` : ""})`}
              checked={o.baseline === undefined}
              onChange={(auto) => run(auto ? "Use automatic baseline" : "Set baseline", (q) => setBaseline(q, sceneId, o.id, auto ? undefined : Math.min(400, Math.max(0, autoBaseline ?? o.y))))}
            />
            {o.baseline !== undefined && num("Baseline y", o.baseline, (y) => run("Move baseline", (q) => setBaseline(q, sceneId, o.id, y), "baseline"), { integer: true, min: 0, max: 400 })}
          </Section>
          <Check label="Visible when the scene starts" checked={o.visible} onChange={(visible) => run(visible ? "Show object" : "Hide object", (q) => setObjectFields(q, sceneId, o.id, { visible }))} />
          <Section title="Obstacle">
            {o.obstacle ? (
              <>
                <p className="text-muted-foreground text-[12px]">Blocks walking while the object is visible ({o.obstacle.length} points). Drag its points on the canvas, or redraw it with the Polygon tool.</p>
                <Button variant="ghost" size="xs" className="justify-self-start" onClick={() => run("Remove obstacle", (q) => removeObstacle(q, sceneId, o.id))}>
                  Remove obstacle
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="xs" className="justify-self-start" disabled={!size} onClick={() => size && run("Add obstacle", (q) => addObstacle(q, sceneId, o.id, size))}>
                Add obstacle
              </Button>
            )}
          </Section>
        </>
      );
      break;
    }
    case "characters": {
      const c = scene.characters.find((x) => x.character === thing.key);
      if (!c) return null;
      body = (
        <>
          <Section title="Feet">
            <div className="grid grid-cols-3 gap-2">
              {num("X", c.x, (x) => run("Move character", (q) => setPlacement(q, sceneId, c.character, { x }), "x"), { integer: true, min: 0, max: 640 })}
              {num("Y", c.y, (y) => run("Move character", (q) => setPlacement(q, sceneId, c.character, { y }), "y"), { integer: true, min: 0, max: 400 })}
              <FacingSelect value={c.facing} onChange={(facing) => run("Turn character", (q) => setPlacement(q, sceneId, c.character, { facing }))} />
            </div>
          </Section>
          <Check label="Visible when the scene starts" checked={c.visible} onChange={(visible) => run(visible ? "Show character" : "Hide character", (q) => setPlacement(q, sceneId, c.character, { visible }))} />
        </>
      );
      break;
    }
    case "spawns": {
      const sp = scene.spawns[thing.key];
      if (!sp) return null;
      body = (
        <>
          <Section title="ID">{idRow}</Section>
          <Section title="Where the player appears">
            <div className="grid grid-cols-3 gap-2">
              {num("X", sp.x, (x) => run("Move spawn point", (q) => setSpawn(q, sceneId, thing.key, { ...sp, x }), "x"), { integer: true, min: 0, max: 640 })}
              {num("Y", sp.y, (y) => run("Move spawn point", (q) => setSpawn(q, sceneId, thing.key, { ...sp, y }), "y"), { integer: true, min: 0, max: 400 })}
              <FacingSelect value={sp.facing} onChange={(facing) => run("Turn spawn point", (q) => setSpawn(q, sceneId, thing.key, { ...sp, facing }))} />
            </div>
          </Section>
        </>
      );
      break;
    }
    case "depth":
      body = (
        <>
          <p className="text-muted-foreground text-[12px]">Characters with their feet on the far line draw at its scale, on the near line at its scale, and in between at a blend (spec 04).</p>
          {(["far", "near"] as const).map((key) => (
            <Section key={key} title={key === "far" ? "Far line" : "Near line"}>
              <div className="grid grid-cols-2 gap-2">
                {num("Y", scene.depth[key].y, (y) => run("Move depth line", (q) => setDepthY(q, sceneId, key, y), `${key}y`), { integer: true, min: 0, max: 400 })}
                {num("Scale", scene.depth[key].scale, (v) => run("Change depth scale", (q) => setDepthScale(q, sceneId, key, v), `${key}scale`), { min: 0.01, max: 4, step: 0.05 })}
              </div>
            </Section>
          ))}
        </>
      );
      break;
    case "walkable": {
      const i = holeIndex(thing.key);
      const poly = thing.key === "outer" ? scene.walkable.outer : scene.walkable.holes[i];
      if (!poly) return null;
      body = (
        <p className="text-muted-foreground text-[12px]">
          {poly.length} points. Drag points to reshape, Alt-click a point to delete it, double-click an edge to add one.
          {thing.key === "outer" ? " New shapes drawn on the Walkable layer become holes." : ""}
        </p>
      );
      break;
    }
    case "background":
      body = <ImageSelect actions={actions} label="Image" value={scene.background} allowNone onChange={(v) => run(v ? "Set background" : "Remove background", (q) => setBackground(q, sceneId, v))} />;
      break;
  }

  const title =
    thing.list === "hotspots"
      ? scene.hotspots.find((h) => h.id === thing.key)?.name ?? thing.key
      : thing.list === "walkable"
        ? thing.key === "outer"
          ? "Walkable outline"
          : `Hole ${holeIndex(thing.key) + 1}`
        : thing.list === "depth" || thing.list === "background"
          ? TITLE[thing.list]
          : thing.key;
  return (
    <InspectorShell actions={actions} title={title} subtitle={`${TITLE[thing.list]} in ${scene.name}`} owner={ruleOwner}>
      <Problems problems={problems} />
      {body}
      {kind && (
        <dl className="grid gap-0.5">
          <References actions={actions} refs={refs} />
        </dl>
      )}
      {changingId && (
        <Prompt
          title={`Change the ID of ${thingNoun(thing)} ${thing.key}`}
          label="New ID"
          initial={thing.key}
          action="Change ID"
          hint={() => (refs.length ? `${refs.length} reference${refs.length === 1 ? "" : "s"} will be updated.` : "Nothing refers to it yet.")}
          onCancel={() => setChangingId(false)}
          onSubmit={(v) => {
            const to = v.trim();
            if (!editor.apply("Change ID", (q) => changeThingId(q, sceneId, thing, to))) return;
            setChangingId(false);
            ws.select({ kind: "sceneThing", scene: sceneId, list: thing.list, key: to });
          }}
        />
      )}
    </InspectorShell>
  );
}

/** Scene-wide settings when the scene itself is selected: name and background. */
export function SceneSettings({ actions, sceneId }: { actions: Actions; sceneId: string }) {
  const { editor } = actions;
  const doc = editor.project.scenes.find((s) => s.data.id === sceneId);
  if (!doc) return null;
  const scene = doc.data as SceneFile;
  // Problems in the scene's own rules show on their cards (spec 10).
  const sceneWide = (sceneProblems(editor.problems, doc.path, scene).get("") ?? []).filter((x) => x.location.path[0] !== "rules");
  return (
    <div className="mb-2 grid gap-2">
      <Problems problems={sceneWide} />
      <ImageSelect actions={actions} label="Background" value={scene.background} allowNone onChange={(v) => editor.apply(v ? "Set background" : "Remove background", (q) => setBackground(q, sceneId, v))} />
    </div>
  );
}
