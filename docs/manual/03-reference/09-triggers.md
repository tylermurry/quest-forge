---
title: Triggers
description: Every trigger a rule can have, in the When part of a rule.
sidebar_position: 9
---

# Triggers

The **When** part of a rule: what makes it run. Each thing only offers the triggers that fit it.

## Look

The player looks at the thing. They don't walk over first.

For: objects, placed characters, hotspots. Example: **When** Look.

## Hand

The player touches, takes, pushes or opens the thing. They walk over first.

For: objects, placed characters, hotspots. Example: **When** Hand.

## Talk

The player talks to the thing. They walk over first.

For: objects, placed characters, hotspots. Example: **When** Talk.

## Walk

The player clicks the thing with the Walk verb. They walk over first, then the rule runs. Without a Walk rule,
Walk just walks there.

For: objects, placed characters, hotspots. Example: **When** Walk.

## Use

The player uses an inventory item on the thing. They walk over first.

| Field | What it is |
|---|---|
| **Item** | The item the player must be using. |

For: objects, placed characters, hotspots. Example: **When** Use with **fishing rod**.

## Player walks in

The player walks into the region. It fires each time they cross into it on a walk they started themselves,
not when a **Walk player to** action moves them.

For: regions. Example: **When** Player walks in.

## Player enters the scene

The player arrives in the scene, whether at the start of the game or from another scene. Loading a saved game
doesn't fire it.

For: scenes. Example: **When** Player enters the scene.

## Player leaves the scene

The player is leaving the scene, before the next one loads.

For: scenes. Example: **When** Player leaves the scene.

## Combine

The player uses one inventory item on another. Either order matches.

| Field | What it is |
|---|---|
| **Item** | One of the items. |
| **Other item** | The other item. |

For: the game. Example: **When** Combine **string** with **long stick**.

## Dialogue ends

A dialogue reaches an End node, or a port with nothing connected. It doesn't fire when a dialogue is cut short
by a scene change, death, win or restart.

| Field | What it is |
|---|---|
| **Dialogue** | The dialogue. |

For: the game. Example: **When** Dialogue ends **gardener chat**.
