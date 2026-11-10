import { describe, expect, it } from "vitest";
import { validateProject, type Project } from "@questforge/schema";
import { deleteEntry } from "../src/model/commands.ts";
import { locate } from "../src/model/locate.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { m1Project } from "./support/fixtures.ts";

const garden = (p: Project) => p.scenes.find((s) => s.data.id === "garden")!;

describe("jump-to", () => {
  it("maps each problem of a deleted item to the exact thing whose rule uses it", async () => {
    const p = deleteEntry(await m1Project(), "item", "stick");
    const jumps = validateProject(p)
      .filter((x) => x.code === "missing_reference")
      .map((x) => locate(p, x.location));
    expect(jumps.map((j) => j!.target)).toEqual([
      { kind: "game" },
      { kind: "game" },
      expect.objectContaining({ kind: "sceneThing", scene: "garden" }),
    ]);
    // The location keeps the rule part, so the inspector can flash it.
    expect(jumps[2]!.location.path).toEqual(expect.arrayContaining(["rules"]));
  });

  it("maps scene things, scene rules, the game, flags, images and dialogue nodes", async () => {
    const p = await m1Project();
    const file = garden(p).path;
    const pond = garden(p).data.hotspots.findIndex((h) => h.id === "pond");
    expect(locate(p, { file, path: ["hotspots", pond, "rules", 0, "do", 0, "text"] })!.target).toEqual({ kind: "sceneThing", scene: "garden", list: "hotspots", key: "pond" });
    expect(locate(p, { file, path: ["characters", 0, "rules"] })!.target).toEqual({ kind: "sceneThing", scene: "garden", list: "characters", key: "gardener" });
    expect(locate(p, { file, path: ["rules", 0, "if", 0] })!.target).toEqual({ kind: "scene", scene: "garden" });
    expect(locate(p, { file, path: [] })!.target).toEqual({ kind: "scene", scene: "garden" });
    expect(locate(p, { file, path: ["background"] })!.target).toEqual({ kind: "sceneThing", scene: "garden", list: "background", key: "background" });
    expect(locate(p, { file: "game.yaml", path: ["maxScore"] })!.target).toEqual({ kind: "game" });
    expect(locate(p, { file: "flags.yaml", path: ["flags", 0, "id"] })!.target).toEqual({ kind: "entry", entry: { section: "flag", id: p.flags!.data.flags[0]!.id } });
    expect(locate(p, { file: "assets.yaml", path: ["images", 0, "path"] })!.target).toEqual({ kind: "entry", entry: { section: "image", id: "garden_bg" } });
    expect(locate(p, { file: "items/stick.item.yaml", path: [] })!.target).toEqual({ kind: "entry", entry: { section: "item", id: "stick" } });
    expect(locate(p, { file: "nope.yaml", path: [] })).toBeNull();

    const withDialogue: Project = {
      ...p,
      dialogues: [{ path: "dialogues/chat.dialogue.yaml", data: { schemaVersion: 2, id: "chat", name: "Chat", nodes: [{ id: "start", type: "start", pos: [0, 0], next: null }] } }],
    };
    expect(locate(withDialogue, { file: "dialogues/chat.dialogue.yaml", path: ["nodes", 0] })!.target).toEqual({ kind: "dialogueNode", dialogue: "chat", node: "start" });
  });

  it("the workspace opens the tab, selects the thing, activates its layer and highlights the spot", async () => {
    const p = await m1Project();
    const ws = new WorkspaceState();
    const location = { file: garden(p).path, path: ["hotspots", 0, "rules", 0, "do", 0] };
    ws.jumpTo(locate(p, location)!);
    expect(ws.active).toBe("scene:garden");
    expect(ws.selection).toEqual({ kind: "sceneThing", scene: "garden", list: "hotspots", key: garden(p).data.hotspots[0]!.id });
    expect(ws.sceneUi.get("garden").layer).toBe("hotspots");
    expect(ws.highlight?.location).toEqual(location);
    const seq = ws.highlight!.seq;
    ws.jumpTo(locate(p, { file: "game.yaml", path: ["rules", 0] })!);
    expect(ws.selection).toEqual({ kind: "game" });
    expect(ws.highlight!.seq).toBe(seq + 1);
    ws.clearHighlight();
    expect(ws.highlight).toBeNull();
    ws.jumpTo(locate(p, { file: "flags.yaml", path: ["flags", 0] })!);
    expect(ws.selection).toEqual({ kind: "entry", section: "flag", id: p.flags!.data.flags[0]!.id });
  });

  it("asks for the Inspector on every jump, so a hidden one is shown before the rule is highlighted", async () => {
    const p = await m1Project();
    const ws = new WorkspaceState();
    expect(ws.inspectorRequest).toBe(0);
    ws.jumpTo(locate(p, { file: "game.yaml", path: ["rules", 0] })!);
    expect(ws.inspectorRequest).toBe(1);
    ws.jumpTo(locate(p, { file: "game.yaml", path: ["rules", 0] })!);
    expect(ws.inspectorRequest).toBe(2);
  });
});

describe("jump-to picks the Inspector tab", () => {
  it("opens Rules for a rule part and Details for anything else", async () => {
    const p = await m1Project();
    const ws = new WorkspaceState();
    ws.jumpTo(locate(p, { file: "game.yaml", path: ["rules", 0, "do", 0] })!);
    expect(ws.inspectorTab).toBe("rules");
    ws.jumpTo(locate(p, { file: "game.yaml", path: ["maxScore"] })!);
    expect(ws.inspectorTab).toBe("details");
    ws.setInspectorTab("rules");
    ws.requestFocus("name");
    expect(ws.inspectorTab).toBe("details");
  });
});
