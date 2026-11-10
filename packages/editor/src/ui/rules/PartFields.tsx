import { Crosshair } from "lucide-react";
import type { Project } from "@questforge/schema";
import { CREATABLE, CREATE_NOUN, fieldPick, pickerOptions } from "../../model/rules/pickers.ts";
import type { Field, Part, PickKind } from "../../model/rules/vocab.ts";
import { Button } from "../components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { cn } from "../lib/utils.ts";
import { NumberField } from "../NumberField.tsx";
import { TextField } from "../TextField.tsx";
import { Picker } from "./Picker.tsx";

type AnimTarget = { kind: "character"; character: string } | { kind: "object"; scene: string; object: string };

export interface PartHandlers {
  /** Changes fields; `field` names the typed field so keystrokes merge into one undo step. */
  patch(patch: Record<string, unknown>, field?: string): void;
  /** Ends a typing step. */
  blur(): void;
  /** "+ Create new…" for a pick field: make it, then use it (one undo step). */
  create(pick: PickKind, name: string, key: string): void;
  animTarget(target: AnimTarget): void;
  /** "Pick on canvas" for a point; absent when there's no scene to pick on. */
  pickPoint?(): void;
  /** True while this point is waiting for a canvas click. */
  picking?: boolean;
  /** Why "Pick on canvas" can't be used right now. */
  pickDisabled?: string;
}

function SmallSelect(props: { label: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void; invalid?: boolean }) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger size="sm" aria-label={props.label} className={cn("h-7 w-auto gap-1 px-2 text-[13px]", props.invalid && "border-err text-err")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent onPointerDown={(e) => e.stopPropagation()}>
        {!props.options.some((o) => o.value === props.value) && <SelectItem value={props.value}>{props.value} (missing)</SelectItem>}
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const targetValue = (t: AnimTarget) => (t.kind === "character" ? `c:${t.character}` : `o:${t.scene}/${t.object}`);

/** One field of a rule sentence. */
function FieldInput({
  project,
  field,
  value,
  h,
  invalid,
}: {
  project: Project;
  field: Field;
  value: Record<string, unknown>;
  h: PartHandlers;
  invalid: boolean;
}) {
  switch (field.kind) {
    case "pick": {
      const { pick, scope } = fieldPick(value, field);
      const current = String(value[field.key] ?? "");
      return (
        <Picker
          label={field.label}
          value={current}
          options={pickerOptions(project, pick, scope)}
          invalid={invalid}
          onPick={(id) => h.patch({ [field.key]: id })}
          {...(CREATABLE.has(pick) && { createNoun: CREATE_NOUN[pick]!, onCreate: (name: string) => h.create(pick, name, field.key) })}
        />
      );
    }
    case "text":
      return (
        <TextField
          compact
          multiline
          label={field.label}
          placeholder={`${field.label}…`}
          value={String(value[field.key] ?? "")}
          valid={() => true}
          invalid={invalid}
          onChange={(v) => h.patch({ [field.key]: v }, field.key)}
          onBlur={h.blur}
        />
      );
    case "int":
    case "number":
      return (
        <NumberField
          compact
          className="w-16"
          label={field.label}
          value={Number(value[field.key] ?? 0)}
          integer={field.kind === "int"}
          {...(field.min !== undefined && { min: field.min })}
          {...(field.kind === "number" && { max: field.max, step: field.step })}
          onChange={(n) => h.patch({ [field.key]: n }, field.key)}
          onBlur={h.blur}
        />
      );
    case "bool":
      return (
        <SmallSelect
          label={field.label}
          value={value[field.key] ? "true" : "false"}
          options={[
            { value: "true", label: field.on },
            { value: "false", label: field.off },
          ]}
          onChange={(v) => h.patch({ [field.key]: v === "true" })}
        />
      );
    case "enum":
      return (
        <SmallSelect
          label={field.label}
          value={String(value[field.key])}
          options={field.options}
          invalid={invalid}
          onChange={(v) => h.patch({ [field.key]: v })}
        />
      );
    case "point":
      return (
        <span className="inline-flex items-end gap-1">
          <NumberField
            compact
            className="w-14"
            label="X"
            integer
            min={0}
            max={640}
            value={Number(value.x)}
            onChange={(n) => h.patch({ x: n }, "x")}
            onBlur={h.blur}
          />
          <NumberField
            compact
            className="w-14"
            label="Y"
            integer
            min={0}
            max={400}
            value={Number(value.y)}
            onChange={(n) => h.patch({ y: n }, "y")}
            onBlur={h.blur}
          />
          {(h.pickPoint || h.pickDisabled) && (
            <Button
              variant={h.picking ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[12px]"
              aria-pressed={!!h.picking}
              disabled={!h.pickPoint}
              title={h.pickDisabled ?? (h.picking ? "Click the scene to place the point (Escape cancels)" : "Pick on canvas")}
              onClick={h.pickPoint}
            >
              <Crosshair className="size-3.5" />
              {h.picking ? "Click the scene…" : "Pick on canvas"}
            </Button>
          )}
        </span>
      );
    case "animTarget": {
      const t = value.target as AnimTarget;
      const options = [
        ...project.characters.map((c) => ({ value: `c:${c.data.id}`, label: c.data.name })),
        ...project.scenes.flatMap((s) => s.data.objects.map((o) => ({ value: `o:${s.data.id}/${o.id}`, label: `${o.name ?? o.id} (${s.data.name})` }))),
      ];
      return (
        <SmallSelect
          label={field.label}
          value={targetValue(t)}
          options={options}
          invalid={invalid}
          onChange={(v) => {
            if (v.startsWith("c:")) h.animTarget({ kind: "character", character: v.slice(2) });
            else {
              const [scene, object] = v.slice(2).split("/") as [string, string];
              h.animTarget({ kind: "object", scene, object });
            }
          }}
        />
      );
    }
  }
}

/** The fields of a trigger, condition or action as a sentence. `invalidKeys` are fields with problems. */
export function PartFields({
  project,
  parts,
  value,
  h,
  invalidKeys,
}: {
  project: Project;
  parts: readonly Part[];
  value: Record<string, unknown>;
  h: PartHandlers;
  invalidKeys: ReadonlySet<string>;
}) {
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: rule parts have no ids and are addressed by position (data-part), so position is their identity
          <span key={i} className="text-muted-foreground text-[12px]">
            {part}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: rule parts have no ids and are addressed by position (data-part), so position is their identity
          <FieldInput key={i} project={project} field={part} value={value} h={h} invalid={invalidKeys.has(fieldKey(part))} />
        ),
      )}
    </>
  );
}

/** The data key a problem path names for a field. */
const fieldKey = (f: Field) => (f.kind === "point" ? "x" : f.kind === "animTarget" ? "target" : f.key);
