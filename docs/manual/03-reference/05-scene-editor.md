---
title: Scene editor
description: The scene editor's tools, aids, zoom and Layers panel.
sidebar_position: 5
---

# Scene editor

The tab that opens when you click a scene. It has the **Layers** panel and the canvas, with two floating bars at the bottom of the canvas: the tools on the left and the zoom controls to their right.

## Tools

The tools are in the floating tool bar at the bottom of the canvas.

| Tool | Key | What it does |
|---|---|---|
| **Select / Move Tool** | V | Click to select, drag to move. Drag a shape's point to move it, Alt-click a point to delete it, double-click an edge to add a point. Drag depth lines and baselines up and down. |
| **Polygon Tool** | P | Click to add points. Close the shape by clicking the first point, double-clicking, or pressing Enter (**Finish Shape**). ⌫ / Backspace removes the last point; Esc (**Cancel Shape**) throws it away. |
| **Rectangle Tool** | R | Drag to draw a rectangle. |
| **Spawn Point Tool** | S | Click to add a spawn point. Drag from it to set which way the player faces. |
| **Walk-to Point Tool** | W | Click a hotspot, then click where the player should stand to use it. Drag to set the facing. |


### What a shape becomes

The Polygon and Rectangle tools draw on the **active layer**:

| Active layer | The shape becomes |
|---|---|
| **Walkable** | The walkable outline. Once there is one, new shapes become holes. |
| **Hotspots** | A new hotspot. Type its name straight away. |
| **Regions** | A new region. |
| **Objects** | The selected object's obstacle. Select an object first. |

Shapes can't be drawn on other layers.

## Snapping

**Snap to Vertices and Edges**, in the tool bar and the **Scene** menu, makes points you place or drag stick to
nearby points and edges of other shapes.

## Aids

Switches in the tool bar that only show in the editor:

| Aid | Shows |
|---|---|
| **Depth preview (ghost of the player)** | A stand-in player under the pointer, at the size they'd be there. |
| **Path preview from the default spawn** | The route the player would walk from the `default` spawn point. |
| **Shade the walkable area** | The floor characters can walk on. |

## Zoom

| Command | Mac | Windows / Linux |
|---|---|---|
| **Zoom In** | ⌘= | Ctrl+= |
| **Zoom Out** | ⌘- | Ctrl+- |
| **Zoom to Fit** | ⌘0 | Ctrl+0 |
| **Actual Size (1×)** | — | — |

The zoom bar, to the right of the tool bar at the bottom of the canvas, shows the zoom level: click it for 1×. Its
buttons zoom out, zoom in and fit the scene to the window. Pinch, or scroll with ⌘ / Ctrl held, to zoom where the pointer is. Scroll
with two fingers, or hold Space and drag, to pan.

## Layers panel

Lists everything in the scene, by layer, from front to back:

| Layer | Holds |
|---|---|
| **Guides** | **Far line**, **Near line** and the spawn points. |
| **Regions** | Regions, with how many rules each has. |
| **Hotspots** | Hotspots, with how many rules each has. |
| **Walkable** | The **Outline** and each **Hole**, with how many points. |
| **Objects** | Objects and placed characters, in draw order. |
| **Background** | The background image. |

Each layer's heading looks like a Project Browser section heading: an icon and the name. The active layer has an
outline and a light shading.

- Click anywhere on a layer, outside its rows, to make it the active layer.
- The eye icon, on the right of the layer's name, shows or hides the layer on the canvas.
- The lock icon, next to the eye, stops its things being clicked on the canvas. Click **Unlock** to undo.
- Click a row to select it. The bin icon deletes it.
- Drag rows in **Objects** to change which draws in front. You can also do this from the keyboard: with an object
  selected, **]** brings it forward one place and **[** sends it back one, and ⌘] / Ctrl+] and ⌘[ / Ctrl+[ move it
  all the way to the front or the back. Placed characters keep their place; only objects move.

## Dropping onto the canvas

| Drop | Result |
|---|---|
| An image from the Project Browser | A new object, where you drop it. |
| A picture file from your computer | Imported. It becomes the background if the scene has none or the **Background** layer is active; otherwise a new object where you drop it. |
| A character from the Project Browser | The character placed in the scene. |

A scene with no background shows **Drop an image or choose a background**, with a menu of your images.
