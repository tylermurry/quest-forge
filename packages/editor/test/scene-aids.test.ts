import { scaleAt } from "@questforge/engine";
import { describe, expect, it } from "vitest";
import type { Project, SceneFile } from "@questforge/schema";
import { SceneTools } from "../src/model/scene/tools.ts";
import { sceneEditor } from "./support/scene.ts";
import { m1Project } from "./support/fixtures.ts";

const HERO = { hero_sheet: [128, 192] as [number, number], rock_img: [70, 40] as [number, number], boulder_img: [84, 66] as [number, number] };

describe("live aids", () => {
  it("the ghost stands at the hovered point at the depth scale there", async () => {
    const { c, at, dispose } = await sceneEditor(undefined, "garden", HERO);
    const scene = c.scene!;
    for (const y of [260, 390]) {
      c.pointerMove(at([120, y]));
      const ghost = c.frame()!.sprites.find((s) => s.ghost)!;
      expect(ghost.d.baseline).toBeCloseTo(y);
      // Same maths as the engine: frame height × scaleAt(feet y).
      const cell = c.host.images("hero_sheet")!.asset.sheet?.cellHeight ?? 192;
      expect(ghost.d.dest.h).toBeCloseTo(cell * scaleAt(scene.depth, y));
    }
    dispose();
  });

  it("sorts the ghost with the objects by its feet, so it goes behind and in front", async () => {
    const { c, at, dispose } = await sceneEditor(undefined, "garden", HERO);
    const rock = c.scene!.objects.find((o) => o.id === "rock")!; // baseline 296
    const order = () => c.frame()!.sprites.map((s) => (s.ghost ? "ghost" : s.d.id));
    c.pointerMove(at([420, rock.baseline! - 20]));
    expect(order().indexOf("ghost")).toBeLessThan(order().indexOf("rock"));
    c.pointerMove(at([420, rock.baseline! + 20]));
    expect(order().indexOf("ghost")).toBeGreaterThan(order().indexOf("rock"));
    dispose();
  });

  it("previews the path from the default spawn around the hole, and the ghost ends where the walk ends", async () => {
    const { c, at, dispose } = await sceneEditor(undefined, "garden", HERO);
    // The default spawn is at (200, 380); aim straight through the hole at (310, 320).
    c.pointerMove(at([420, 300]));
    const f = c.frame()!;
    expect(f.path![0]).toEqual([200, 380]);
    expect(f.path!.length).toBeGreaterThan(2); // it bends around the hole
    const nav = c.nav(f.scene)!;
    for (let i = 1; i < f.path!.length; i++) expect(nav.clear(f.path![i - 1]!, f.path![i]!)).toBe(true);
    // Clicking inside the hole: the ghost stands at the nearest reachable point, with a crosshair on the cursor.
    c.pointerMove(at([310, 320]));
    const g = c.frame()!;
    const ghost = g.sprites.find((s) => s.ghost)!;
    expect(nav.isWalkable([ghost.d.dest.x + ghost.d.dest.w / 2, ghost.d.baseline])).toBe(true);
    expect(g.crosshair).toEqual([310, 320]);
    dispose();
  });

  it("aids can be turned off, and a player with no animation gets a scaled box", async () => {
    const p: Project = await m1Project();
    const { c, ws, at, dispose } = await sceneEditor(p, "garden", HERO);
    ws.sceneUi.update("garden", (u) => ({ ...u, aids: { ghost: false, shading: true, path: false } }));
    c.pointerMove(at([120, 390]));
    expect(c.frame()!.path).toBeNull();
    expect(c.frame()!.sprites.some((s) => s.ghost)).toBe(false);
    dispose();

    const bare = structuredClone(p);
    const hero = bare.characters.find((x) => x.data.id === bare.game!.data.player)!;
    hero.data.animations = {};
    const second = await sceneEditor(bare, "garden", HERO);
    second.c.pointerMove(second.at([120, 390]));
    const box = second.c.frame()!.ghostBox!;
    const scene = second.c.scene as SceneFile;
    expect(box.h).toBeCloseTo(SceneTools.GHOST_BOX.h * scaleAt(scene.depth, 390));
    second.dispose();
  });

  it("an empty scene has no path but still shows the ghost's scale under the cursor", async () => {
    const { blankProject } = await import("../src/model/template.ts");
    const { createEntry } = await import("../src/model/commands.ts");
    const made = createEntry(blankProject("T"), "scene", "");
    const { c, at, dispose } = await sceneEditor(made.project, made.id);
    c.pointerMove(at([300, 300]));
    const f = c.frame()!;
    expect(f.path).toBeNull();
    expect(f.ghostBox ?? f.sprites.find((s) => s.ghost)).toBeTruthy();
    dispose();
  });
});
