# 11 — Dialogue Graph

**North Star:** see [README](README.md). Decisions: D17, D20, D62, D136–D144.

## Purpose
This is where designers author branching conversations visually. It is built on React Flow (D20).

## Node types
| Node | Contents |
|---|---|
| **Start** | one per dialogue |
| **Line** | speaker (character or narrator), text, optional animation |
| **Choices** | list of player options; each option has text, optional conditions, a `once` toggle, and its own output port |
| **Actions** | any action list from spec 02 (give item, set flag, award points…) |
| **Branch** | conditions → "true" / "false" ports (e.g. "if has_item gold") |
| **End** | ends the dialogue (fires `dialogue_end`) |

## Editing
- Drag from a port to empty space opens a "create node" menu. Auto-layout button. Minimap.
- Selecting a node edits it in the right inspector (same pickers as spec 10).
- "Play from this node" sends you into playtest (spec 12) at that node.

## Acceptance
- [x] Build a shopkeeper conversation with a once-only question, a choice gated on having a coin, and a loop back to the main menu. (`dialogue-model.test.ts`, played by taps in `engine/test/fixture.test.ts`; built by hand in the editor dev page)
- [x] Nodes with no path from Start show a warning. (`dialogue-model.test.ts`, `schema/test/warnings.test.ts`; dimmed on the graph)
