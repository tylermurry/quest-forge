import { describe, expect, it } from "vitest";
import { AssetsFile, type Project } from "@questforge/schema";
import { AudioSync, gainFor, sceneAudioIds, type AudioBackend } from "../src/audio.ts";
import { MemoryStore, SLOT_COUNT, SaveSlots, readSettings, savesKey, settingsKey, writeSettings } from "../src/saves.ts";
import { Session } from "../src/session.ts";
import type { Rect } from "../src/sprite.ts";
import { PlayerUi } from "../src/ui/controller.ts";
import { fitViewport } from "../src/viewport.ts";
import type { Vec } from "../src/vec.ts";
import { narrate, rule, testImages, testProject } from "./support/project.ts";

// Spec 07 (M8): save / load, death with Restore · Restart · Try again, scene music.

const center = (r: Rect): Vec => [r.x + r.w / 2, r.y + r.h / 2];
const tap = (ui: PlayerUi, p: Vec) => {
  ui.pointerDown(p, "touch");
  ui.tick(1 / 60);
  ui.pointerUp(p, "touch");
};
const run = (s: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.tick(1 / 60);
};
/** Ticks until the session is idle (walks, text boxes and scene changes done). */
const settle = (s: Session) => {
  for (let i = 0; i < 60 * 60 && (s.busy || s.world.walking); i++) s.tick(1 / 60);
  s.tick(1 / 60);
};
const withAudio = (p: Project, ids: string[]) => {
  p.assets = { path: "assets.yaml", data: AssetsFile.parse({ schemaVersion: 2, images: [], audio: ids.map((id) => ({ id, path: `assets/audio/${id}.wav` })) }) };
  return p;
};
const button = <Id extends string>(list: { id: Id; rect: Rect }[], id: Id) => center(list.find((b) => b.id === id)!.rect);

const POT: Vec = [320, 320];

/** Yard with music; walking into the shed region; the shed has a hand-to-die trap and its own music. */
function adventure(): Project {
  const exit = { id: "exit", shape: [[600, 250], [640, 250], [640, 400], [600, 400]], rules: [rule({ type: "enter_region" }, [{ type: "change_scene", scene: "shed", spawn: "door" }])] };
  return withAudio(
    testProject({
      yard: {
        music: "yard_theme",
        regions: [exit],
        hotspots: [
          {
            id: "pot",
            name: "flowerpot",
            shape: [[300, 300], [340, 300], [340, 340], [300, 340]],
            walkTo: { x: 320, y: 360, facing: "up" },
            rules: [rule({ type: "hand" }, [{ type: "give_item", item: "key" }, { type: "award_points", points: 5, award: "key" }, { type: "play_sound", sound: "ding" }, narrate("A key!")], [], true)],
          },
        ],
      },
      shed: {
        music: "shed_theme",
        hotspots: [{ id: "saw", name: "saw", shape: [[300, 300], [340, 300], [340, 340], [300, 340]], walkTo: { x: 320, y: 360, facing: "up" }, rules: [rule({ type: "hand" }, [{ type: "give_item", item: "stick" }, { type: "die", message: "Ouch." }])] }],
        rules: [rule({ type: "scene_enter" }, [{ type: "set_flag", flag: "open", value: true }, { type: "add_to_counter", counter: "n", amount: 1 }])],
      },
    }),
    ["yard_theme", "shed_theme", "ding"],
  );
}

function play(project: Project, store = new MemoryStore()) {
  const s = new Session(project, testImages);
  const ui = new PlayerUi(s, { slots: new SaveSlots(store, s.game), settings: readSettings(store, s.game.id) });
  ui.setScale(fitViewport(844, 390).scale);
  return { s, ui, store };
}

/** Takes the key in the yard, then walks into the shed. */
function toShed(s: Session) {
  s.selectVerb("hand");
  s.primaryClick(POT);
  settle(s);
  s.selectVerb("walk");
  s.primaryClick([630, 380]);
  settle(s);
  expect(s.scene.id).toBe("shed");
}

describe("save slots (spec 07, D146)", () => {
  it("has 10 empty slots; saves survive a new SaveSlots on the same storage", () => {
    const store = new MemoryStore();
    const game = { id: "t", version: 1 };
    const a = new SaveSlots(store, game);
    expect(a.list).toHaveLength(SLOT_COUNT);
    expect(a.any).toBe(false);
    const { s } = play(testProject());
    expect(a.save(3, "Yard", s.state, 1000)).toBe(true);
    const b = new SaveSlots(store, { id: "t", version: 2 });
    expect(b.get(3)).toEqual({ name: "Yard", savedAt: 1000, version: 1, state: s.state });
    expect(b.get(3)!.state).not.toBe(a.list[3]!.state);
    // Another game's slots are separate.
    expect(new SaveSlots(store, { id: "other", version: 1 }).any).toBe(false);
    expect([...store.data.keys()]).toEqual([savesKey("t")]);
  });

  it("broken storage reads as empty slots, and a failed write says why", () => {
    const store = new MemoryStore();
    store.setItem(savesKey("t"), "{not json");
    expect(new SaveSlots(store, { id: "t", version: 1 }).any).toBe(false);
    store.setItem(savesKey("t"), JSON.stringify({ slots: [null, { name: "x", state: { nope: 1 } }, { name: "ok", savedAt: 5, version: 1, state: { scene: "yard" } }] }));
    const slots = new SaveSlots(store, { id: "t", version: 1 });
    expect(slots.list.map((x) => x?.name ?? null).slice(0, 3)).toEqual([null, null, "ok"]);
    expect(slots.get(2)!.state.inventory).toEqual([]);
    const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
    const failing = new SaveSlots(full, { id: "t", version: 1 });
    expect(failing.save(0, "x", slots.get(2)!.state)).toBe(false);
    expect(failing.error).toMatch(/couldn't be saved/);
    expect(failing.any).toBe(false);
    expect(new SaveSlots(null, { id: "t", version: 1 }).save(0, "x", slots.get(2)!.state)).toBe(false);
  });
});

describe("save and load (spec 07 acceptance)", () => {
  it("save in a later scene, reload the page, load: identical state", () => {
    const { s, ui, store } = play(adventure());
    toShed(s);
    s.world.walkTo([200, 380]);
    settle(s);
    ui.openSlots("save");
    expect(ui.slot).toBe(0);
    tap(ui, button(ui.layout.slots.buttons, "act"));
    expect(ui.panel).toBe(null);
    expect(ui.notice?.text).toBe("Game saved in slot 1.");
    const saved = structuredClone(s.state);
    expect(ui.slots.list[0]!.name).toBe("Shed · Score 5 of 20");

    // A fresh page: new session from the start, same storage.
    const again = play(adventure(), store);
    expect(again.s.scene.id).toBe("yard");
    again.ui.openSlots("load");
    expect(again.ui.slot).toBe(0);
    tap(again.ui, button(again.ui.layout.slots.buttons, "act"));
    expect(again.ui.panel).toBe(null);
    expect(again.s.scene.id).toBe("shed");
    expect(again.s.state).toEqual(saved);
    // The scene's enter rule didn't run again (the counter would be 2).
    again.s.tick(1 / 60);
    expect(again.s.state).toEqual(saved);
    expect(again.s.busy).toBe(false);
    expect(again.s.world.player.pos).toEqual([saved.player.x, saved.player.y]);
  });

  it("a save from an older version drops IDs that are gone, tells the player, and never crashes", () => {
    const { s, ui, store } = play(adventure());
    toShed(s);
    ui.saveTo(4);
    const newer = adventure();
    newer.items = newer.items.filter((i) => i.data.id !== "key");
    newer.game!.data = { ...newer.game!.data, version: 2 };
    const again = play(newer, store);
    expect(again.ui.slots.list[4]!.version).toBe(1);
    const { dropped } = again.s.load(again.ui.slots.get(4)!.state);
    expect(dropped).toEqual(["item key"]);
    expect(again.s.state.inventory).toEqual([]);
    expect(again.s.text?.text).toMatch(/older version/);
    expect(again.s.log.at(-1)).toMatch(/without item key/);
  });

  it("a save of a scene that no longer exists starts at the game's start", () => {
    const { s } = play(adventure());
    const state = structuredClone(s.state);
    state.scene = "attic";
    const { dropped } = s.load(state);
    expect(dropped[0]).toMatch(/^scene attic/);
    expect(s.scene.id).toBe("yard");
  });

  it("the load list starts on the newest save and only picks filled slots", () => {
    const { s, ui } = play(adventure());
    ui.slots.save(2, "old", s.state, 100);
    ui.slots.save(7, "new", s.state, 200);
    ui.openSlots("load");
    expect(ui.slot).toBe(7);
    expect(ui.slotPage).toBe(Math.floor(7 / ui.layout.slots.perPage));
    ui.slotPage = 0;
    tap(ui, center(ui.layout.slots.rows[0]!));
    expect(ui.slot).toBe(7);
    tap(ui, center(ui.layout.slots.rows[2]!));
    expect(ui.slot).toBe(2);
    ui.openSlots("save");
    expect(ui.slot).toBe(0);
  });
});

describe("death (spec 07)", () => {
  it("Try again returns to the scene-entry state and re-runs the scene's enter rule", () => {
    const { s, ui } = play(adventure());
    toShed(s);
    const entry = s.entry.state;
    const after = structuredClone(s.state);
    s.selectVerb("hand");
    s.primaryClick(POT);
    settle(s);
    expect(s.ending).toEqual({ kind: "die", message: "Ouch." });
    expect(s.state.inventory).toContain("stick");
    // Restore is off with no saves; Try again works.
    tap(ui, button(ui.layout.ending.buttons, "restore"));
    expect(ui.panel).toBe(null);
    tap(ui, button(ui.layout.ending.buttons, "try_again"));
    expect(s.ending).toBe(null);
    expect(s.scene.id).toBe("shed");
    expect(s.entry.state).toEqual(entry);
    // Entry snapshot + the enter rule = the state the player had on arrival.
    expect({ ...s.state, player: after.player }).toEqual(after);
    expect(s.state.inventory).not.toContain("stick");
  });

  it("Restore opens the load list over the death box; Cancel goes back, Load ends the death", () => {
    const { s, ui } = play(adventure());
    toShed(s);
    ui.saveTo(0);
    s.selectVerb("hand");
    s.primaryClick(POT);
    settle(s);
    tap(ui, button(ui.layout.ending.buttons, "restore"));
    expect(ui.panel).toBe("load");
    tap(ui, button(ui.layout.slots.buttons, "cancel"));
    expect(ui.panel).toBe(null);
    expect(s.ending?.kind).toBe("die");
    tap(ui, button(ui.layout.ending.buttons, "restore"));
    tap(ui, button(ui.layout.slots.buttons, "act"));
    expect(s.ending).toBe(null);
    expect(s.state.inventory).toEqual(["key"]);
  });

  it("Try again after a load returns to the loaded state without the enter rule", () => {
    const { s, ui } = play(adventure());
    toShed(s);
    ui.saveTo(0);
    const saved = structuredClone(s.state);
    ui.loadFrom(0);
    s.selectVerb("hand");
    s.primaryClick(POT);
    settle(s);
    s.tryAgain();
    expect(s.state).toEqual(saved);
  });
});

describe("volume (D150)", () => {
  it("− and + step 0–10, are stored per game, and reach the audio", () => {
    const store = new MemoryStore();
    const seen: number[] = [];
    const s = new Session(testProject(), testImages);
    const ui = new PlayerUi(s, {
      slots: new SaveSlots(store, s.game),
      settings: readSettings(store, "t"),
      onSettings: (next) => {
        seen.push(next.music);
        writeSettings(store, "t", next);
      },
    });
    ui.panel = "volume";
    const up = button(ui.layout.volume.buttons, "music_up");
    for (let i = 0; i < 5; i++) tap(ui, up);
    expect(ui.settings.music).toBe(10);
    expect(seen).toEqual([8, 9, 10]);
    tap(ui, button(ui.layout.volume.buttons, "sfx_down"));
    expect(readSettings(store, "t")).toEqual({ music: 10, sfx: 7 });
    tap(ui, button(ui.layout.volume.buttons, "ok"));
    expect(ui.panel).toBe("settings");
    store.setItem(settingsKey("t"), JSON.stringify({ music: 99, sfx: "loud" }));
    expect(readSettings(store, "t")).toEqual({ music: 10, sfx: 8 });
    expect(gainFor(0)).toBe(0);
    expect(gainFor(10)).toBe(1);
  });
});

describe("audio (spec 07, D148)", () => {
  class FakeAudio implements AudioBackend {
    calls: string[] = [];
    prefetch() {}
    music(id: string | null) {
      this.calls.push(`music:${id}`);
    }
    sound(id: string) {
      this.calls.push(`sound:${id}`);
    }
    volumes(m: number, x: number) {
      this.calls.push(`vol:${m}/${x}`);
    }
  }

  it("scene music starts on entry, carries on for the same track, and a scene without music keeps it", () => {
    const p = adventure();
    p.scenes[1]!.data = { ...p.scenes[1]!.data, music: "yard_theme" };
    const { s } = play(p);
    const fake = new FakeAudio();
    const sync = new AudioSync(fake);
    sync.update(s);
    expect(s.state.music).toBe("yard_theme");
    toShed(s);
    sync.update(s);
    // Same track in the shed: no restart, and the key's sound played once.
    expect(fake.calls).toEqual(["music:yard_theme", "sound:ding"]);
    sync.update(s);
    expect(fake.calls).toHaveLength(2);

    const q = adventure();
    const { music: _, ...noMusic } = q.scenes[1]!.data;
    q.scenes[1]!.data = noMusic;
    const t = play(q).s;
    toShed(t);
    expect(t.state.music).toBe("yard_theme");
  });

  it("play_music / stop_music switch the track; a load restores it", () => {
    const p = adventure();
    p.scenes[0]!.data.hotspots[0]!.rules = [rule({ type: "hand" }, [{ type: "stop_music" }])] as never;
    const { s, ui } = play(p);
    const fake = new FakeAudio();
    const sync = new AudioSync(fake);
    sync.update(s);
    ui.saveTo(0);
    s.selectVerb("hand");
    s.primaryClick(POT);
    settle(s);
    sync.update(s);
    expect(s.state.music).toBe(null);
    ui.loadFrom(0);
    sync.update(s);
    expect(fake.calls).toEqual(["music:yard_theme", "music:null", "music:yard_theme"]);
    sync.setVolumes({ music: 5, sfx: 10 });
    expect(fake.calls.at(-1)).toBe("vol:0.25/1");
  });

  it("a scene's audio for prefetch: its music and every sound its rules play", () => {
    const p = adventure();
    expect(sceneAudioIds(p.scenes[0]!.data)).toEqual(["yard_theme", "ding"]);
    expect(sceneAudioIds(p.scenes[1]!.data)).toEqual(["shed_theme"]);
  });

  it("queued sounds are capped when nobody plays them (headless)", () => {
    const p = adventure();
    p.scenes[0]!.data.hotspots[0]!.rules = [rule({ type: "hand" }, Array.from({ length: 20 }, () => ({ type: "play_sound", sound: "ding" })))] as never;
    const { s } = play(p);
    s.selectVerb("hand");
    s.primaryClick(POT);
    run(s, 10);
    expect(s.sounds.length).toBeLessThanOrEqual(8);
  });
});
