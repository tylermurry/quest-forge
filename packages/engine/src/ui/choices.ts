import { resolveStyle, type EffectiveStyle, type GameStyle } from "@questforge/schema";

// The dialogue choices' look: the author's hover effect and separator color (the author defaults when the game
// has no Dialogue Choices section). Pure; tested in Node. Drawing is in ui/draw.ts.

/** How the hovered or selected row is marked, and the thin line at the top of the choices region. */
export type ChoicesLook = EffectiveStyle["dialogueChoices"];

/** What to draw the choices with. */
export const choicesLook = (style: GameStyle | undefined): ChoicesLook => resolveStyle(style).dialogueChoices;
