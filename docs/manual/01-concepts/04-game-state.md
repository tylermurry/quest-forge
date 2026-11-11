---
title: What the game remembers
description: Everything that changes while your game is played, and how saves, rules and Playtest use it.
sidebar_position: 4
---

# What the game remembers

As the player plays, the game changes: they pick things up, open gates and visit new rooms. Quest Forge keeps
track of all of it in one place, the **game state**. Rules check it with conditions and change it with
actions, saved games store exactly it, and Playtest lets you see and change it while you play.

## What's in it

| The game remembers | Changed by | Checked by |
|---|---|---|
| Which scene the player is in, and where they stand | **Change scene**, walking | — |
| The items they carry | **Give item**, **Take item** | **Player has**, **Player doesn't have** |
| Every flag (true or false) | **Set flag** | **Flag** |
| Every counter (a whole number) | **Add to counter** | **Counter** |
| The points they've scored, and for what | **Award points** | — |
| Objects shown or hidden | **Show object**, **Hide object** | **Object** |
| Characters moved to new places | **Move character to** | — |
| The scenes they've visited | Entering a scene | **Visited** |
| Which rules have run | Any rule running | **Once**, **First time** |
| Dialogue options already picked | Picking a once-only option | — (the option disappears) |
| The music playing | **Play music**, **Stop music** | — |

Things like the chosen verb or the open inventory aren't part of the game state, so a saved game doesn't keep
them.

## Where it starts

A new game starts in the scene and spawn point set in the **Game** settings. Flags start false, counters start
at zero, the inventory is empty and nothing has been visited.

## Saves

When a player saves, the game state is what gets saved. Loading puts every part of it back exactly as it was.
Saves are kept in the player's web browser, ten slots per game.

:::note Note
Saved games keep working after you update your game. If a save mentions something you've since deleted,
that part is left out and the player is told.
:::

## Dying and trying again

Each time the player enters a scene, the game remembers the state at that moment. If the player dies, **Try
again** puts them back to exactly that point, so they can retry the scene without losing earlier progress.

## Where to next

[From editor to player](./05-editor-to-player.md) shows how a game gets from your editor to your players. In
Playtest, the [state panel](../02-guides/09-test-your-game.md) shows the game state live.
