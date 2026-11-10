# 05 — Sprites & Animation

**North Star:** see [README](README.md). Decisions: D39, D66, D111–D115.

## Purpose
Import images and turn them into animations without code.

## Requirements
- Import PNG (single image) or spritesheet (grid). The editor slices a grid by cell size or rows × columns.
- An **animation** is a named, ordered list of frames + fps + loop/once.
- Each sprite has an **origin** (default: bottom-center = feet) set by clicking in the editor.
- Characters need standard animation slots: `idle_<dir>`, `walk_<dir>`, `talk_<dir>`, with `<dir>` = down, up, left, right (D39). Left may be marked "mirror of right".
- Missing slots fall back: talk → idle → first frame of walk.
- Objects may have one optional looping animation (e.g. flickering torch) and named one-shot animations for `play_animation`.

## Acceptance
- [ ] Import an 8×4 sheet, slice it, and assign walk cycles in under 2 minutes.
- [ ] Mirrored left walk renders correctly, with the origin preserved.
