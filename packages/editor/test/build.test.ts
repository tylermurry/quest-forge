import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQuest } from "@questforge/engine";
import { Editor } from "../src/model/editor.ts";
import { GameBuilder, type BuildHost } from "../src/model/build.ts";
import { WorkspaceState } from "../src/model/workspace.ts";
import { m1Copy } from "./support/fixtures.ts";

// File ▸ Build Game.

async function setup(host: Partial<BuildHost> = {}) {
  const { dir, fs } = await m1Copy();
  const editor = await Editor.open({ fs });
  const ws = new WorkspaceState();
  const saved: { name: string; bytes: Uint8Array }[] = [];
  const builder = new GameBuilder(editor, ws, {
    readFile: (p) => readFile(join(dir, p)).then((b) => new Uint8Array(b)),
    saveBuild: async (name, bytes) => {
      saved.push({ name, bytes });
      return `/builds/${name}`;
    },
    ...host,
  });
  return { editor, ws, builder, saved };
}

describe("Build Game", () => {
  it("builds the project in memory, unsaved edits included, into a .quest the engine plays", async () => {
    const { editor, builder, saved } = await setup();
    editor.apply("Rename game", (p) => ({ ...p, game: { ...p.game!, data: { ...p.game!.data, title: "Garden Escape" } } }));
    const r = await builder.build();
    expect(r).toEqual({ kind: "built", where: "/builds/garden-escape.quest" });
    expect(saved).toHaveLength(1);
    const bundle = await loadQuest(saved[0]!.bytes);
    expect(bundle.project.game!.data.title).toBe("Garden Escape");
    bundle.dispose();
    editor.dispose();
  });

  it("is blocked by validation errors and opens Problems instead", async () => {
    const { editor, ws, builder, saved } = await setup();
    editor.apply("Break", (p) => ({ ...p, game: { ...p.game!, data: { ...p.game!.data, startScene: "nowhere" } } }));
    const requests = ws.dockRequest;
    expect(await builder.build()).toEqual({ kind: "blocked" });
    expect(ws.dockRequest).toBeGreaterThan(requests);
    expect(editor.notice?.text).toMatch(/before building the game/);
    expect(saved).toHaveLength(0);
    editor.dispose();
  });

  it("does nothing more when the save dialog is cancelled", async () => {
    const { editor, builder } = await setup({ saveBuild: async () => null });
    expect(await builder.build()).toEqual({ kind: "cancelled" });
    expect(editor.notice).toBeNull();
    editor.dispose();
  });

  it("explains an asset file it can't read", async () => {
    const { editor, builder } = await setup({ readFile: () => Promise.reject(new Error("the file isn't in the project folder")) });
    const r = await builder.build();
    expect(r.kind).toBe("failed");
    expect(editor.notice?.text).toMatch(/^Couldn't read assets\/.+: the file isn't in the project folder$/);
    editor.dispose();
  });

  it("runs one build at a time", async () => {
    const { editor, builder } = await setup();
    const first = builder.build();
    expect(builder.building).toBe(true);
    expect(await builder.build()).toEqual({ kind: "busy" });
    expect((await first).kind).toBe("built");
    expect(builder.building).toBe(false);
    editor.dispose();
  });
});
