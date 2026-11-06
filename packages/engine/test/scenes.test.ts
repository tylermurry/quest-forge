import { describe, expect, it } from "vitest";
import type { SceneFile } from "@questforge/schema";
import { Session, linkedScenes, type SceneAssets } from "../src/session.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// Multi-scene play (D41, D72, D75): change_scene, scene_enter/exit, regions, visited,
// persistence across scenes, loading and prefetch.

type Over = Parameters<typeof testProject>[0];
const make = (over?: Over, assets?: SceneAssets) => new Session(testProject(over), testImages, {}, assets);
const run = (s: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.tick(1 / 60);
};
const arrive = (s: Session) => {
  for (let i = 0; i < 1200 && s.world.walking; i++) s.tick(1 / 60);
  s.tick(1 / 60);
};

const EXIT = [[580, 260], [640, 260], [640, 340], [580, 340]];
const exitRegion = (actions: Record<string, unknown>[] = [{ type: "change_scene", scene: "shed", spawn: "door" }]) => ({ id: "exit_east", shape: EXIT, rules: [rule({ type: "enter_region" }, actions)] });
const shedBack = { regions: [{ id: "exit_west", shape: [[0, 300], [30, 300], [30, 400], [0, 400]], rules: [rule({ type: "enter_region" }, [{ type: "change_scene", scene: "yard", spawn: "from_shed" }])] }] };

describe("walk-into regions and scene changes", () => {
  it("walking into an exit runs yard's exit rule, then enters the shed at its spawn", () => {
    const s = make({
      yard: { regions: [exitRegion()], rules: [rule({ type: "scene_exit" }, [narrate("You leave the yard.")])] },
      shed: { rules: [rule({ type: "scene_enter" }, [narrate("A dusty shed.")], [{ type: "first_time" }])] },
    });
    s.primaryClick([620, 300]);
    for (let i = 0; i < 1200 && s.scene.id === "yard" && !s.text; i++) s.tick(1 / 60);
    // Stopped at the region edge, showing the exit text in the old scene.
    expect(s.scene.id).toBe("yard");
    expect(s.text?.text).toBe("You leave the yard.");
    expect(s.world.walking).toBe(false);
    expect(s.busy).toBe(true);
    s.skipText();
    s.tick(1 / 60);
    expect(s.scene.id).toBe("shed");
    expect(s.state.scene).toBe("shed");
    expect(s.world.player.pos).toEqual([50, 380]);
    expect(s.world.player.facing).toBe("right");
    expect(s.state.visited).toEqual(["yard", "shed"]);
    expect(s.text?.text).toBe("A dusty shed.");
  });

  it("doesn't fire for a region the player spawns in; fires after leaving and re-entering", () => {
    const s = make({ yard: { regions: [exitRegion([{ type: "add_to_counter", counter: "n", amount: 1 }])] }, shed: shedBack });
    // Go to the shed and come back: from_shed spawns inside exit_east.
    s.state.counters.n = 0;
    s.changeScene("shed", "door");
    expect(s.scene.id).toBe("shed");
    s.primaryClick([10, 380]);
    arrive(s);
    expect(s.scene.id).toBe("yard");
    expect(s.world.player.pos).toEqual([600, 300]);
    run(s, 0.5);
    expect(s.state.counters.n).toBe(0);
    s.primaryClick([500, 300]);
    arrive(s);
    s.primaryClick([620, 300]);
    arrive(s);
    expect(s.state.counters.n).toBe(1);
  });

  it("doesn't fire regions on a walk inside a sequence", () => {
    const s = make({
      yard: {
        regions: [exitRegion([narrate("Region!")])],
        hotspots: [{ id: "pot", name: "pot", shape: [[300, 300], [340, 300], [340, 340], [300, 340]], rules: [rule({ type: "look" }, [{ type: "walk_player_to", x: 620, y: 300 }])] }],
      },
    });
    s.selectVerb("look");
    s.primaryClick([320, 320]);
    run(s, 8);
    expect(s.world.player.pos[0]).toBeCloseTo(620, 6);
    expect(s.text).toBe(null);
  });

  it("drops actions after change_scene and ignores change_scene in an exit rule", () => {
    const s = make({
      yard: {
        regions: [exitRegion([{ type: "change_scene", scene: "shed", spawn: "door" }, { type: "give_item", item: "key" }])],
        rules: [rule({ type: "scene_exit" }, [{ type: "change_scene", scene: "yard", spawn: "default" }])],
      },
    });
    s.primaryClick([620, 300]);
    run(s, 8);
    expect(s.scene.id).toBe("shed");
    expect(s.state.inventory).toEqual([]);
    expect(s.log.some((l) => l.startsWith("Ignored a scene change"))).toBe(true);
  });

  it("keeps hidden objects hidden after leaving and returning", () => {
    const s = make();
    s.setObjectVisible("yard", "boulder", false);
    s.changeScene("shed", "door");
    s.changeScene("yard", "default");
    expect(s.world.isObjectVisible("boulder")).toBe(false);
    expect(s.world.isObjectVisible("rock")).toBe(true);
  });

  it("places a character moved into another scene when that scene is entered", () => {
    const s = make();
    s.setCharacterPosition("gardener", "shed", { x: 300, y: 350, facing: "down" });
    s.changeScene("shed", "door");
    expect(s.world.actorById("gardener")?.pos).toEqual([300, 350]);
    // Still in the yard too: placements are per scene (D81).
    s.changeScene("yard", "default");
    expect(s.world.actorById("gardener")?.pos).toEqual([500, 380]);
  });

  it("waits for the next scene's images, and prefetches linked scenes on entry (D75)", () => {
    const loaded = new Set(["yard"]);
    const fetched: string[] = [];
    const assets: SceneAssets = { ready: (sc: SceneFile) => loaded.has(sc.id), prefetch: (sc) => fetched.push(sc.id) };
    const s = make({ yard: { regions: [exitRegion()] } }, assets);
    expect(fetched).toEqual(["shed"]);
    s.changeScene("shed", "door");
    expect(s.loading?.id).toBe("shed");
    expect(s.scene.id).toBe("yard");
    expect(s.busy).toBe(true);
    s.tick(1 / 60);
    expect(s.scene.id).toBe("yard");
    loaded.add("shed");
    s.tick(1 / 60);
    expect(s.loading).toBe(null);
    expect(s.scene.id).toBe("shed");
    expect(s.busy).toBe(false);
  });

  it("lists the scenes a scene's rules link to", () => {
    const p = testProject({ yard: { regions: [exitRegion()], rules: [rule({ type: "scene_enter" }, [{ type: "change_scene", scene: "yard", spawn: "default" }])] } });
    expect(linkedScenes(p.scenes[0]!.data)).toEqual(["shed"]);
  });

  it("the state after multi-scene play survives JSON deep-equal (spec 07)", () => {
    const s = make({ yard: { regions: [exitRegion()] } });
    s.primaryClick([620, 300]);
    run(s, 8);
    expect(s.scene.id).toBe("shed");
    expect(JSON.parse(JSON.stringify(s.state))).toEqual(s.state);
  });
});
