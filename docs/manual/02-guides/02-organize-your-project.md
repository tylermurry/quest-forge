---
title: Organize your project
description: Create, find, rename and tidy everything in your game with the Project Browser.
sidebar_position: 2
---

# Organize your project

Everything in your game lives in the **Project Browser**, on the left of the editor. This guide shows how to
add things, find them, and keep them tidy.

## Sections

The Project Browser has one section for each kind of building block: **Scenes**, **Items**, **Characters**,
**Dialogues**, **Flags**, **Audio** and **Images**. Each shows how many it holds. Click a section's heading to
fold it away.

Double-click the **Game** row at the top to open your game's settings and game-wide rules.

## Add something new

1. Click the **…** button on a section's heading, or right-click it.
2. Choose **New scene**, **New item**, **New character**, **New dialogue** or **New flag**.

Quest Forge creates it with a starter name. Scenes, items, characters and dialogues open in a tab; a new
flag is selected so you can see it in the **Inspector**.

Images, audio and fonts are imported instead of created. See [Import pictures, sounds and fonts](#import-pictures-sounds-and-fonts).

## Find something

Type in **Search names and IDs** at the top of the Project Browser. Every section shrinks to what matches.

## Rename, duplicate and delete

Click the **…** button on a row, or right-click it:

- **Rename** changes the name the player sees.
- **Change ID…** changes the ID that rules use. Quest Forge updates every rule that uses it.
- **Duplicate** makes a copy.
- **Delete** removes it. If anything still uses it, Quest Forge lists what will be left pointing at nothing
  before you confirm. Those show up in **Problems** to fix.

You can also delete the selected row with **Edit ▸ Delete** (⌫ / Backspace).

## Use folders

Folders keep big games tidy, for example one folder of scenes per chapter.

- **New folder**: in a section's or folder's **…** menu.
- **Rename folder** and **Delete folder**: in the folder's **…** menu.
- **Move things into a folder** by dragging them onto it. Things can only move within their own section.

Folders only organize the Project Browser. They don't change how the game plays.

## Import pictures, sounds and fonts

- Drag files from your computer onto the Project Browser, or
- Click **Import files…** in the **Images**, **Audio** or **Fonts** section.

Quest Forge imports PNG, JPG and WebP pictures, MP3, OGG and WAV sounds, and WOFF2 or WOFF fonts. Files dropped on
a folder go into that folder. Anything else is refused.

A font is stored in your project and built into the game, so it works for every player without them installing it.

## See what uses something

Select anything in the Project Browser and look at the **Inspector**. **Used by** lists every rule, scene and
setting that refers to it. Click one to jump there.

:::tip Tip
Check **Used by** before you delete something, so you know what you'll need to fix.
:::

## More

- Select a sound and the **Inspector** has a player so you can listen to it.
- You can also move rows between folders from the keyboard.

## See also

- [Project Browser](../03-reference/03-project-browser.md)
- [The building blocks](../01-concepts/02-building-blocks.md)
