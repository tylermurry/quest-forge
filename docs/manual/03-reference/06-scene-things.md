---
title: Scene things
description: The Inspector's fields for a scene and everything in it.
sidebar_position: 6
---

# Scene things

What the Inspector shows when you select a scene, or something in one. Things that can have rules also have a
**Rules** tab; see [Rules](./08-rules.md).

Every scene is 640 by 400 pixels. Positions are in pixels from the top-left corner.

## Scene

Selected by clicking an empty part of the canvas, or the scene in the Project Browser.

| Field | What it does |
|---|---|
| **Name** | The scene's name. |
| **Background** | The image behind everything. **None (black)** for none. |
| **Music** | The track that plays when the player enters. **None (keep what's playing)** leaves the music as it is. |

Rules tab triggers: **Player enters the scene**, **Player leaves the scene**.

## Object

| Field | What it does |
|---|---|
| **Name (empty: scenery the player can't click)** | The name the player sees. Empty for scenery. |
| **ID** | What rules use. **Change ID…** changes it everywhere. |
| **Image** | The picture it shows. |
| **Position (top-left)** | Where its top-left corner is: **X** and **Y**. |
| **Baseline** | The line that decides what's drawn in front. **Auto (bottom edge)** by default; set a **Y** or drag it on the canvas. **Use automatic baseline** goes back to auto. |
| **Visible when the scene starts** | Untick to keep it hidden until a rule shows it. |
| **Obstacle** | **Add obstacle** makes characters walk around it while it's visible. Drag its points on the canvas, or redraw it with the Polygon Tool. **Remove obstacle** removes it. |
| **Looping animation** | An animation that plays all the time. |
| **One-shot animations** | Named animations that **Play animation** plays once. |

Rules tab triggers: **Look**, **Hand**, **Talk**, **Walk**, **Use**.

## Placed character

| Field | What it does |
|---|---|
| **Feet** | Where the character's feet are (**X**, **Y**) and which way it's **Facing**. |
| **Visible when the scene starts** | Untick to keep it hidden. |

Rules tab triggers: **Look**, **Hand**, **Talk**, **Walk**, **Use**.

## Hotspot

| Field | What it does |
|---|---|
| **Name (shown to the player)** | The name the player sees. |
| **ID** | What rules use. |
| **Walk-to point** | Where the player stands to use it (**X**, **Y**) and which way they face. Place it with the Walk-to Point Tool. **Remove walk-to point** removes it; the player then walks to the nearest place they can stand. |

Drag its points on the canvas to reshape it.

Rules tab triggers: **Look**, **Hand**, **Talk**, **Walk**, **Use**.

## Region

| Field | What it does |
|---|---|
| **ID** | What rules use. Regions have no name: the player never sees them. |

Rules tab trigger: **Player walks in**, when the player walks into it.

## Spawn point

| Field | What it does |
|---|---|
| **ID** | The spawn point's name, used by **Change scene** and the game's start. |
| **Where the player appears** | **X**, **Y** and the **Facing** the player arrives with. |

The spawn point called `default` is used when nothing else says which one.

## Walkable area

The **Outline** is where characters can walk; each **Hole** is a place inside it they can't. Select one to see
how many points it has, and drag its points on the canvas.

## Depth lines

| Field | What it does |
|---|---|
| **Far line** | **Y**: how far down the scene it is. **Scale**: how big characters are with their feet on it. |
| **Near line** | The same, for the front. |

Characters with their feet on the far line draw at its scale, on the near line at its scale, and in between at
a blend.

## Background

The background image. Delete it from the **Layers** panel to remove it.
