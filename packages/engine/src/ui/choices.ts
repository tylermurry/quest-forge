import { resolveStyle, type GameStyle } from "@questforge/schema";

// The dialogue choices' colours: the author's highlight and separator, and the text colour derived from the
// highlight so a chosen row stays readable. Pure; tested in Node. Drawing is in ui/draw.ts.

export interface ChoicesLook {
  /** Background of the hovered or selected row. */
  highlight: string;
  /** The thin line at the top of the choices region. */
  separator: string;
  /** The author configured Dialogue Choices. False is the legacy look, which has no separator line of its own. */
  styled: boolean;
}

/** What to draw the choices with: the game's style, or the legacy look when it has no Dialogue Choices section. */
export function choicesLook(style: GameStyle | undefined): ChoicesLook {
  return { ...resolveStyle(style).dialogueChoices, styled: style?.dialogueChoices !== undefined };
}

const channel = (hex: string, at: number) => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a #rrggbb colour: 0 is black, 1 is white. */
export const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/** WCAG contrast ratio of two #rrggbb colours: 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background` (the one with the higher WCAG contrast). */
export const legibleInk = (background: string) => (contrast(background, "#000000") >= contrast(background, "#ffffff") ? "#000" : "#fff");
