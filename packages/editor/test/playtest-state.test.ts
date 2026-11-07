import { describe, expect, it } from "vitest";
import { applyStateEdit, awardCatalog, stateView } from "../src/model/playtest/state.ts";
import { playtestEditor } from "./support/playtest.ts";

// The state panel (spec 12, D130): what it lists and live edits.

const POND: [number, number] = [310, 320];

describe("state panel view", () => {
  it("lists scene, inventory, flags, score, awards and visited scenes", async () => {
    const { playtest, editor, session, dispose } = await playtestEditor();
    playtest.play();
    const v = stateView(editor.project, session());
    expect(v.scene).toEqual({ id: "garden", label: "Garden" });
    expect(v.inventory).toEqual([]);
    expect(v.addable.map((i) => i.id)).toEqual(["coin", "fish", "lantern", "rod", "stick", "string"]);
    expect(v.flags).toEqual([{ id: "path_open", value: false }]);
    expect(v.score).toBe(0);
    expect(v.maxScore).toBe(25);
    expect(v.awards.map((a) => a.id)).toEqual(awardCatalog(editor.project).map((a) => a.id));
    expect(v.awards.find((a) => a.id === "caught_fish")).toEqual({ id: "caught_fish", points: 5, granted: false });
    expect(v.visited.find((x) => x.id === "garden")?.visited).toBe(true);
    expect(v.visited.find((x) => x.id === "shed")?.visited).toBe(false);
    dispose();
  });
});

describe("live edits (D130)", () => {
  it("an added item works in the next rule at once", async () => {
    const { playtest, session, tap, dispose } = await playtestEditor();
    playtest.play();
    applyStateEdit(session(), { kind: "giveItem", item: "rod" });
    tap({ item: "rod" }, POND);
    expect(session().state.inventory).toContain("fish");
    expect(session().state.awards).toEqual({ caught_fish: 5 });
    applyStateEdit(session(), { kind: "takeItem", item: "rod" });
    session().tick(1 / 60);
    expect(session().item).toBe(null);
    dispose();
  });

  it("flags, counters, awards and visited change the state", async () => {
    const { playtest, editor, session, dispose } = await playtestEditor();
    playtest.play();
    const s = session();
    applyStateEdit(s, { kind: "setFlag", flag: "path_open", value: true });
    applyStateEdit(s, { kind: "setCounter", counter: "n", value: 3.7 });
    applyStateEdit(s, { kind: "grantAward", award: "caught_fish", points: 5 });
    applyStateEdit(s, { kind: "grantAward", award: "caught_fish", points: 99 });
    applyStateEdit(s, { kind: "setVisited", scene: "shed", visited: true });
    expect(s.state.flags.path_open).toBe(true);
    expect(s.state.counters.n).toBe(3);
    expect(stateView(editor.project, s).score).toBe(5);
    expect(s.state.visited).toEqual(["garden", "shed"]);
    applyStateEdit(s, { kind: "revokeAward", award: "caught_fish" });
    applyStateEdit(s, { kind: "setVisited", scene: "shed", visited: false });
    expect(s.state.awards).toEqual({});
    expect(s.state.visited).toEqual(["garden"]);
    dispose();
  });

  it("edits apply during a sequence; only Go to scene waits", async () => {
    const { playtest, editor, session, settle, dispose } = await playtestEditor();
    playtest.play();
    const s = session();
    s.selectVerb("look");
    s.primaryClick(POND);
    expect(s.busy).toBe(true);
    expect(stateView(editor.project, s).canGoToScene).toBe(false);
    expect(applyStateEdit(s, { kind: "setFlag", flag: "path_open", value: true })).toBe(true);
    expect(s.state.flags.path_open).toBe(true);
    expect(applyStateEdit(s, { kind: "goToScene", scene: "shed" })).toBe(false);
    settle();
    expect(applyStateEdit(s, { kind: "goToScene", scene: "shed" })).toBe(true);
    settle();
    expect(s.scene.id).toBe("shed");
    expect(s.state.visited).toContain("shed");
    dispose();
  });

  it("state edits are never undo steps or project changes", async () => {
    const { playtest, editor, session, dispose } = await playtestEditor();
    playtest.play();
    const before = editor.project;
    applyStateEdit(session(), { kind: "giveItem", item: "fish" });
    expect(editor.project).toBe(before);
    expect(editor.history.canUndo).toBe(false);
    expect(playtest.stale).toBe(false);
    dispose();
  });
});
