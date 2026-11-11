---
title: Conditions
description: Every condition a rule or dialogue can check, in the If part of a rule.
sidebar_position: 10
---

# Conditions

The **If** part of a rule. A rule only runs when all its conditions are true. Dialogues use the same conditions
in **Branch** nodes and in an option's **Show if…**.

## Player has

True when the player is carrying the item.

| Field | What it is |
|---|---|
| **Item** | The item. |

Example: If Player has **coin**.

## Player doesn't have

True when the player isn't carrying the item.

| Field | What it is |
|---|---|
| **Item** | The item. |

Example: If Player doesn't have **long stick**.

## Flag

True when the flag has the value you choose.

| Field | What it is |
|---|---|
| **Flag** | The flag. |
| **Value** | **true** or **false**. |

Example: If Flag **gate_unlocked** is **true**.

## Counter

Compares a counter with a number.

| Field | What it is |
|---|---|
| **Counter** | The counter. |
| **Comparison** | **=** equal to, **≠** not equal to, **<** less than, **>** greater than. |
| **Number** | A whole number. |

Example: If Counter **coins** > **2**.

## Visited

True when the player has been to the scene at least once.

| Field | What it is |
|---|---|
| **Scene** | The scene. |

Example: If Visited **Garden shed**.

## Object

True when an object in a scene is visible, or hidden.

| Field | What it is |
|---|---|
| **Object** | The object. |
| **Scene** | The scene it's in. |
| **Shown** | **visible** or **hidden**. |

Example: If Object **key** in **Garden** is **hidden**.

## First time

True until this rule has run once. Use it for something that should happen differently the first time.

Example: If First time.
