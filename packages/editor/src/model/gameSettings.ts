// The Game Settings tab's navigation: two areas (General, Styling), each with
// its own vertical list of subsections. UI state only (kept in `WorkspaceState`);
// DOM-free so jump-to and the tab can be tested in Node.
import type { DataPath } from "@questforge/schema";

export type GameArea = "general" | "styling";
export type GeneralSection = "start" | "score" | "defaultResponses" | "rules";
export type StylingSection = "sharedFrames" | "typography" | "iconBar" | "dialogueChoices";
export type GameSection = GeneralSection | StylingSection;

export interface GameSettingsNav {
  area: GameArea;
  general: GeneralSection;
  styling: StylingSection;
}

export const INITIAL_GAME_NAV: GameSettingsNav = { area: "general", general: "start", styling: "sharedFrames" };

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
  { section: "sharedFrames", title: "Shared Frames" },
  { section: "typography", title: "Typography" },
  { section: "iconBar", title: "Icon Bar" },
  { section: "dialogueChoices", title: "Dialogue Choices" },
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
