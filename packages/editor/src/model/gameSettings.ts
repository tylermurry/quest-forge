// The Game Settings tab's navigation: two areas (General, Styling), each with
// its own vertical list of subsections. UI state only (kept in `WorkspaceState`);
// DOM-free so jump-to and the tab can be tested in Node.
import type { DataPath } from "@questforge/schema";

export type GameArea = "general" | "styling";
export type GeneralSection = "start" | "score" | "defaultResponses" | "rules";
export type StylingSection = "frames" | "typography" | "characterDialogue" | "inventory" | "iconBar";
export type GameSection = GeneralSection | StylingSection;

export interface GameSettingsNav {
  area: GameArea;
  general: GeneralSection;
  styling: StylingSection;
}

export const INITIAL_GAME_NAV: GameSettingsNav = { area: "general", general: "start", styling: "frames" };

export const GAME_AREAS: { area: GameArea; title: string }[] = [
  { area: "general", title: "General" },
  { area: "styling", title: "Styling" },
];

export const GENERAL_SECTIONS: { section: GeneralSection; title: string }[] = [
  { section: "start", title: "Start" },
  { section: "score", title: "Score" },
  { section: "defaultResponses", title: "Default Responses" },
  { section: "rules", title: "Rules" },
];

export const STYLING_SECTIONS: { section: StylingSection; title: string }[] = [
  { section: "frames", title: "Frames" },
  { section: "typography", title: "Typography" },
  { section: "characterDialogue", title: "Character Dialogue" },
  { section: "inventory", title: "Inventory" },
  { section: "iconBar", title: "Icon Bar" },
];

/** The General subsection a game.yaml data path belongs to; anything unknown lands on Start. */
export function generalSectionFor(path: DataPath): GeneralSection {
  switch (path[0]) {
    case "maxScore":
      return "score";
    case "defaultResponses":
      return "defaultResponses";
    case "rules":
      return "rules";
    default:
      return "start";
  }
}

/** The Styling section a game.yaml `style` data path belongs to, or null when the path is not under `style`. */
export function stylingSectionFor(path: DataPath): StylingSection | null {
  if (path[0] !== "style") return null;
  switch (path[1]) {
    case "typography":
      return "typography";
    case "speech":
    case "dialogueChoices":
      return "characterDialogue";
    case "iconBar":
      return "iconBar";
    default:
      return "frames"; // sharedFrame, narration
  }
}
