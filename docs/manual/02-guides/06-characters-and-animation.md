---
title: Characters and animation
description: Slice sprite sheets, animate characters and objects, and put characters in your scenes.
sidebar_position: 6
---

# Characters and animation

Bring your game to life: cut sprite sheets into frames, give characters their walk, talk and idle animations,
place them in scenes, and animate objects.

## Slice a sprite sheet

A **sprite sheet** is one picture holding many frames of animation in a grid.

1. Import the picture (see [Organize your project](./02-organize-your-project.md#import-pictures-and-sounds)),
   then double-click it in the **Images** section to open it.
2. Click **Slice image**.
3. Set the grid by **Frame size** (each frame's width and height) or by **Rows × columns**.

Click any cell of the sheet to preview that frame. **Make single image** turns it back into one picture.

## Set the feet point

Each image has an **origin**: the point that sits on the ground, usually between the character's feet.
Quest Forge uses it to place the image and to work out who's in front.

In the image's tab, click in the frame preview where the feet are. Or type **Origin x** and **Origin y**.
**Reset origin** goes back to the default, the bottom centre.

## Animate a character

1. Double-click a character in the **Characters** section.
2. The character's tab lists its **animation slots**: idle, walk and talk, each facing down, up, left and right.
3. Click a slot. Choose an **Image**, then pick its frames: click frames on the sheet, or click a row under
   **Take a row:** to take all of it.
4. Set **Frames per second**, and whether the animation loops or plays once.

**Preview (as in the game)** plays the slot as the player will see it.

For left-facing slots, choose **Mirror left from right** to reuse the right-facing frames flipped, or **Draw
left separately** to give them their own.

An empty slot borrows from another: for example, an empty idle slot shows the first frame of the walk.

## Place a character in a scene

Drag the character from the **Project Browser** onto the scene's canvas. In the **Inspector**, set where its
**Feet** are and which way it's **Facing**, and whether it's **Visible when the scene starts**.

A character can be placed once in each scene. Placed characters can have rules, just like objects: open
**Rules** to make them talk, react and trade.

The player's own character isn't placed. It appears at a spawn point.

## Make characters speak and move

These actions work in any rule or dialogue:

| Action | What it does |
|---|---|
| **Say** | A character says a line, in their own text colour, with their talk animation. |
| **Walk player to** | The player walks to a point. Use **Pick on canvas** to choose it. |
| **Walk character to** | Another character walks to a point. |
| **Face** | The player turns to face a direction. |
| **Move character to** | Puts a character in a scene at a point and facing, instantly. The game remembers it. |

## Animate an object

Select an object in a scene. Its **Inspector** has:

- **Looping animation**: plays all the time, like a flickering torch. Choose an image and frames.
- **One-shot animations**: named animations that play once when a rule runs **Play animation**, like a door
  opening, then go back to rest. Click **Add animation** and give it an **ID (used by rules)**.

**Play animation** also works on characters: choose the character and one of their slots.

## More

- Frames are numbered from 0. In an object animation you can type them, such as `0-3`.
- A looping animation on a speaking line stops when the line ends; a one-shot finishes by itself.

## See also

- [Items, characters and images](../03-reference/07-items-characters-images.md)
- [Scene things](../03-reference/06-scene-things.md)
- [Actions](../03-reference/11-actions.md)
