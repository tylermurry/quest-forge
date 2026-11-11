---
title: Problems panel
description: The panel that lists everything wrong with your game.
sidebar_position: 13
---

# Problems panel

The panel at the bottom of the editor. Quest Forge checks your game a moment after every change and lists
every problem here, in plain words.

## Errors and warnings

| Kind | Means | Blocks Play and Build Game |
|---|---|---|
| **Errors** | Something that would break the game, such as an action that changes to a scene that doesn't exist. | Yes |
| **Warnings** | Something that's probably a mistake, such as a scene nothing leads to, or an item no rule or dialogue gives. | No |

The panel's message says whether anything blocks playtest. The **Errors** and **Warnings** buttons show how
many of each there are; click one to show or hide that kind.

## Jumping to a problem

Each problem names what it's about, such as **Item "fishing rod"**. Click it to open and select that thing, at
the exact field or rule part, which flashes so you can find it.

## Problems where you edit

Problems also show where they happen:

- On rule cards, next to the part that's wrong.
- On the **Rules** tab label, as a warning mark.
- In the scene's Inspector, under the thing they're about.

When you try to Play or Build Game with errors, Quest Forge opens the Problems panel instead.
