# 15 — Demo Game & Build Order

**North Star:** see [README](README.md). Decisions: D4, D5, D6.

## Demo: "The Lantern" (4 rooms, placeholder art, original)
| Room | Covers |
|---|---|
| **Beach** (start) | walkable with holes (rocks), foreground palm occlusion, find a coin under a shell (hand), award points |
| **Village path** | strong depth scaling, walk-into exit regions, a boulder obstacle that a villager moves after you talk to them |
| **Shop** | shopkeeper NPC, dialogue graph with gated choice (has coin), once-only question, buy lantern (take coin, give lantern) |
| **Cave** | enter without a lit lantern → death. Combine lantern + matches (found on path) → lit lantern. Retrieve gem → `win_game` |

Also covers: music per room, SFX, save/load, score `X of Y`, and touch play.

Rule: the demo is built **only** in the editor. If something can't be done, file it against the relevant spec; never hand-edit.

## Build order (each milestone ends demoable)
| M | Deliverable | Specs |
|---|---|---|
| M0 | Monorepo, schema package, project load/save round-trip | 01, 14 (core) |
| M1 | Engine plays a hand-built test fixture: render, walk, depth, hotspots, look text | 03, 04, 05 |
| M2 | Rule engine + icon bar + inventory + text boxes | 02, 06 |
| M3 | Tauri shell, start screen, project browser with folders, autosave/undo | 08 |
| M4 | Scene editor: layers, polygons, objects, depth guides | 09 |
| M4b | Sprites & animation editor: sheet slicing, character animation slots, object animations (D94) | 05 |
| M5 | Rule inspector + Problems panel | 10, 14 |
| M6 | Playtest with state panel + event log | 12 |
| M7 | Dialogue graph | 11 |
| M8 | Save/death/score/audio | 07 |
| M9 | Build Game (`.quest`, D153) + build the demo in the editor + ship as template | 13, 15 |

(M1 test fixtures are internal engine tests. They are not a user path, so hand-writing them doesn't contradict D13.)
