---
title: Game settings
description: Settings and rules that apply to the whole game.
sidebar_position: 4
---

# Game settings

Double-click **Game** at the top of the Project Browser (or select it and press **Enter**). The **Game Settings**
tab opens in the middle of the window, with the Inspector hidden to give it room. Closing the tab or switching to
another tab brings the Inspector back. Selecting **Game** with a single click only shows a button that opens the tab.

The tab has two parts: **General** and **Styling**. Each has a list of sections down the left.

## General

The sections of **General** are **Start**, **Score**, **Default Responses** and **Rules**.

### Start

**Play starts in** a scene **at** a spawn point. A new game, and **Play** in the editor, start here.

### Score

**Max score**: the total the player can score, shown in the game as "Score: 5 of 25". A whole number, 0 or
more. Award points with the **Award points** action.

### Default Responses

What the narrator says when no rule answers. Quest Forge checks the thing's rules first, then uses these.

| Response | Used when the player… | Starts as |
|---|---|---|
| **Look at something with no rule** | looks at something with no matching rule. | "You see nothing special." |
| **Hand on something with no rule** | touches something with no matching rule. | "You can't do that." |
| **Talk to something with no rule** | talks to something with no matching rule. | "Nobody answers." |
| **Use an item that doesn't work there** | uses an item where no rule expects it. | "That doesn't work." |
| **Combine items that don't go together** | combines two items with no **Combine** rule. | "Those don't go together." |

Walking has no default response: it's just a walk.

### Rules

Rules that work anywhere. They have two triggers:

- **Combine**: the player uses one inventory item on another. Either order matches.
- **Dialogue ends**: a dialogue reaches its end.

See [Rules](./08-rules.md) and [Triggers](./09-triggers.md).

## Styling

The sections of **Styling** are **Shared Frames**, **Typography**, **Icon Bar** and **Dialogue Choices**. They are
placeholders for now and have nothing to set yet.

When you click a problem about the game's start, score, default responses or rules in the **Problems** panel, the
Game Settings tab opens on the right section and highlights the setting.
