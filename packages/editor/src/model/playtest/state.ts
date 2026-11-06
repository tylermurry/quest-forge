// The playtest state panel (spec 12, D130): what it lists and the live edits it
// makes. Edits change the running session's GameState at once, even during a
// sequence; they are play state, never project data and never undo steps.
import { score, type GameState, type Session } from "@questforge/engine";
import { logicBlocks, type Project } from "@questforge/schema";
import { pickerOptions, type PickOption } from "../rules/pickers.ts";
import { hereSpawn } from "./playtest.ts";

export interface AwardOption {
  id: string;
  points: number;
}

/** Every award ID in the project's `award_points` actions, with the points it gives first (D132). */
export function awardCatalog(p: Project): AwardOption[] {
  const out = new Map<string, number>();
  for (const b of logicBlocks(p)) for (const { a } of b.actions) if (a.type === "award_points" && !out.has(a.award)) out.set(a.award, a.points);
  return [...out].map(([id, points]) => ({ id, points }));
}

export interface StateView {
  scene: PickOption;
  inventory: PickOption[];
  /** Items not held, for "Add item". */
  addable: PickOption[];
  flags: { id: string; value: boolean }[];
  counters: { id: string; value: number }[];
  score: number;
  maxScore: number;
  awards: (AwardOption & { granted: boolean })[];
  visited: { id: string; label: string; visited: boolean }[];
  /** Scenes for "Go to scene". */
  scenes: PickOption[];
  /** Go to scene waits while a sequence or scene change runs (D130). */
  canGoToScene: boolean;
}

/** What the state panel shows for the running game. IDs the project no longer has still show, by ID. */
export function stateView(p: Project, session: Session): StateView {
  const s = session.state;
  const items = pickerOptions(p, "item");
  const label = (opts: PickOption[], id: string) => opts.find((o) => o.id === id) ?? { id, label: id };
  const scenes = pickerOptions(p, "scene");
  const catalog = awardCatalog(p);
  // Granted awards the catalog doesn't list (e.g. from a preset) still show.
  for (const [id, points] of Object.entries(s.awards)) if (!catalog.some((a) => a.id === id)) catalog.push({ id, points });
  return {
    scene: label(scenes, s.scene),
    inventory: s.inventory.map((id) => label(items, id)),
    addable: items.filter((i) => !s.inventory.includes(i.id)),
    flags: pickerOptions(p, "flag").map((f) => ({ id: f.id, value: s.flags[f.id] ?? false })),
    counters: pickerOptions(p, "counter").map((c) => ({ id: c.id, value: s.counters[c.id] ?? 0 })),
    score: score(s),
    maxScore: session.game.maxScore,
    awards: catalog.map((a) => ({ ...a, granted: a.id in s.awards })),
    visited: scenes.map((sc) => ({ id: sc.id, label: sc.label, visited: s.visited.includes(sc.id) })),
    scenes,
    canGoToScene: !session.busy,
  };
}

/** One live edit to the running game's state. */
export type StateEdit =
  | { kind: "giveItem"; item: string }
  | { kind: "takeItem"; item: string }
  | { kind: "setFlag"; flag: string; value: boolean }
  | { kind: "setCounter"; counter: string; value: number }
  | { kind: "grantAward"; award: string; points: number }
  | { kind: "revokeAward"; award: string }
  | { kind: "setVisited"; scene: string; visited: boolean }
  | { kind: "goToScene"; scene: string };

/** Applies an edit at once (D130). Returns false when it can't apply now (Go to scene while busy). */
export function applyStateEdit(session: Session, edit: StateEdit): boolean {
  const s: GameState = session.state;
  switch (edit.kind) {
    case "giveItem":
      if (!s.inventory.includes(edit.item)) s.inventory.push(edit.item);
      return true;
    case "takeItem":
      s.inventory = s.inventory.filter((i) => i !== edit.item);
      return true;
    case "setFlag":
      s.flags[edit.flag] = edit.value;
      return true;
    case "setCounter":
      s.counters[edit.counter] = Math.trunc(edit.value);
      return true;
    case "grantAward":
      if (!(edit.award in s.awards)) s.awards[edit.award] = edit.points;
      return true;
    case "revokeAward":
      delete s.awards[edit.award];
      return true;
    case "setVisited":
      if (edit.visited && !s.visited.includes(edit.scene)) s.visited.push(edit.scene);
      if (!edit.visited) s.visited = s.visited.filter((v) => v !== edit.scene);
      return true;
    case "goToScene": {
      if (session.busy) return false;
      const scene = session.sceneFile(edit.scene);
      const spawn = scene && hereSpawn(scene, null);
      if (!spawn) return false;
      // A real scene change: the exit rule, then the new scene's enter rule (D72).
      session.changeScene(edit.scene, spawn);
      return true;
    }
  }
}
