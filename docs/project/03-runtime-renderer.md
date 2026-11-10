# 03 — Runtime Renderer & Game Loop

**North Star:** see [README](README.md). Decisions: D30, D31, D33.

## Purpose
This is the dependency-free engine that plays a project. The editor's playtest uses it, and so does the exported game. One engine, no forks.

## Requirements
- Canvas 2D drawing into a fixed 640×400 back buffer, then scaled to the window with nearest-neighbor (`imageSmoothingEnabled = false`).
- Scaling: largest integer multiple that fits; if under 1× (phones), use fractional fit. Always letterbox, never crop.
- Fixed-timestep logic (60 Hz) decoupled from `requestAnimationFrame` render.
- Input normalized to scene coordinates for mouse, touch, and pen (pointer events).
- Engine API is data-in only: `createGame(projectBundle, canvas, options)`. No user code runs.
- Asset preloading per scene with a simple loading screen; next scene's assets prefetched after entry.

## Draw order per frame
Background → objects + characters y-sorted by baseline (spec 04) → speech/narration boxes → icon bar + inventory (spec 06) → (playtest only) debug overlays.

## Acceptance
- [ ] Stable 60 fps with 1 background, 15 objects, 3 characters on a 2020-era phone.
- [ ] Pixel-crisp at 1×, 2×, 3×; correct letterboxing in portrait and landscape.
- [ ] Clicks map to the right scene pixel at all scales (unit-tested transform).
