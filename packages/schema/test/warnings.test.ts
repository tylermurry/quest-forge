import { describe, expect, it } from "vitest";
import { formatProblem, hasBlockingErrors, loadProject, validateProject, type Problem, type Project } from "../src/index.ts";
import { NodeFs } from "../src/node.ts";
import { FIXTURE } from "./helpers.ts";

// Spec 14 warnings (D122) and the empty-text error (D119), each from an edit to the
// mini fixture, which itself has no problems.

const fixture = async () => (await loadProject(new NodeFs(FIXTURE))).project;
async function problemsAfter(edit: (p: Project) => void): Promise<Problem[]> {
  const project = structuredClone(await fixture());
  edit(project);
  return validateProject(project);
}
const scene = (p: Project, id: string) => p.scenes.find((s) => s.data.id === id)!.data;
const summary = (ps: Problem[]) => ps.map((p) => ({ severity: p.severity, code: p.code, file: p.location.file, path: p.location.path.join("."), text: formatProblem(p) }));
const BEACH = "scenes/outdoors/beach.scene.yaml";

describe("spec 14 warnings", () => {
  it("scene unreachable from the start scene", async () => {
    const problems = await problemsAfter((p) => {
      // The path's exit is the only way into the shop.
      for (const r of scene(p, "path").regions) r.rules = r.rules.filter((x) => !x.do.some((a) => a.type === "change_scene" && a.scene === "shop"));
    });
    expect(summary(problems)).toEqual([
      { severity: "warning", code: "scene_unreachable", file: "scenes/shop.scene.yaml", path: "", text: "The Shop: can't be reached: no Change scene leads here from the start scene." },
    ]);
    expect(hasBlockingErrors(problems)).toBe(false);
  });

  it("a game-level change_scene counts from anywhere", async () => {
    const problems = await problemsAfter((p) => {
      for (const r of scene(p, "path").regions) r.rules = r.rules.filter((x) => !x.do.some((a) => a.type === "change_scene" && a.scene === "shop"));
      p.game!.data.rules[0]!.do.push({ type: "change_scene", scene: "shop", spawn: "door" });
    });
    expect(problems.filter((x) => x.code === "scene_unreachable")).toEqual([]);
  });

  it("scene with no background", async () => {
    const problems = await problemsAfter((p) => {
      delete scene(p, "beach").background;
    });
    expect(summary(problems)).toEqual([
      { severity: "warning", code: "scene_no_background", file: BEACH, path: "background", text: "Sunny Beach: has no background image, so it shows black." },
    ]);
  });

  it("item never given", async () => {
    const problems = await problemsAfter((p) => {
      const path = scene(p, "path");
      for (const t of [...path.objects, ...path.characters, ...path.hotspots]) for (const r of t.rules) r.do = r.do.filter((a) => a.type !== "give_item");
    });
    expect(summary(problems)).toEqual([
      { severity: "warning", code: "item_never_given", file: "items/light/matches.item.yaml", path: "", text: 'Item "matches": is never given to the player: no rule or dialogue gives it.' },
    ]);
  });

  it("a flag never read, never set, or not used at all", async () => {
    const never = (p: Project, keep: (t: string) => boolean) => {
      for (const s of p.scenes) {
        const lists = [s.data.rules, ...s.data.objects.map((o) => o.rules), ...s.data.characters.map((c) => c.rules), ...s.data.hotspots.map((h) => h.rules), ...s.data.regions.map((r) => r.rules)];
        for (const rules of lists) for (const r of rules) {
          r.if = r.if.filter((c) => keep(c.type));
          r.do = r.do.filter((a) => keep(a.type));
        }
      }
    };
    const unread = await problemsAfter((p) => never(p, (t) => t !== "flag_is"));
    expect(summary(unread)).toEqual([
      { severity: "warning", code: "flag_never_read", file: "flags.yaml", path: "flags.0", text: 'Flags › Flag "talked_to_villager": is changed but never checked: no condition uses this flag.' },
    ]);
    const unset = await problemsAfter((p) => never(p, (t) => t !== "add_to_counter"));
    expect(summary(unset)).toEqual([
      { severity: "warning", code: "flag_never_set", file: "flags.yaml", path: "flags.1", text: 'Flags › Flag "shop_visits": is checked but never changed, so it stays 0: no rule uses Add to counter on it.' },
    ]);
    const unused = await problemsAfter((p) => p.flags!.data.flags.push({ id: "spare", type: "bool", initial: true }));
    expect(summary(unused)).toEqual([
      { severity: "warning", code: "flag_unused", file: "flags.yaml", path: "flags.2", text: 'Flags › Flag "spare": isn\'t used anywhere: no rule checks or changes this flag.' },
    ]);
  });

  it("dialogue node unreachable", async () => {
    const problems = await problemsAfter((p) => {
      const menu = p.dialogues[0]!.data.nodes.find((n) => n.id === "menu")!;
      if (menu.type === "choices") menu.options = menu.options.filter((o) => o.id !== "buy");
    });
    expect(summary(problems)).toEqual([
      { severity: "warning", code: "dialogue_node_unreachable", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.4", text: 'Dialogue "Shopkeeper" › Node "sell": can\'t be reached from the Start node.' },
      { severity: "warning", code: "dialogue_node_unreachable", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.5", text: 'Dialogue "Shopkeeper" › Node "thanks": can\'t be reached from the Start node.' },
    ]);
  });

  it("dialogue: a Choices node with no options, and ports that lead nowhere (D140)", async () => {
    const problems = await problemsAfter((p) => {
      const nodes = p.dialogues[0]!.data.nodes;
      const menu = nodes.find((n) => n.id === "menu")!;
      if (menu.type === "choices") menu.options[2]!.next = null;
      const thanks = nodes.find((n) => n.id === "thanks")!;
      if (thanks.type === "line") thanks.next = null;
      nodes.push({ id: "empty", type: "choices", pos: [0, 500], options: [] });
      if (thanks.type === "line") thanks.next = "empty";
    });
    expect(summary(problems)).toEqual([
      {
        severity: "warning",
        code: "dialogue_dead_end",
        file: "dialogues/shopkeeper_chat.dialogue.yaml",
        path: "nodes.2.options.2.next",
        text: 'Dialogue "Shopkeeper" › Node "menu" › Choice "bye": This option isn\'t connected, so the dialogue ends there. Connect it, or to end on purpose, connect it to an End node.',
      },
      { severity: "warning", code: "dialogue_node_unreachable", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.6", text: 'Dialogue "Shopkeeper" › Node "done": can\'t be reached from the Start node.' },
      { severity: "warning", code: "dialogue_no_options", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.7.options", text: 'Dialogue "Shopkeeper" › Node "empty": has no options, so the dialogue ends when it gets here.' },
    ]);
  });

  it("dialogue: a loop with no Line or Choices (D140)", async () => {
    const problems = await problemsAfter((p) => {
      const nodes = p.dialogues[0]!.data.nodes;
      const sell = nodes.find((n) => n.id === "sell")!;
      nodes.push({ id: "again", type: "branch", pos: [0, 500], if: [{ type: "has_item", item: "coin" }], then: "sell", else: "thanks" });
      if (sell.type === "actions") sell.next = "again";
    });
    expect(summary(problems)).toEqual([
      {
        severity: "warning",
        code: "dialogue_silent_loop",
        file: "dialogues/shopkeeper_chat.dialogue.yaml",
        path: "nodes.4",
        text: 'Dialogue "Shopkeeper" › Node "sell": is in a loop with no Line or Choices (Actions sell, Branch again), so it would repeat forever without the player. The game stops the dialogue there.',
      },
    ]);
  });

  it("dialogue: empty line and option text are errors (D138)", async () => {
    const problems = await problemsAfter((p) => {
      const nodes = p.dialogues[0]!.data.nodes;
      const hello = nodes.find((n) => n.id === "hello")!;
      if (hello.type === "line") hello.text = "";
      const menu = nodes.find((n) => n.id === "menu")!;
      if (menu.type === "choices") menu.options[0]!.text = "";
    });
    expect(summary(problems)).toEqual([
      { severity: "error", code: "empty_text", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.1.text", text: 'Dialogue "Shopkeeper" › Node "hello": says nothing. Type the line.' },
      { severity: "error", code: "empty_text", file: "dialogues/shopkeeper_chat.dialogue.yaml", path: "nodes.2.options.0.text", text: 'Dialogue "Shopkeeper" › Node "menu" › Choice "ask_cave": is an option with no text. Type what the player can say.' },
    ]);
  });

  it("hotspot with no rules", async () => {
    const problems = await problemsAfter((p) => {
      scene(p, "beach").hotspots[0]!.rules = [];
      // Keep the coin and its award given elsewhere so only this warning shows.
      p.game!.data.rules[0]!.do.push({ type: "give_item", item: "coin" }, { type: "award_points", points: 2, award: "found_coin" });
    });
    expect(summary(problems)).toEqual([
      { severity: "warning", code: "hotspot_no_rules", file: BEACH, path: "hotspots.0.rules", text: 'Sunny Beach › Hotspot "shell": has no rules, so clicking it only gives the default responses.' },
    ]);
  });

  it("award total ≠ max score, counting each award ID once", async () => {
    const off = await problemsAfter((p) => {
      p.game!.data.maxScore = 10;
    });
    expect(summary(off)).toEqual([
      { severity: "warning", code: "award_total_mismatch", file: "game.yaml", path: "maxScore", text: "Game settings: The max score is 10, but the awards add up to 7 (3 awards)." },
    ]);
    // Giving the same award again doesn't change the total.
    const again = await problemsAfter((p) => {
      p.game!.data.rules[0]!.do.push({ type: "award_points", points: 3, award: "lit_lantern" });
    });
    expect(again).toEqual([]);
  });

  it("one award ID with different points", async () => {
    const problems = await problemsAfter((p) => {
      p.game!.data.rules[0]!.do.push({ type: "award_points", points: 5, award: "found_coin" });
      p.game!.data.maxScore = 10;
    });
    expect(summary(problems)).toEqual([
      {
        severity: "warning",
        code: "award_points_inconsistent",
        file: BEACH,
        path: "hotspots.0.rules.0.do.3.points",
        text: 'Sunny Beach › Hotspot "shell" › Rule 1 › Action 4: gives 2 points for award found_coin, but another rule gives 5 for it. An award counts once, so give it the same points everywhere.',
      },
    ]);
  });
});

describe("empty rule text (D119)", () => {
  it("is an error that blocks playtest, for narrate, say and die", async () => {
    const problems = await problemsAfter((p) => {
      const shell = scene(p, "beach").hotspots[0]!.rules[0]!;
      shell.do.push({ type: "narrate", text: "" }, { type: "say", character: "hero", text: "" });
      const sell = p.dialogues[0]!.data.nodes.find((n) => n.id === "sell");
      if (sell?.type === "actions") sell.do.push({ type: "die", message: "" });
    });
    expect(summary(problems)).toEqual([
      { severity: "error", code: "empty_text", file: BEACH, path: "hotspots.0.rules.0.do.4.text", text: 'Sunny Beach › Hotspot "shell" › Rule 1 › Action 5: narrates nothing. Type what the narrator says.' },
      { severity: "error", code: "empty_text", file: BEACH, path: "hotspots.0.rules.0.do.5.text", text: 'Sunny Beach › Hotspot "shell" › Rule 1 › Action 6: has Hero say nothing. Type the line.' },
      {
        severity: "error",
        code: "empty_text",
        file: "dialogues/shopkeeper_chat.dialogue.yaml",
        path: "nodes.4.do.2.message",
        text: 'Dialogue "Shopkeeper" › Node "sell" › Action 3: ends the game with no message. Type what the player is told.',
      },
    ]);
    expect(hasBlockingErrors(problems)).toBe(true);
  });
});
