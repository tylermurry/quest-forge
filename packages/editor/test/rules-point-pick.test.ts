import { describe, expect, it } from "vitest";
import type { Project } from "@questforge/schema";
import { addAction, addRule } from "../src/model/rules/commands.ts";
import { ownerRules, type RuleOwnerRef } from "../src/model/rules/owner.ts";
import { applyPointPick, pointPickScene } from "../src/model/rules/pointPick.ts";
import { m1Project } from "./support/fixtures.ts";
import { sceneEditor } from "./support/scene.ts";

const POND: RuleOwnerRef = { kind: "thing", scene: "garden", list: "hotspots", key: "pond" };
const GAME: RuleOwnerRef = { kind: "game" };
const action = (p: Project, o: RuleOwnerRef, id: string, i: number) => ownerRules(p, o)!.rules.find((r) => r.id === id)!.do[i]!;

describe("Pick on canvas", () => {
  it("picks on the rule's scene, the action's scene, or the open scene tab for game rules", () => {
    const walk = { type: "walk_player_to", x: 1, y: 1 } as const;
    expect(pointPickScene(POND, walk, "shed")).toBe("garden");
    expect(pointPickScene(GAME, walk, "shed")).toBe("shed");
    expect(pointPickScene(GAME, walk, null)).toBeNull();
    expect(pointPickScene(POND, { type: "set_character_position", character: "gardener", scene: "shed", x: 1, y: 1, facing: "down" }, null)).toBe("shed");
    expect(pointPickScene(POND, { type: "narrate", text: "x" }, "garden")).toBeNull();
  });

  it("rounds and clamps the point into the scene", async () => {
    let p = await m1Project();
    p = addAction(p, POND, "rule_4", "walk_player_to");
    p = applyPointPick(p, { owner: POND, ruleId: "rule_4", index: 1, scene: "garden" }, [700.4, 120.6]);
    expect(action(p, POND, "rule_4", 1)).toEqual({ type: "walk_player_to", x: 640, y: 121 });
  });

  it("the next canvas click places the point as one undo step, then the Inspector comes back", async () => {
    const { editor, ws, c, click, dispose } = await sceneEditor();
    editor.apply("Add action", (p) => addAction(p, POND, "rule_4", "walk_player_to"));
    ws.select({ kind: "sceneThing", scene: "garden", list: "hotspots", key: "pond" });
    const selection = ws.selection;
    ws.startPointPick({ owner: POND, ruleId: "rule_4", index: 1, scene: "garden" });
    expect(c.cursor).toBe("crosshair");
    click([123, 345]);
    expect(action(editor.project, POND, "rule_4", 1)).toEqual({ type: "walk_player_to", x: 123, y: 345 });
    expect(editor.history.undoLabel).toBe("Pick point on canvas");
    expect(ws.pointPick).toBeNull();
    expect(ws.selection).toEqual(selection);
    // Without a pick, a click is an ordinary canvas click again.
    click([10, 10]);
    expect(action(editor.project, POND, "rule_4", 1)).toEqual({ type: "walk_player_to", x: 123, y: 345 });
    dispose();
  });

  it("Escape cancels without changing anything; a pick for another scene opens its tab", async () => {
    const { editor, ws, c, click, dispose } = await sceneEditor();
    const added = editor.applyWith("Add rule", (p) => addRule(p, POND, "hand"))!;
    editor.apply("Add action", (p) => addAction(p, POND, added.id, "set_character_position"));
    const before = editor.project;
    ws.startPointPick({ owner: POND, ruleId: added.id, index: 0, scene: "garden" });
    c.cancel();
    expect(ws.pointPick).toBeNull();
    click([50, 300]);
    expect(editor.project).toBe(before);

    ws.select({ kind: "sceneThing", scene: "garden", list: "hotspots", key: "pond" });
    ws.startPointPick({ owner: POND, ruleId: added.id, index: 0, scene: "shed" });
    expect(ws.active).toBe("scene:shed");
    // The garden canvas doesn't take a pick meant for the shed.
    click([50, 300]);
    expect(ws.pointPick).not.toBeNull();
    ws.endPointPick();
    expect(ws.selection).toEqual({ kind: "sceneThing", scene: "garden", list: "hotspots", key: "pond" });
    dispose();
  });
});
