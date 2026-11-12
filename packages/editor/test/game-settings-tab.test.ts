import { describe, expect, it } from "vitest";
import { GAME_TAB, WorkspaceState } from "../src/model/workspace.ts";
import { m1Project } from "./support/fixtures.ts";

const scene = { section: "scene", id: "garden" } as const;
const item = { section: "item", id: "stick" } as const;

describe("the Game Settings tab", () => {
  it("opens and focuses one tab, selecting the Game", () => {
    const ws = new WorkspaceState();
    ws.open(scene);
    ws.openGame();
    ws.activate(scene);
    ws.openGame();
    expect(ws.gameTab).toBe(true);
    expect(ws.active).toBe(GAME_TAB);
    expect(ws.gameActive).toBe(true);
    expect(ws.selection).toEqual({ kind: "game" });
    expect(ws.tabs).toEqual([scene]);
  });

  it("closing it focuses the first other tab, or none", () => {
    const ws = new WorkspaceState();
    ws.open(scene);
    ws.openGame();
    ws.closeGame();
    expect(ws.gameTab).toBe(false);
    expect(ws.active).toBe("scene:garden");
    expect(ws.selection).toEqual({ kind: "entry", ...scene });
    ws.openGame();
    ws.close(scene);
    expect(ws.active).toBe(GAME_TAB);
    ws.closeGame();
    expect(ws.active).toBeNull();
    expect(ws.selection).toBeNull();
  });

  it("closing another tab while it is open keeps it active, and activating another tab leaves it open", () => {
    const ws = new WorkspaceState();
    ws.open(scene);
    ws.open(item);
    ws.openGame();
    ws.close(item);
    expect(ws.active).toBe(GAME_TAB);
    ws.activate(scene);
    expect(ws.gameActive).toBe(false);
    expect(ws.gameTab).toBe(true);
  });

  it("keeps the area and subsection per area, across closing", () => {
    const ws = new WorkspaceState();
    expect(ws.gameNav).toEqual({ area: "general", general: "start", styling: "frames" });
    ws.setGameSection("defaultResponses");
    ws.setGameSection("iconBar");
    expect(ws.gameNav).toEqual({ area: "styling", general: "defaultResponses", styling: "iconBar" });
    ws.setGameSection("defaultResponses");
    ws.openGame();
    ws.closeGame();
    expect(ws.gameNav).toEqual({ area: "general", general: "defaultResponses", styling: "iconBar" });
  });

  it("reconcile keeps the tab active", async () => {
    const p = await m1Project();
    const ws = new WorkspaceState();
    ws.openGame();
    ws.reconcile(p);
    expect(ws.active).toBe(GAME_TAB);
  });
});
