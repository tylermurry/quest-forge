---
title: Test your game
description: Fix problems, play your game inside the editor, and see exactly what's happening as you play.
sidebar_position: 9
---

# Test your game

Find and fix problems, then play your game without leaving the editor, and see what every click does.

## Fix problems

The **Problems** panel at the bottom lists everything wrong with your game, in plain words.

- **Errors** would break the game. You can't play or build until they're fixed.
- **Warnings** are probably mistakes, like an item no rule ever gives. They don't stop you.

Click a problem to jump to the exact thing, and the part of the rule, that needs fixing. Use the **Errors**
and **Warnings** buttons to show only one kind.

The same problems are marked where you edit: on rule cards, layers and fields.

## Play

Click **Play** in the title bar, or press **F5**. The game runs in the middle of the editor, from the start.

The arrow next to **Play** has more ways to start:

- **Play from here** (F6): starts in the scene you're editing, at the selected spawn point, or else the one called `default`.
- **Start from preset**: starts from a moment you saved earlier. See [Presets](#presets).

To start a conversation at a particular line, see
[Test a conversation](./07-conversations.md#test-a-conversation).

## Stop and restart

- **Restart** goes back to where this playtest started.
- **Restart Scene** goes back to when the player entered the current scene.
- **Stop** (Shift+F5) ends the playtest.

You can keep editing while the game runs. When you've changed something, the **Restart** button says so:
restart to see your changes.

## See what's happening

While you play, the panel beside the game shows the game state, and you can change it:

| Section | You can |
|---|---|
| **Scene** | See where you are, and jump to any scene. |
| **Inventory** | See what you carry. Add or remove items. |
| **Flags and counters** | See and change every flag and counter. |
| **Score** | See which awards you've got, out of the max score. |
| **Dialogue** | See the conversation playing and which once-only options were chosen. |
| **Visited scenes** | See and change which scenes count as visited. |

Below the game, the **event log** lists every click, rule and action as it happens, in plain words. It shows
which rules were checked and why each one did or didn't run. Click a line to jump to the rule.

## Show the hidden parts

The buttons above the game draw the parts players never see: **Walkable**, **Hotspots**, **Regions**,
**Baselines** and **Path**.

## Presets

A **preset** saves the game state at a moment, so you can start from there again without replaying.

1. Play to the moment you want, for example just before the cave.
2. Under **Presets**, type a name such as "Before cave" and click **Save state**.

Start from it with **Start from preset** in the arrow next to **Play**. If you've since deleted something it mentions, that part is
left out.

## See also

- [Problems panel](../03-reference/13-problems-panel.md)
- [Playtest](../03-reference/14-playtest.md)
- [What the game remembers](../01-concepts/04-game-state.md)
