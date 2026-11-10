# 09 — Scene Editor & Layers

**North Star:** see [README](README.md). Decisions: D15, D35, D41, D42.

## Canvas
- Shows the scene at 640×400 with zoom (fit, 1×–8×) and pan (space-drag / two-finger trackpad).
- Pixel grid at ≥4× zoom. Snapping to pixel always; optional vertex snapping.

## Fixed layer stack (top to bottom in the Layers panel)
1. **Guides**: depth far/near lines (drag the y value; set the scale in the inspector), spawn points.
2. **Regions**: walk-into triggers such as exits (D41).
3. **Hotspots**: named clickable polygons.
4. **Walkable**: outer polygon + holes.
5. **Objects**: reorderable list of placed sprites/characters, each with a draggable baseline handle.
6. **Background**: one image.

Each layer can be shown/hidden and locked. Selecting a layer sets which tools are available.

## Tools
Select/Move · Polygon (click to add points, double-click/Enter to close; drag vertices; Alt-click to delete a vertex) · Rectangle-to-polygon shortcut · Spawn point · Walk-to point (per hotspot).

## Objects layer
- Drag an image or character from the browser onto the canvas to place it.
- Inspector: id, image/animation, position, baseline, initially visible, optional obstacle polygon (D42), optional hotspot behavior (an object can itself be clickable, with rules).

## Live preview aids
- "Depth preview" toggle: a ghost of the player character follows the mouse at the correct scale and occlusion.
- Walkable shading and a path preview from the default spawn to the cursor.

## Acceptance
- [ ] From an empty scene: import a background, draw walkable + 1 hole, place a foreground object, set depth lines, and see the correct ghost scaling, all without leaving the canvas.
