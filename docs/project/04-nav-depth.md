# 04 — Navigation & Depth

**North Star:** see [README](README.md). Decisions: D34, D35, D42.

## Navigation
- Walkable area = one outer polygon + zero or more holes, drawn in the editor (spec 09).
- Visible objects with an `obstacle` polygon add holes at runtime; hiding the object removes them (D42).
- Pathfinding: visibility graph over concave vertices (inset by 1px) → A*. Paths are straight segments, no grid.
- A click outside the walkable area walks to the nearest walkable point.
- Clicking a hotspot walks to its `walkTo` point (or nearest walkable point) and faces it before the verb runs.
- Walk speed is in pixels/second at scale 1.0 and is multiplied by the current depth scale (small = far = slower).

## Depth
- Each scene has a **far line** (y, scale) and a **near line** (y, scale). Character scale = linear interpolation by feet-y, clamped.
- Occlusion: every object and character has a **baseline** y. Sort by baseline each frame; higher baseline draws later (in front).
- Objects with no baseline set default to their bottom edge.

## Acceptance
- [ ] Unit tests: path around a single hole, U-shaped room, start/end in the same convex area, unreachable target → nearest point.
- [ ] Character visibly shrinks walking "into" the scene and walks behind a foreground tree and in front of a rock.
- [ ] Removing a boulder object opens a path that didn't exist before.
