# 07 — Game Systems: Save, Death, Score, Audio

**North Star:** see [README](README.md). Decisions: D36, D43, D146–D151.

## Game state (single serializable object)
Current scene, player position/facing, inventory, flags, counters, awarded point IDs, object visibility overrides, visited scenes, fired `once` rules, dialogue `once` choices, current music.

## Save / load (D43)
- Exported game: 10 named slots in `localStorage`, keyed by game id + version.
- Auto-snapshot on every scene entry (used by "Try again" after death).
- Saves made with an older game version load if their IDs still exist; missing IDs are dropped with a notice, never a crash.

## Death
- `die "<message>"` shows a Sierra-style death box: message + **Restore** · **Restart** · **Try again**.

## Score
- `award_points n award-id`. Each award ID counts once. Score shows as `Score: X of Y` in the icon bar; Y comes from `game.yaml` (the editor can compute it from all awards).

## Audio
- Web Audio API. Music per scene (continues across scenes if it's the same track), SFX via actions.
- Unlock audio on first user gesture (mobile requirement). Volume sliders for music and SFX in Settings.
- Formats: import MP3/OGG/WAV; export keeps MP3 for compatibility.

## Acceptance
- [x] Save in scene 3, reload the page, load: identical state (deep-equal test). (`engine/test/saves.test.ts`, `fixture.test.ts`)
- [x] Dying, then "Try again", returns to the scene-entry state. (`saves.test.ts`, `fixture.test.ts`)
- [ ] Audio plays on iOS Safari after the first tap. (Unlocks on pointerup, D151; checked in desktop Chrome, not yet on an iPhone.)
