import { ALWAYS_READY, Session, type Vec } from "@questforge/engine";
import { saveProject, type Project } from "@questforge/schema";
import { Editor } from "../../src/model/editor.ts";
import { Playtest } from "../../src/model/playtest/playtest.ts";
import { WorkspaceState } from "../../src/model/workspace.ts";
import { m1Copy } from "./fixtures.ts";
import { sizedImages } from "./scene.ts";

// Playtest tests: an Editor on a throwaway copy of the m1 fixture, and a Playtest whose
// sessions are built headlessly (no canvas), so runs start at once.

export async function playtestEditor(project?: Project) {
  // A disk copy, so image files exist and the project validates (D38).
  const { fs } = await m1Copy();
  if (project) await saveProject(fs, project);
  const editor = await Editor.open({ fs });
  const ws = new WorkspaceState();
  const playtest = new Playtest(editor, ws, {
    createSession: (run, hooks) => new Session(run.project, sizedImages(run.project), run.start, ALWAYS_READY, hooks),
  });
  const session = () => {
    const s = playtest.session;
    if (!s) throw new Error("not playing");
    return s;
  };
  const tick = (seconds = 1 / 60) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds * 60)); i++) session().tick(1 / 60);
  };
  /** Ticks until the player stops walking and any text closes by itself (D78). */
  const settle = () => {
    for (let i = 0; i < 60 * 60 && (session().world.walking || session().text || session().busy); i++) {
      if (session().ending) break;
      session().tick(1 / 60);
    }
    session().tick(1 / 60);
  };
  /** A tap at a scene point with a verb (or the current item), then wait for it to play out. */
  const tap = (verb: "walk" | "look" | "hand" | "talk" | { item: string }, p: Vec) => {
    const s = session();
    if (typeof verb === "object") s.selectItem(verb.item);
    else s.selectVerb(verb);
    s.primaryClick(p);
    settle();
  };
  return { editor, ws, playtest, fs, session, tick, settle, tap, dispose: () => editor.dispose() };
}
