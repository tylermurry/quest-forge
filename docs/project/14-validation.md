# 14 — Validation

**North Star:** see [README](README.md). Decisions: D38, D53.

## Requirements
- One shared schema package (zod — D53) used by the editor, playtest, and export.
- Runs continuously while editing (incremental, debounced). Results go to a **Problems** panel.
- Every problem has a plain-English message, a severity, and a **jump-to** that selects the exact hotspot, rule, or node.

## Errors (block playtest/export)
Missing reference (item/scene/flag/character/audio/dialogue) · scene with no walkable area · spawn outside walkable · start scene missing · dialogue without Start · invalid polygon (self-intersecting, <3 points) · duplicate IDs · missing image file.

## Warnings (don't block)
Scene unreachable from start · item never given · flag never read or never set · dialogue node unreachable · hotspot with no rules · award IDs whose total ≠ max score.

## Message style
> ❌ **Sunny Beach › Hotspot "door" › Rule 2**: uses item **gold_key**, which doesn't exist. Did you mean **golden_key**?

## Acceptance
- [ ] Every error listed has a unit test with a fixture.
- [ ] Deleting an item used in 3 places produces 3 problems, each jumping to the correct spot.
