# Questforge — Specs

**Questforge** is a no-code editor for classic point-and-click adventures.

Each spec is small and self-contained. Every spec starts by restating the North Star; any feature that doesn't serve it gets cut.

**North Star (locked 2026-11-05)**
> A desktop WYSIWYG editor where a non-programmer builds a classic Sierra-style point-and-click adventure: import art, layer it into scenes, draw clickable areas, give them interaction rules, organize everything in folders, playtest in place, and export a web game that runs on desktop and mobile. v1 is proven by a 3–5 room demo made only in the editor.

| # | Spec | Area |
|---|------|------|
| 00 | [Vision & scope](00-vision.md) | Product |
| 01 | [Project format](01-project-format.md) | Data |
| 02 | [Rule vocabulary](02-rule-vocabulary.md) | Data |
| 03 | [Runtime renderer & loop](03-runtime-renderer.md) | Runtime |
| 04 | [Navigation & depth](04-nav-depth.md) | Runtime |
| 05 | [Sprites & animation](05-sprites-animation.md) | Runtime |
| 06 | [Player UI](06-player-ui.md) | Runtime |
| 07 | [Game systems](07-game-systems.md) | Runtime |
| 08 | [Editor shell & project browser](08-editor-shell.md) | Editor |
| 09 | [Scene editor & layers](09-scene-editor.md) | Editor |
| 10 | [Hotspot & rule inspector](10-rule-inspector.md) | Editor |
| 11 | [Dialogue graph](11-dialogue-graph.md) | Editor |
| 12 | [Playtest](12-playtest.md) | Editor |
| 13 | [Build Game](13-export.md) | Editor |
| 14 | [Validation](14-validation.md) | Cross-cutting |
| 15 | [Demo game & build order](15-demo-and-build-order.md) | Delivery |

See [DECISIONS.md](DECISIONS.md) for every decision, who made it, and what it superseded. All decisions are confirmed as of 2026-11-05.
