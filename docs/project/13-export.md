# 13 — Build Game

**North Star:** see [README](README.md). Decisions: D153, D154.

## Requirements
- **File → Build Game…** produces one `.quest` file (D153). It is not called "export", and it makes no web folder, `index.html` or bundled engine.
- A `.quest` is a zip holding `game.json` and `assets/…` (D154). `game.json` is the compiled, validated project: all YAML merged, editor-only data stripped, unused assets dropped.
- The engine plays a `.quest` file (`loadQuest` → `createGame`).
- Build Game is blocked on validation errors.

## Acceptance
- [x] Build Game writes a `.quest` file of the open project (native save dialog in the app, a download on the dev page).
- [x] The engine plays a built `.quest` (the m1 fixture's puzzle chain plays from one; the engine dev page opens one).
- [x] A project with errors doesn't build: Problems opens instead.

## Superseded
The web-folder export (`index.html`, `engine.<hash>.js`, itch.io upload, "Open in browser" preview, the 150 KB bundle budget, title/icon/loading image) was replaced by D153.
