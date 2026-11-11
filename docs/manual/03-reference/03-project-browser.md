---
title: Project Browser
description: The panel that lists every building block in your game.
sidebar_position: 3
---

# Project Browser

The panel on the left that lists everything in your game.

## Search names and IDs

Filters every section to the names and IDs that match what you type.

## Game

Click it to select it; double-click it, or press **Enter**, to open the **Game Settings** tab. See [Game settings](./04-game-settings.md).

## Sections

| Section | Holds | Opens in a tab |
|---|---|---|
| **Scenes** | Rooms and screens. | The scene editor. |
| **Items** | Things the player can carry. | The item's details. |
| **Characters** | People, including the player's character. | The character's animations. |
| **Dialogues** | Conversations. | The dialogue editor. |
| **Flags** | Flags and counters. | — (shown in the Inspector) |
| **Audio** | Imported music and sound effects. | — (shown in the Inspector) |
| **Images** | Imported pictures. | The image's slicing and origin. |
| **Fonts** | Imported fonts (WOFF2 or WOFF). | — (shown in the Inspector) |

Each heading shows how many things the section holds. Click it to fold the section away.

## Section and folder menu

Open with the **…** button or by right-clicking.

| Command | What it does |
|---|---|
| **New folder** | Adds a folder. |
| **New scene / item / character / dialogue / flag** | Adds one, in this folder. |
| **Import files…** | (Images, Audio and Fonts) Imports pictures, sounds or fonts from your computer. |
| **Rename folder** | Renames the folder. |
| **Delete folder** | Deletes the folder. |

## Row menu

Open with the **…** button or by right-clicking a row.

| Command | What it does |
|---|---|
| **Open** | Opens it in a tab. |
| **Rename** | Changes the name the player sees. |
| **Change ID…** | Changes the ID that rules use, and updates every rule that uses it. |
| **Duplicate** | Makes a copy. |
| **Delete** | Deletes it. If anything uses it, lists what will be left pointing at nothing. |

## Dragging

- Drag rows onto a folder to move them there. Rows only move within their own section.
- Drag images and characters onto a scene's canvas to place them.
- Drag files from your computer onto the Project Browser to import them: PNG, JPG and WebP pictures, MP3,
  OGG and WAV sounds, and WOFF2 or WOFF fonts. A font file must really be a WOFF2 or WOFF font; a file that only has
  the right ending is refused.

## Inspector details

Select a row to see its details in the Inspector:

| Field | Shows |
|---|---|
| **Name** | The name the player sees. Scenes and dialogues can be renamed here; for others use **Rename** or their tab. |
| **ID** | What rules use. **Change ID…** in the row menu changes it. |
| **Folder** | The folder it's in, or **(top level)**. |
| **Type** | For flags: a flag (true or false) or a counter, and what it starts as. |
| **File** | For images, sounds and fonts: the file in the project folder, with a preview or a player. |
| **Used by** | Every place that uses it. Click one to jump there. |

A selected scene also shows its **Background** and **Music**, and has a **Rules** tab for its scene rules.

Select a folder to see its **Section**, **Path**, and what it **Contains**.
