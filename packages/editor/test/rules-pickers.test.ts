import { describe, expect, it } from "vitest";
import { validateProject, type Project } from "@questforge/schema";
import { addAction, addCondition, setConditionFields, setTriggerField } from "../src/model/rules/commands.ts";
import { ownerRules, type RuleOwnerRef } from "../src/model/rules/owner.ts";
import { CREATABLE, createAndUse, createForPicker, fieldPick, pickerOptions } from "../src/model/rules/pickers.ts";
import { ACTION_PARTS, CONDITION_PARTS, type Field } from "../src/model/rules/vocab.ts";
import { m1Project } from "./support/fixtures.ts";
import { sceneEditor } from "./support/scene.ts";

const POND: RuleOwnerRef = { kind: "thing", scene: "garden", list: "hotspots", key: "pond" };
const rule = (p: Project, id: string) => ownerRules(p, POND)!.rules.find((r) => r.id === id)!;
const pickField = (parts: readonly (string | Field)[], key: string) => parts.find((x): x is Extract<Field, { kind: "pick" }> => typeof x !== "string" && x.kind === "pick" && x.key === key)!;

describe("picker options (spec 10)", () => {
  it("lists each kind, with names where there are names", async () => {
    const p = await m1Project();
    expect(pickerOptions(p, "item").map((o) => o.id)).toEqual(["fish", "rod", "stick", "string"]);
    expect(pickerOptions(p, "item")[0]).toEqual({ id: "fish", label: "fish" });
    expect(pickerOptions(p, "flag")).toEqual([{ id: "path_open", label: "path_open" }]);
    expect(pickerOptions(p, "counter")).toEqual([]);
    expect(pickerOptions(p, "scene").map((o) => o.label)).toEqual(["Garden", "Garden shed", "Stress test"]);
    expect(pickerOptions(p, "spawn", "shed").map((o) => o.id)).toEqual(["door"]);
    expect(pickerOptions(p, "object", "garden").map((o) => o.id)).toContain("boulder");
    expect(pickerOptions(p, "character").map((o) => o.id)).toEqual(["gardener", "hero", "visitor"]);
    expect(pickerOptions(p, "award").map((o) => o.id)).toEqual(expect.arrayContaining(["caught_fish", "fed_gardener", "saw_view"]));
    // Slots include mirrored lefts (D39).
    const slots = pickerOptions(p, "slot", "hero").map((o) => o.id);
    expect(slots).toEqual(expect.arrayContaining(["walk_right", "walk_left"]));
  });

  it("scopes spawns and objects to the part's scene, and animations to the target", async () => {
    const p = await m1Project();
    expect(fieldPick({ type: "change_scene", scene: "shed", spawn: "door" }, pickField(ACTION_PARTS.change_scene, "spawn"))).toEqual({ pick: "spawn", scope: "shed" });
    expect(fieldPick({ type: "object_visible", scene: "garden", object: "boulder", visible: true }, pickField(CONDITION_PARTS.object_visible, "object"))).toEqual({ pick: "object", scope: "garden" });
    const anim = pickField(ACTION_PARTS.play_animation, "animation");
    expect(fieldPick({ target: { kind: "character", character: "hero" } }, anim)).toEqual({ pick: "slot", scope: "hero" });
    expect(fieldPick({ target: { kind: "object", scene: "garden", object: "boulder" } }, anim)).toEqual({ pick: "animation", scope: "garden/boulder" });
    expect(pickerOptions(p, "animation", "garden/boulder")).toEqual([]);
  });
});

describe("+ Create new… (D123)", () => {
  it("makes flags, counters, items, scenes, characters and dialogues from a typed name", async () => {
    const p = await m1Project();
    const flag = createForPicker(p, "flag", "Door locked");
    expect(flag.id).toBe("door_locked");
    expect(flag.project.flags!.data.flags.at(-1)).toEqual({ id: "door_locked", type: "bool", initial: false });
    expect(createForPicker(p, "counter", "Visits").project.flags!.data.flags.at(-1)).toEqual({ id: "visits", type: "counter", initial: 0 });
    const key = createForPicker(p, "item", "Brass key");
    expect(key.id).toBe("brass_key");
    expect(key.project.items.find((i) => i.data.id === "brass_key")).toMatchObject({ path: "items/brass_key.item.yaml", data: { name: "Brass key" } });
    expect(createForPicker(p, "item", "fish").id).toBe("fish_2");
    expect(createForPicker(p, "scene", "Hall").project.scenes.at(-1)!.path).toBe("scenes/hall.scene.yaml");
    expect(createForPicker(p, "dialogue", "Chat").id).toBe("chat");
    expect(createForPicker(p, "character", "Cat").id).toBe("cat");
    const award = createForPicker(p, "award", "caught fish");
    expect(award).toEqual({ project: p, id: "caught_fish_2" });
    expect(() => createForPicker(p, "item", "  ")).toThrow(/name/);
    expect(() => createForPicker(p, "spawn", "x")).toThrow();
    expect(CREATABLE.has("audio")).toBe(false);
  });

  it("creating and using is one undo step, and the rule is valid at once", async () => {
    const { editor, dispose } = await sceneEditor();
    editor.apply("Add condition", (p) => addCondition(p, POND, "rule_4", "flag_is"));
    editor.apply("Create flag and use it", (p) => createAndUse(p, "flag", "Fish scared", (q, id) => setConditionFields(q, POND, "rule_4", 0, { flag: id })));
    expect(rule(editor.project, "rule_4").if[0]).toEqual({ type: "flag_is", flag: "fish_scared", value: true });
    expect(editor.project.flags!.data.flags.map((f) => f.id)).toContain("fish_scared");
    editor.undo();
    expect(rule(editor.project, "rule_4").if[0]).toEqual({ type: "flag_is", flag: "path_open", value: true });
    expect(editor.project.flags!.data.flags.map((f) => f.id)).not.toContain("fish_scared");
    editor.redo();
    editor.apply("Create item and use it", (p) => createAndUse(p, "item", "Net", (q, id) => setTriggerField(q, POND, "rule_2", "item", id)));
    editor.apply("Add action", (p) => addAction(p, POND, "rule_2", "give_item"));
    // (The in-memory copy has no PNGs, so only look at this rule's problems.)
    const inPond = validateProject(editor.project).filter((x) => x.location.path.slice(0, 2).join() === "hotspots,0");
    expect(inPond).toEqual([]);
    dispose();
  });
});
