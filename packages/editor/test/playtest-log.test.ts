import { describe, expect, it } from "vitest";
import { ItemFile, type Project, type SceneFile } from "@questforge/schema";
import { formatLog, type LogLine } from "../src/model/playtest/log.ts";
import { m1Project } from "./support/fixtures.ts";
import { playtestEditor } from "./support/playtest.ts";

// The event log (spec 12, D129, D132): which rule fired, why the others didn't,
// default responses, actions, scene changes and stub notes, with jump-to.

const DOOR: [number, number] = [90, 320];
const narrate = (text: string) => ({ type: "narrate" as const, text });

/** The m1 garden plus a key and a locked door: Use key works only once path_open is true. */
async function withDoor(): Promise<Project> {
  const p = await m1Project();
  const key = ItemFile.parse({ schemaVersion: 2, id: "key", name: "Key", description: "A small brass key.", icon: "rod_icon" });
  const door = {
    id: "door",
    name: "door",
    shape: [[60, 290], [120, 290], [120, 350], [60, 350]] as [number, number][],
    walkTo: { x: 90, y: 370, facing: "up" as const },
    rules: [
      { id: "rule_1", when: { type: "look" as const }, if: [], do: [narrate("A sturdy door.")], once: false },
      { id: "rule_2", when: { type: "use_item" as const, item: "rod" }, if: [], do: [narrate("Poke.")], once: false },
      { id: "rule_3", when: { type: "use_item" as const, item: "key" }, if: [{ type: "flag_is" as const, flag: "path_open", value: true }], do: [narrate("The door unlocks.")], once: false },
    ],
  };
  return {
    ...p,
    items: [...p.items, { path: "items/key.item.yaml", data: key }],
    scenes: p.scenes.map((d) => (d.data.id === "garden" ? { ...d, data: { ...d.data, hotspots: [...d.data.hotspots, door] } as SceneFile } : d)),
  };
}

const texts = (lines: LogLine[]) => lines.map((l) => `${"  ".repeat(l.depth)}${l.text}`);

describe("spec 12 acceptance: why 'use key on door' did nothing", () => {
  it("names the rule and its failed condition, and that line jumps to the condition", async () => {
    const { playtest, editor, ws, session, tap, dispose } = await playtestEditor(await withDoor());
    playtest.play();
    session().state.inventory.push("key");
    tap({ item: "key" }, DOOR);
    const log = formatLog(playtest.events, playtest.run!.project, editor.project);
    const tail = texts(log.slice(log.findIndex((l) => l.text === "Use Key → door")));
    expect(tail).toEqual([
      "Use Key → door",
      "  1 rule for other verbs",
      "  Rule 2 skipped: it's for Use with fishing rod",
      "  Rule 3 skipped: condition 1 failed: Flag path_open is true",
      "  No rule matched → default response",
      "  Narrate “That doesn't work.”",
    ]);
    const why = log.find((l) => l.text.startsWith("Rule 3 skipped"))!;
    expect(why.jump).toBeDefined();
    ws.jumpTo(why.jump!);
    expect(ws.selection).toEqual({ kind: "sceneThing", scene: "garden", list: "hotspots", key: "door" });
    expect(ws.inspectorTab).toBe("rules");
    expect(ws.highlight?.location.path).toEqual(["hotspots", 2, "rules", 2, "if", 0]);
    dispose();
  });
});

describe("event log lines", () => {
  it("shows the start, the matched rule and its actions", async () => {
    const { playtest, editor, tap, dispose } = await playtestEditor(await withDoor());
    playtest.play();
    tap("look", DOOR);
    const log = texts(formatLog(playtest.events, playtest.run!.project, editor.project));
    expect(log[0]).toBe("Start in Garden (at default)");
    expect(log.slice(-3)).toEqual(["Look → door", "  Rule 1 matched", "  Narrate “A sturdy door.”"]);
    dispose();
  });

  it("explains once rules, first-time conditions and scene changes", async () => {
    const { playtest, editor, tap, session, dispose } = await playtestEditor();
    playtest.play();
    tap("hand", [155, 300]); // flowerpot rule 1 (once) gives the stick
    tap("hand", [155, 300]);
    let log = texts(formatLog(playtest.events, playtest.run!.project, editor.project));
    const second = log.slice(log.lastIndexOf("Hand → flowerpot"));
    expect(second.slice(1)).toEqual(["  Rule 1 skipped: it runs once and already ran", "  Rule 2 matched", "  Narrate “Nothing else under there.”"]);
    expect(log).toContain("  Give item stick");
    // Walk into the shed: the region, the scene change and the shed's enter rule.
    tap("walk", [615, 375]);
    expect(session().scene.id).toBe("shed");
    log = texts(formatLog(playtest.events, playtest.run!.project, editor.project));
    expect(log).toContain("Player walks in → region exit_shed");
    expect(log).toContain("  Change scene Garden shed at door");
    expect(log).toContain("Garden → Garden shed (at door)");
    dispose();
  });

  it("notes stubbed actions with their milestone (D71)", async () => {
    const p = await withDoor();
    const garden = p.scenes.find((s) => s.data.id === "garden")!;
    const door = garden.data.hotspots.find((h) => h.id === "door")!;
    door.rules[0]!.do = [{ type: "play_sound", sound: "creak" } as never, narrate("Creak.")];
    p.assets!.data.audio.push({ id: "creak", path: "assets/audio/creak.mp3" });
    const { playtest, editor, tap, dispose } = await playtestEditor(p);
    playtest.play();
    tap("look", DOOR);
    const log = texts(formatLog(playtest.events, playtest.run!.project, editor.project));
    expect(log).toContain("  Sound: creak (no sound until audio arrives in M8)");
    dispose();
  });

  it("keeps the last 500 lines, and jumps follow a rule that moved", async () => {
    const { playtest, editor, ws, tap, dispose } = await playtestEditor(await withDoor());
    playtest.play();
    for (let i = 0; i < 260; i++) tap("look", DOOR);
    expect(formatLog(playtest.events, playtest.run!.project, editor.project)).toHaveLength(500);
    // Move rule 1 to the bottom: its log lines still jump to it.
    editor.apply("Move rule", (p: Project) => ({
      ...p,
      scenes: p.scenes.map((d) => (d.data.id === "garden" ? { ...d, data: { ...d.data, hotspots: d.data.hotspots.map((h) => (h.id === "door" ? { ...h, rules: [...h.rules.slice(1), h.rules[0]!] } : h)) } } : d)),
    }));
    const matched = formatLog(playtest.events, playtest.run!.project, editor.project).findLast((l) => l.text === "Rule 1 matched")!;
    ws.jumpTo(matched.jump!);
    expect(ws.highlight?.location.path).toEqual(["hotspots", 2, "rules", 2]);
    dispose();
  });
});
