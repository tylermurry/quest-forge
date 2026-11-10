import { describe, expect, it } from "vitest";
import { Session } from "../src/session.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// Verbs, rules, sequences and text through a headless session.

type Over = Parameters<typeof testProject>[0];
const make = (over?: Over) => new Session(testProject(over), testImages);
const run = (s: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.tick(1 / 60);
};
/** Tick until the player stops walking (the approach), plus one tick. */
const arrive = (s: Session) => {
  for (let i = 0; i < 1200 && s.world.walking; i++) s.tick(1 / 60);
  s.tick(1 / 60);
};
const POT: [number, number] = [320, 320];
const ROCK: [number, number] = [230, 220];
const GARDENER: [number, number] = [500, 360];

const potRules = (rules: unknown[]) => ({
  hotspots: [{ id: "pot", name: "flowerpot", shape: [[300, 300], [340, 300], [340, 340], [300, 340]], walkTo: { x: 320, y: 360, facing: "up" }, rules }],
});
const gardenerRules = (rules: unknown[]) => ({ characters: [{ character: "gardener", x: 500, y: 380, facing: "left", visible: true, rules }] });

describe("verbs", () => {
  it("Look runs where the player stands, facing the target", () => {
    const s = make({ yard: potRules([rule({ type: "look" }, [narrate("A clay pot.")])]) });
    s.selectVerb("look");
    s.primaryClick(POT);
    expect(s.text?.text).toBe("A clay pot.");
    expect(s.world.player.pos).toEqual([100, 380]);
    expect(s.world.player.facing).toBe("right");
  });

  it("Hand walks to the walk-to point, faces it, then runs the rule", () => {
    const s = make({ yard: potRules([rule({ type: "hand" }, [narrate("You lift the pot."), { type: "give_item", item: "key" }])]) });
    s.selectVerb("hand");
    s.primaryClick(POT);
    expect(s.text).toBe(null);
    arrive(s);
    expect(s.world.player.pos).toEqual([320, 360]);
    expect(s.world.player.facing).toBe("up");
    expect(s.text?.text).toBe("You lift the pot.");
    s.primaryClick([0, 0]);
    s.tick(1 / 60);
    expect(s.state.inventory).toEqual(["key"]);
  });

  it("a new click cancels the approach before the verb fires", () => {
    const s = make({ yard: potRules([rule({ type: "hand" }, [narrate("Lifted.")])]) });
    s.selectVerb("hand");
    s.primaryClick(POT);
    run(s, 0.2);
    s.selectVerb("walk");
    s.primaryClick([100, 380]);
    run(s, 5);
    expect(s.text).toBe(null);
  });

  it("Talk stands beside a character; with no rule they get the default", () => {
    const s = make();
    s.selectVerb("talk");
    s.primaryClick(GARDENER);
    arrive(s);
    expect(s.world.player.pos[0]).toBeLessThan(480);
    expect(s.world.player.facing).toBe("right");
    expect(s.text?.text).toBe("Nobody answers.");
  });

  it("falls back to the default response for each verb", () => {
    const s = make();
    for (const [verb, reply] of [["look", "Nothing special."], ["hand", "You can't."], ["talk", "Nobody answers."]] as const) {
      s.selectVerb(verb);
      s.primaryClick(ROCK);
      arrive(s);
      expect(s.text?.text).toBe(reply);
      s.skipText();
      run(s, 0.1);
    }
  });

  it("does nothing for verbs on empty ground", () => {
    const s = make();
    s.selectVerb("hand");
    s.primaryClick([100, 250]);
    run(s, 5);
    expect(s.text).toBe(null);
    expect(s.world.player.pos).toEqual([100, 380]);
  });

  it("Walk fires a target's walk rule at its walk-to point, else just walks", () => {
    const s = make({ yard: potRules([rule({ type: "walk" }, [{ type: "set_flag", flag: "open", value: true }])]) });
    s.primaryClick(ROCK);
    run(s, 5);
    expect(s.world.player.pos[0]).toBeCloseTo(230, 6);
    expect(s.text).toBe(null);
    s.primaryClick(POT);
    run(s, 5);
    expect(s.world.player.pos).toEqual([320, 360]);
    expect(s.state.flags.open).toBe(true);
  });

  it("right-click cycles Walk → Look → Hand → Talk → item", () => {
    const s = make();
    const seen = [s.verb];
    for (let i = 0; i < 4; i++) {
      s.secondaryClick();
      seen.push(s.verb);
    }
    expect(seen).toEqual(["walk", "look", "hand", "talk", "walk"]);
    s.state.inventory.push("key");
    s.selectItem("key");
    expect(s.verb).toBe("item");
    s.secondaryClick();
    expect(s.verb).toBe("walk");
    for (let i = 0; i < 4; i++) s.secondaryClick();
    expect(s.verb).toBe("item");
  });
});

describe("items", () => {
  it("uses the current item on a target; others get the default", () => {
    const s = make({ yard: potRules([rule({ type: "use_item", item: "key" }, [narrate("Click.")])]) });
    s.state.inventory.push("key", "stick");
    s.selectItem("stick");
    s.primaryClick(POT);
    arrive(s);
    expect(s.text?.text).toBe("That won't work.");
    s.skipText();
    s.selectItem("key");
    s.primaryClick(POT);
    run(s, 1);
    expect(s.text?.text).toBe("Click.");
  });

  it("combines in either order, with a default when nothing matches", () => {
    const combine = rule({ type: "combine", item: "stick", with: "string" }, [
      { type: "take_item", item: "stick" },
      { type: "take_item", item: "string" },
      { type: "give_item", item: "rod" },
      narrate("You make a fishing rod."),
    ]);
    const s = make({ game: { rules: [combine] } });
    s.state.inventory.push("key", "stick", "string");
    s.combineItems("key", "stick");
    expect(s.text?.text).toBe("They don't fit.");
    s.skipText();
    s.tick(1 / 60);
    s.selectItem("string");
    s.combineItems("string", "stick");
    expect(s.state.inventory).toEqual(["key", "rod"]);
    s.skipText();
    s.tick(1 / 60);
    // The held item was used up, so it's deselected.
    expect(s.item).toBe(null);
    expect(s.verb).toBe("walk");
  });

  it("Look at an item shows its description", () => {
    const s = make();
    s.state.inventory.push("rod");
    s.lookAtItem("rod");
    expect(s.text?.text).toBe("A fishing rod.");
  });
});

describe("rules through the session", () => {
  it("first match, once and first_time, with awards counted once", () => {
    const rules = [
      rule({ type: "hand" }, [narrate("A key!"), { type: "give_item", item: "key" }, { type: "award_points", points: 5, award: "key" }], [], true),
      rule({ type: "hand" }, [narrate("Empty now."), { type: "award_points", points: 5, award: "key" }]),
      rule({ type: "look" }, [narrate("A new pot.")], [{ type: "first_time" }]),
      rule({ type: "look" }, [narrate("The same pot.")]),
    ];
    const s = make({ yard: potRules(rules) });
    s.selectVerb("hand");
    s.primaryClick(POT);
    arrive(s);
    expect(s.text?.text).toBe("A key!");
    s.skipText();
    run(s, 0.1);
    s.primaryClick(POT);
    run(s, 1);
    expect(s.text?.text).toBe("Empty now.");
    s.skipText();
    run(s, 0.1);
    expect(s.state.awards).toEqual({ key: 5 });
    s.selectVerb("look");
    s.primaryClick(POT);
    expect(s.text?.text).toBe("A new pot.");
    s.skipText();
    run(s, 0.1);
    s.primaryClick(POT);
    expect(s.text?.text).toBe("The same pot.");
    expect(s.state.fired).toEqual(rules.map((r) => `yard/hotspot:pot/${r.id}`));
  });

  it("runs the scene_enter rule on start and marks the scene visited", () => {
    const s = make({ yard: { rules: [rule({ type: "scene_enter" }, [narrate("Welcome.")], [{ type: "first_time" }])] } });
    expect(s.text?.text).toBe("Welcome.");
    expect(s.state.visited).toEqual(["yard"]);
  });
});

describe("sequences", () => {
  const sequence = gardenerRules([
    rule({ type: "talk" }, [
      { type: "say", character: "gardener", text: "Let me move that." },
      { type: "walk_player_to", x: 200, y: 380 },
      { type: "wait", seconds: 1 },
      { type: "hide_object", scene: "yard", object: "boulder" },
      narrate("The way is clear."),
    ]),
  ]);

  it("plays say → walk → wait → hide → narrate in order with input locked", () => {
    const s = make({ yard: sequence });
    s.selectVerb("talk");
    s.primaryClick(GARDENER);
    arrive(s);
    expect(s.text?.kind).toBe("say");
    expect(s.text?.speaker?.name).toBe("Gardener");
    expect(s.text?.speaker?.color).toBe("#88cc88");
    expect(s.world.npcs[0]!.kind).toBe("talk");
    expect(s.busy).toBe(true);
    // A click only skips the text.
    s.primaryClick([100, 380]);
    expect(s.text).toBe(null);
    run(s, 0.1);
    expect(s.world.npcs[0]!.kind).toBe("idle");
    expect(s.world.walking).toBe(true);
    // Clicks and verb changes during the walk do nothing.
    s.primaryClick([600, 390]);
    s.secondaryClick();
    expect(s.verb).toBe("talk");
    arrive(s);
    expect(s.world.player.pos).toEqual([200, 380]);
    expect(s.world.isObjectVisible("boulder")).toBe(true);
    run(s, 1);
    expect(s.world.isObjectVisible("boulder")).toBe(false);
    expect(s.state.objects).toEqual({ "yard/boulder": false });
    expect(s.text?.text).toBe("The way is clear.");
    s.skipText();
    run(s, 0.1);
    expect(s.busy).toBe(false);
  });

  it("text closes by itself after its time", () => {
    const s = make({ yard: potRules([rule({ type: "look" }, [narrate("Short."), narrate("Next.")])]) });
    s.selectVerb("look");
    s.primaryClick(POT);
    run(s, 1.9);
    expect(s.text?.text).toBe("Short.");
    run(s, 0.2);
    expect(s.text?.text).toBe("Next.");
  });

  it("die ends the game until Restart, which resets the state", () => {
    const s = make({ yard: potRules([rule({ type: "hand" }, [{ type: "give_item", item: "key" }, { type: "die", message: "A snake bites you." }])]) });
    s.selectVerb("hand");
    s.primaryClick(POT);
    run(s, 5);
    expect(s.ending).toEqual({ kind: "die", message: "A snake bites you." });
    expect(s.busy).toBe(true);
    s.primaryClick([100, 380]);
    run(s, 1);
    expect(s.world.player.pos).toEqual([320, 360]);
    s.restart();
    expect(s.ending).toBe(null);
    expect(s.state.inventory).toEqual([]);
    expect(s.world.player.pos).toEqual([100, 380]);
  });

  it("notes a missing dialogue and an object animation that doesn't exist", () => {
    const s = make({
      yard: potRules([rule({ type: "look" }, [{ type: "start_dialogue", dialogue: "shop" }, { type: "play_animation", target: { kind: "object", scene: "yard", object: "rock" }, animation: "spin" }, narrate("Done.")])]),
    });
    s.selectVerb("look");
    s.primaryClick(POT);
    expect(s.text?.text).toBe("Done.");
    expect(s.log).toHaveLength(2);
  });
});
