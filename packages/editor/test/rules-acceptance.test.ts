import { describe, expect, it } from "vitest";
import { validateProject, type Project } from "@questforge/schema";
import { Session } from "@questforge/engine";
import { deleteEntry } from "../src/model/commands.ts";
import { locate } from "../src/model/locate.ts";
import { addAction, addCondition, addRule, setActionFields, setConditionFields, setTriggerField } from "../src/model/rules/commands.ts";
import { ownerRules, type RuleOwnerRef } from "../src/model/rules/owner.ts";
import { pickerOptions } from "../src/model/rules/pickers.ts";
import { partKey, ruleProblems } from "../src/model/rules/problems.ts";
import { m1Project } from "./support/fixtures.ts";
import { sceneEditor } from "./support/scene.ts";

// Rule inspector and validation acceptance, driven through the same model calls the
// Inspector makes: canvas gestures, dropdowns and pickers, plus one typed line.

describe("rule inspector acceptance", () => {
  it("builds use key on door → unlocks → walk through door changes scene, typing only the dialogue text", async () => {
    const { editor, c, drag, scene, dispose } = await sceneEditor();
    const typed: string[] = [];
    /** A dropdown or picker choice: the value must be one the control offers. */
    const choose = <T>(offered: readonly T[], value: T) => {
      expect(offered).toContain(value);
      return value;
    };
    const say = (text: string) => (typed.push(text), text);

    // Draw the door on the Hotspots layer with the Rectangle tool.
    c.setLayer("hotspots");
    c.setTool("rect");
    drag([60, 290], [120, 350]);
    const door = scene().hotspots.at(-1)!;
    expect(door.id).toBe("hotspot");
    const DOOR: RuleOwnerRef = { kind: "thing", scene: "garden", list: "hotspots", key: door.id };
    const items = pickerOptions(editor.project, "item").map((o) => o.id);
    const flags = pickerOptions(editor.project, "flag").map((o) => o.id);

    // Rule 1: When Use [fishing rod] (our key), If [path_open] is [false],
    // Do: Say [hero] "…", Set flag [path_open] to [true].
    const unlock = editor.applyWith("Add rule", (p) => addRule(p, DOOR, "use_item"))!.id;
    editor.apply("Edit rule", (p) => setTriggerField(p, DOOR, unlock, "item", choose(items, "rod")));
    editor.apply("Add condition", (p) => addCondition(p, DOOR, unlock, "flag_is"));
    editor.apply("Edit rule", (p) => setConditionFields(p, DOOR, unlock, 0, { flag: choose(flags, "path_open"), value: choose([true, false], false) }));
    editor.apply("Add action", (p) => addAction(p, DOOR, unlock, "say"));
    editor.apply("Edit rule", (p) => setActionFields(p, DOOR, unlock, 0, { text: say("Click! The door unlocks.") }));
    editor.apply("Add action", (p) => addAction(p, DOOR, unlock, "set_flag"));

    // Rule 2: When Walk, If [path_open] is [true], Do: Change scene [Garden shed] at [door].
    const through = editor.applyWith("Add rule", (p) => addRule(p, DOOR, "walk"))!.id;
    editor.apply("Add condition", (p) => addCondition(p, DOOR, through, "flag_is"));
    editor.apply("Add action", (p) => addAction(p, DOOR, through, "change_scene"));
    editor.apply("Edit rule", (p) =>
      setActionFields(p, DOOR, through, 0, {
        scene: choose(
          pickerOptions(editor.project, "scene").map((o) => o.id),
          "shed",
        ),
      }),
    );
    editor.apply("Edit rule", (p) =>
      setActionFields(p, DOOR, through, 0, {
        spawn: choose(
          pickerOptions(editor.project, "spawn", "shed").map((o) => o.id),
          "door",
        ),
      }),
    );

    const rules = ownerRules(editor.project, DOOR)!.rules;
    expect(rules).toEqual([
      {
        id: unlock,
        when: { type: "use_item", item: "rod" },
        if: [{ type: "flag_is", flag: "path_open", value: false }],
        do: [
          { type: "say", character: "hero", text: "Click! The door unlocks." },
          { type: "set_flag", flag: "path_open", value: true },
        ],
        once: false,
      },
      {
        id: through,
        when: { type: "walk" },
        if: [{ type: "flag_is", flag: "path_open", value: true }],
        do: [{ type: "change_scene", scene: "shed", spawn: "door" }],
        once: false,
      },
    ]);
    expect(typed).toEqual(["Click! The door unlocks."]);
    const doorProblems = validateProject(editor.project).filter((x) => x.location.file === "scenes/garden.scene.yaml" && x.location.path[0] === "hotspots");
    expect(doorProblems).toEqual([]);

    // And it plays: the engine runs exactly what was built.
    const s = new Session(editor.project, () => undefined);
    const settle = () => {
      for (let i = 0; i < 60 * 60; i++) {
        s.skipText();
        s.tick(1 / 60);
        if (!s.busy && !s.world.walking && !s.text) return;
      }
      throw new Error("never settled");
    };
    settle();
    const doorAt: [number, number] = [90, 320];
    s.state.inventory.push("rod");
    s.selectItem("rod");
    let said: string | null = null;
    s.primaryClick(doorAt);
    for (let i = 0; i < 60 * 30 && !said; i++) {
      s.tick(1 / 60);
      said = s.text?.text ?? null;
    }
    expect(said).toBe("Click! The door unlocks.");
    settle();
    expect(s.state.flags.path_open).toBe(true);
    s.selectVerb("walk");
    s.primaryClick(doorAt);
    settle();
    expect(s.scene.id).toBe("shed");
    dispose();
  });
});

describe("validation acceptance in the editor", () => {
  it("a deleted item used in 3 places makes 3 problems, each jumping to its rule and shown in red on it", async () => {
    const p: Project = deleteEntry(await m1Project(), "item", "stick");
    const problems = validateProject(p).filter((x) => x.code === "missing_reference");
    expect(problems).toHaveLength(3);
    const GAME: RuleOwnerRef = { kind: "game" };
    const POT: RuleOwnerRef = { kind: "thing", scene: "garden", list: "objects", key: "flowerpot" };
    // Each jumps to the owner of its rule…
    expect(problems.map((x) => locate(p, x.location)!.target)).toEqual([
      { kind: "game" },
      { kind: "game" },
      { kind: "sceneThing", scene: "garden", list: "objects", key: "flowerpot" },
    ]);
    // …and each lands on a red part of a rule card there.
    const game = ruleProblems(problems, ownerRules(p, GAME)!);
    const combine = ownerRules(p, GAME)!.rules[0]!.id;
    expect(game.byPart.get(partKey(combine, { kind: "when" }))).toHaveLength(1);
    expect(game.byPart.get(partKey(combine, { kind: "do", index: 0 }))).toHaveLength(1);
    const pot = ruleProblems(problems, ownerRules(p, POT)!);
    const hand = ownerRules(p, POT)!.rules.find((r) => r.do.some((a) => a.type === "give_item"))!.id;
    // Narrate, play the pickup sound, then give the stick.
    expect(pot.byPart.get(partKey(hand, { kind: "do", index: 2 }))![0]!.message).toBe("uses item stick, which doesn't exist.");
  });
});
