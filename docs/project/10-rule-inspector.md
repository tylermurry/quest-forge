# 10 — Hotspot & Rule Inspector

**North Star:** see [README](README.md). Decisions: D16, D37, D40.

## Purpose
This is how a non-coder makes things happen. It is built only from dropdowns, pickers, and text fields over the vocabulary in spec 02.

## Layout (for a selected hotspot / object / region / scene)
- Header: name (shown to the player), id.
- **Quick fields**: Look text, Hand text, Talk text. Each one creates a simple rule automatically, so most hotspots never need the rule list.
- **Rules list**: cards reading like sentences:
  `When [Use ▾] with [Key ▾]  If [flag door_locked ▾ is true ▾]  Do: 1. [Say ▾] Player "It unlocks!"  2. [Set flag ▾] door_locked = false …`
- Drag to reorder rules (order matters: first match wins). Each rule has a `once` toggle (no enable/disable switch in v1, D116).
- Every picker lists existing assets and includes "+ Create new…" inline (e.g. create a new flag without leaving the rule).
- Point-type parameters (walk_player_to) offer "Pick on canvas".

## Game-level rules
A "Game" item in the browser opens the same inspector for `combine`, `dialogue_end`, and default verb responses.

## Acceptance
- [ ] Build "use key on door → unlocks → walk through door changes scene" with zero typing except the dialogue text.
- [ ] Invalid rules (e.g. a deleted item) show inline in red and appear in Problems (spec 14).
