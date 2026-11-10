# 12 — Playtest

**North Star:** see [README](README.md). Decisions: D18, D126–D135.

## Requirements
- **Play** (F5): from the game start. **Play from here** (F6): current scene at the selected spawn point.
- Runs the same engine (spec 03) in a dock or pop-out window, using the in-memory project. No export step needed.
- Blocked if there are validation errors; Problems opens instead (spec 14).
- **State panel** beside the game: inventory, flags, counters, score, and visited scenes. All of it is editable live (add an item, flip a flag).
- **State presets**: save the current state as a named preset ("Before cave") and start from it later.
- Debug toggles: show walkable, hotspots, regions, baselines, and the last path.
- **Event log**: "Look → shell → rule #2 matched → narrate …". Shows which rule fired and why the others didn't (failed condition shown).
- Edits in the editor apply on "Restart scene" (no full reload).

## Acceptance
- [x] Start a late puzzle via a preset in under 5 seconds. (`playtest-presets.test.ts`; live: 0.3 s on the sandbox)
- [x] The event log explains why "use key on door" did nothing. (`playtest-log.test.ts`)
