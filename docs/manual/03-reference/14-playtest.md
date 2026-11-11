---
title: Playtest
description: Playing your game inside the editor, and the tools for watching and changing it.
sidebar_position: 14
---

# Playtest

Playtest runs your game inside the editor, using what's in the editor now, including unsaved changes. While it
runs, the Project Browser and Inspector fold away to make room; they come back when you stop.

## Starting

| Command | Key | Starts |
|---|---|---|
| **Play** | F5 | At the game's start scene and spawn point. |
| **Play from Here** | F6 | In the scene open in the active tab, at the selected spawn point, else the `default` one. Needs a scene open. |
| **Play from This Node** | Shift+F6 | The selected dialogue node, in the scene that starts that dialogue. |
| **Start from preset** | — | From a saved preset. |

The arrow next to **Play** has **Play from here** and **Start from preset**. While playing, presets are also listed
under **Presets** in the state panel. Playtest won't start while
there are errors in **Problems**.

## While playing

| Command | Key | What it does |
|---|---|---|
| **Restart** | — | Back to where this playtest started, with your latest changes. |
| **Restart Scene** | — | Back to the moment the player entered the current scene, with your latest changes. |
| **Stop** | Shift+F5 | Ends the playtest. |

When you've changed the project since the playtest started, the **Restart** button tells you. Restart to see
the changes.

The game has keyboard focus while you play. Press Esc to give it back to the editor.

## Debug layers

Buttons above the game that draw what players never see:

| Layer | Draws |
|---|---|
| **Walkable** | The walkable area. |
| **Hotspots** | Hotspot shapes. |
| **Regions** | Region shapes. |
| **Baselines** | Object baselines. |
| **Path** | The route the player is walking. |

## State panel

Shows the game state and lets you change it. Changes take effect at once and aren't undo steps.

| Section | Shows | You can |
|---|---|---|
| **Scene** | The current scene. | Go to another scene. |
| **Inventory** | The items carried. | **Add item…**, or remove one. |
| **Flags and counters** | Every flag and counter. | Switch flags, change counters. |
| **Score** | Each award, and the total of the max score. | — |
| **Dialogue** | The dialogue playing and its node. **None playing** otherwise. | See which once-only options were chosen. |
| **Visited scenes** | Every scene, ticked if visited. | Tick or untick them. |

## Presets

A preset is a saved game state you can start from.

- Type a name, such as "Before cave", and click **Save state**.
- Start from one with **Start from preset**, or from the list under **Presets**.
- Delete one from the list.

Presets are saved in the project. If a preset mentions something you've since deleted, that part is left out.

## Event log

Below the game. Every click, rule and action, in plain words, as it happens:

- Which rules were checked, and why each did or didn't match.
- Each action that ran.
- Scene changes and dialogue steps.

Click a line that names a rule to jump to it.
