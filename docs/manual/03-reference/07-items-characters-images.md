---
title: Items, characters and images
description: The tabs for items, characters and images, and object animations.
sidebar_position: 7
---

# Items, characters and images

What you see when you open an item, a character or an image in a tab, and the animation fields of an object.

## Item tab

| Field | What it does |
|---|---|
| **Name** | The name the player sees. |
| **Description** | What the narrator says when the player looks at the item in their inventory. |
| **Icon** | The image shown in the inventory. |

## Character tab

| Field | What it does |
|---|---|
| **Name** | The character's name. |
| Animation slots | One slot for each of idle, walk and talk, facing down, up, left and right. |

Select a slot to edit it:

| Field | What it does |
|---|---|
| **Image** | The sprite sheet the frames come from. |
| Frames | Click frames on the sheet to pick them, in order. **Take a row:** takes a whole row. |
| **Frames per second** | How fast it plays. |
| **Loop animation** / **Play animation once** | Whether it repeats. |
| **Mirror left from right** / **Draw left separately** | For left-facing slots: flip the right-facing frames, or use frames of their own. |
| **Preview (as in the game)** | Plays the slot as it will look. |
| **Clear animation slot** | Empties the slot. |

An empty slot borrows another slot's animation: the list says which, such as **Empty: uses first frame of
walk_down**.

The game uses the slots like this: **idle** while standing, **walk** while walking, **talk** while saying a line.

## Image tab

### Slicing

| Option | What it does |
|---|---|
| **Single image** | The whole picture is one frame. **Make single image** switches back to this. |
| **Slice image** | Cuts the picture into a grid of frames. |
| **Frame size** | Set the grid by **Frame width** and **Frame height**. |
| **Rows × columns** | Set the grid by **Rows** and **Columns**. |

Click a cell of the sheet to preview that frame. Frames are numbered from 0, left to right, top to bottom.

### Origin

The point of each frame that sits on the ground: the feet. Click in the frame preview to set it, or type
**Origin x** and **Origin y**. **Reset origin** goes back to the bottom centre.

## Object animations

In the Inspector, for a selected object.

| Field | What it does |
|---|---|
| **Looping animation** | Plays all the time. Choose an **Image**, its frames (such as `0-3`) and **Frames per second**. **None** shows frame 0 of the object's image. |
| **One-shot animations** | Played once by a rule's **Play animation**, then back to rest. **Add animation** adds one; each has an **ID (used by rules)**, an **Image**, frames and **Frames per second**. |
