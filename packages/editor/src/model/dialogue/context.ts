// Where a dialogue is played from: the first scene whose rules start it, and
// the placed character whose own rules do (the likely speaker). DOM-free.
import type { AnyRule, Project } from "@questforge/schema";
import { hereSpawn } from "../playtest/playtest.ts";

export interface DialogueContext {
  scene: string;
  spawn: string;
  /** A placed character in that scene whose rules start the dialogue. */
  character?: string;
  /** False when no scene starts it and the game's start stands in (the neutral scene). */
  started: boolean;
}

const starts = (rules: readonly AnyRule[], dialogue: string) => rules.some((r) => r.do.some((a) => a.type === "start_dialogue" && a.dialogue === dialogue));

/** The scene "Play from this node" uses, or null when the project has nowhere to play. */
export function dialogueContext(p: Project, dialogue: string): DialogueContext | null {
  for (const { data: s } of p.scenes) {
    const speaker = s.characters.find((c) => starts(c.rules, dialogue));
    const any = speaker || starts(s.rules, dialogue) || [...s.hotspots, ...s.objects, ...s.regions].some((t) => starts(t.rules, dialogue));
    if (!any) continue;
    const spawn = hereSpawn(s, null);
    if (spawn) return { scene: s.id, spawn, ...(speaker && { character: speaker.character }), started: true };
  }
  const g = p.game?.data;
  const start = g && p.scenes.find((s) => s.data.id === g.startScene)?.data;
  if (!g || !start?.spawns[g.startSpawn]) return null;
  return { scene: start.id, spawn: g.startSpawn, started: false };
}
