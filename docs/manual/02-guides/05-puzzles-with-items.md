---
title: Puzzles with items
description: Make items, give them to the player, and build puzzles with flags, counters and points.
sidebar_position: 5
---

# Puzzles with items

Most adventure puzzles come down to this: find something, then use it in the right place. This guide shows
how to make items, hand them out, check what the player has done, and reward them.

## Make an item

1. In the **Project Browser**, choose **New item** from the **Items** section's **…** menu.
2. In the item's tab, set its **Name**, its **Description** (what the narrator says when the player looks at
   it in the inventory) and its **Icon**, an image from your project.

## Give it to the player

Items only reach the player through a rule. On the thing where the player finds it, add a rule:

> **When** Hand · **Do** Narrate "You pull a long stick from the hedge." · Give item **long stick**

Switch on **Once**, or add a condition **Player doesn't have** long stick, so it can only be taken once.

If the item is a picture in the scene, also add **Hide object** so it disappears when picked up.

## Use it on something

On the thing the item is used on, add a rule with the trigger **Use** with the item:

> **When** Use with **fishing rod** · **Do** Narrate "A fish bites!" · Give item **big fish** · Take item
> **fishing rod**

The player selects the item in their inventory, then clicks the pond.

## Combine two items

To let the player join two inventory items together:

1. Double-click **Game** in the **Project Browser** and, in **Game Settings**, open **General** then **Rules**.
2. Add a rule with the trigger **Combine**, and choose both items. The order doesn't matter.
3. Add actions, such as **Take item** for each part and **Give item** for the result.

## Remember what's happened: flags and counters

A **flag** is true or false: "the gate is unlocked". A **counter** is a whole number: "coins found".

- Make a flag with **New flag** in the **Flags** section, or with **Create … and use it** in any flag picker.
  Make a counter from a counter picker in the same way.
- Change them with the actions **Set flag** and **Add to counter** (add a negative number to subtract).
- Check them with the conditions **Flag** and **Counter**.

New flags start false and new counters start at zero.

## Check what the player has done

Conditions decide whether a rule runs. All of a rule's conditions must be true.

| Condition | True when |
|---|---|
| **Player has** / **Player doesn't have** | The player is (or isn't) carrying the item. |
| **Flag** | The flag is true (or false). |
| **Counter** | The counter is =, ≠, < or > a number. |
| **Visited** | The player has been to a scene. |
| **Object** | An object in a scene is visible (or hidden). |
| **First time** | This rule hasn't run before. |

## Show and hide things

**Show object** and **Hide object** make an object in any scene appear or disappear. The game remembers it, so
it stays that way when the player comes back.

## Award points

1. Double-click **Game** and set **Max score** under **General** then **Score**. The game shows it as "Score: 5 of 25".
2. In any rule, add **Award points**: a number of points, **for** an award name such as `caught_fish`.

Each award only counts once, even if the rule runs again.

## Move between scenes

**Change scene** takes the player to another scene, at one of its spawn points. It's often the only action of
a region's **Player walks in** rule, or of a door's **Hand** rule.

## Dying and winning

- **Die** ends the game with a message. The player can **Try again** from where they entered the scene,
  **Restore** a saved game, or **Restart**.
- **Win the game** ends the game with "You won!" and the final score. The player can **Restore** or
  **Restart**.

## More

- **Take item** on an item the player doesn't have does nothing. **Give item** on one they already have does
  nothing.
- **Wait** pauses for a number of seconds, between 0.1 and 60. Use it to time actions.

## See also

- [Items, characters and images](../03-reference/07-items-characters-images.md)
- [Conditions](../03-reference/10-conditions.md), [Actions](../03-reference/11-actions.md)
- [Game settings](../03-reference/04-game-settings.md)
