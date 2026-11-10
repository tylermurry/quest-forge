# 06 — Player UI (in the exported game)

**North Star:** see [README](README.md). Decisions: D32, D33.

## Icon bar (KQ6-style)
- Hidden by default. Slides down from the top when the mouse touches the top 8px (desktop) or the player taps a small persistent tab (touch).
- Icons: Walk · Look · Hand · Talk · Current item · Inventory · Settings (save/load/restart/volume).
- Desktop: right-click cycles Walk → Look → Hand → Talk → (Current item, if any).
- Cursor shows the active verb; hovering a hotspot shows its name in a small label (desktop only; touch shows it on tap-and-hold).

## Inventory
- Modal window over the scene: grid of item icons. Select an item to make it the current item; Look at an item shows its description; Hand on item A while holding item B triggers `combine`.

## Text
- `narrate`: centered Sierra-style box. `say`: box near the speaker, tinted in the character's color, with the speaker's name.
- Advances on click/tap or after a time based on text length. Skippable.
- Dialogue choices: a list box; tap/click to choose.

## Touch specifics
- Tap = use current verb at that point. No hover dependencies anywhere in gameplay.
- Minimum hit size of 44 CSS px for all UI controls after scaling.

## Acceptance
- [ ] The full demo is playable with only touch on a phone in landscape.
- [ ] The full demo is playable with only the mouse (no keyboard needed).
