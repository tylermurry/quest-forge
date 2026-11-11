---
title: Build a scene
description: Paint a room, show where people can walk, and fill it with things.
sidebar_position: 3
---

# Build a scene

Make a room: give it a background, draw where the player can walk, set how big characters look, and place
objects in it.

## Open a scene

Double-click a scene in the **Project Browser** to open it in a tab. To make a new one, choose **New scene**
from the **Scenes** section's **…** menu.

The scene editor has three parts: a toolbar along the top, the **Layers** panel on the left, and the canvas.
The toolbar also shows a hint for whatever tool you're using.

## 1. Set the background

Drag a picture file from your computer onto the empty canvas, or choose one of your images from the menu on
the empty canvas. You can also click an empty part of the scene and choose an image under **Background** in the
**Inspector**.

Every scene is 640 by 400 pixels. A background that size fits exactly.

## 2. Draw where the player can walk

1. In the **Layers** panel, click **Walkable**.
2. Choose the **Polygon Tool** (press **P**).
3. Click around the floor to add points. To finish, click the first point, double-click, or press **Enter**.

That's the walkable area's **outline**. Anything inside it that people can't walk through, like a pond, is a
**hole**: with the **Walkable** layer still active, draw another shape inside the outline.

Characters find their own way around holes. They never walk outside the outline.

:::tip Tip
Turn on **Shade the walkable area** in the toolbar to see the floor you've drawn, and **Path preview from the
default spawn** to see the route the player would take to wherever your pointer is.
:::

## 3. Set the depth

Characters look smaller further away. Two lines control this, in the **Guides** layer:

- The **Far line**, near the back of the floor, with a small **Scale** such as ×0.5.
- The **Near line**, near the front, usually ×1.

Drag each line up or down on the canvas, or select it and type its **Y** and **Scale** in the **Inspector**.
Characters whose feet are between the lines are drawn at a blend of the two sizes.

Turn on **Depth preview (ghost of the player)** in the toolbar: a stand-in player follows your pointer at the
size they'd be there.

## 4. Add spawn points

A **spawn point** is a named place where the player appears in this scene.

1. Choose the **Spawn Point Tool** (press **S**).
2. Click where the player should appear. Drag from the point to set which way they face.

Rename it in the **Inspector** with **Change ID…**, for example to `from_shed`. Rules use this ID to bring the
player here.

## 5. Place objects

An **object** is a picture placed in the scene: a flowerpot, a rock, a door.

1. Drag an image from the **Project Browser**, or a picture file from your computer, onto the canvas.
2. In the **Inspector**, give it a **Name**. Leave the name empty for scenery the player can't click.

With an object selected you can also:

- Untick **Visible when the scene starts** to keep it hidden until a rule shows it.
- Click **Add obstacle** so characters walk around it. Its outline appears on the canvas: drag its points to fit
  the object, or redraw it with the **Polygon Tool** on the **Objects** layer.
- Set its **Baseline**. See [Who's in front](#whos-in-front).

## Who's in front

Each object has a **baseline**: a line across it, usually where it touches the ground. When a character's feet
are below an object's baseline, the character is drawn in front of it; above it, behind it. That's how your
hero walks behind a tree and in front of a fence.

By default the baseline is the object's bottom edge (**Auto**). To change it, select the object and drag its
baseline on the canvas, or type a **Y** in the **Inspector**. Click **Use automatic baseline** to go back.

To reorder objects that don't move, drag them up or down in the **Objects** layer.

## Work with layers

The **Layers** panel lists everything in the scene by layer: **Guides** (depth lines and spawn points),
**Regions**, **Hotspots**, **Walkable**, **Objects** and **Background**.

- Clicking a layer makes it **active**. The drawing tools draw on the active layer.
- The eye icon hides a layer on the canvas. The lock icon stops its things being clicked.
- Select a row to select that thing; the bin icon deletes it.

## Move and reshape things

Use the **Select / Move Tool** (press **V**):

- Click to select, drag to move.
- Drag a point of a shape to move it. Alt-click a point to delete it. Double-click an edge to add a point.

**Snap to Vertices and Edges**, in the toolbar and the **Scene** menu, makes points stick to nearby shapes.

## Zoom and pan

- **Zoom In** (⌘= / Ctrl+=), **Zoom Out** (⌘- / Ctrl+-), **Zoom to Fit** (⌘0 / Ctrl+0), **Actual Size (1×)**:
  in the **Scene** menu and the toolbar.
- Pinch on a trackpad, or scroll with ⌘ / Ctrl held, to zoom where the pointer is.
- Scroll with two fingers, or hold Space and drag, to pan.

## Choose where the game starts

Select **Game** at the top of the **Project Browser**. Under **Start**, choose the scene and the spawn point
the game begins at.

## More

- Press **Escape** to cancel a shape you're drawing. **Backspace** removes its last point.
- The **Rectangle Tool** (press **R**) draws a rectangle in one drag, for any shape the Polygon Tool can draw.
- A scene's **Music** setting starts music when the player enters. See [Sound and music](./08-sound-and-music.md).

## See also

- [Scene editor](../03-reference/05-scene-editor.md)
- [Scene things](../03-reference/06-scene-things.md)
- [Make things interactive](./04-make-things-interactive.md)
