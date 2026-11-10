# 00 — Questforge: Vision & Scope

**North Star:** see [README](README.md).

## Who it's for
A storyteller or artist who has never programmed and wants to make a King's Quest 6-style adventure. They know how to use apps like Photoshop, Keynote, or Trello. They should never see code, a terminal, or a config file.

## The core loop (what the product must make easy)
1. Create project → 2. Import a background → 3. Draw where the player can walk → 4. Add object layers (props, foreground) → 5. Draw clickable areas → 6. Give them rules ("Look: *A sturdy oak door.*") → 7. Press Play → 8. Export a web game.

Every v1 feature must shorten or enable a step in this loop.

## v1 in scope
- Tauri desktop editor with project browser (folders), scene editor, rule inspector, dialogue graph, playtest, export.
- Web runtime: rendering, pathfinding, depth, sprites, icon bar, inventory, dialogue, save/load, death, score, audio, desktop + touch.
- A 3–5 room demo built only in the editor; it doubles as the "New project" template.

## Out of v1
Art drawing tools · collaboration/cloud · hand-edited files as a supported path · localization · WebGL/effects · plugins/scripting.

## Success criteria
- [ ] Demo is authored 100% through the editor UI (no manual file edits; git history proves it).
- [ ] Exported demo plays to completion in Chrome, Safari, Firefox desktop, iOS Safari, and Android Chrome.
- [ ] Someone unfamiliar with the project can make a room with one working puzzle in under 30 minutes using the template.
