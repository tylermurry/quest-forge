# 08 — Editor Shell & Project Browser

**North Star:** see [README](README.md). Decisions: D10, D11, D12, D14, D19, D21, D22.

## Shell
- Tauri app; UI is React + TS (D19). The Rust side handles only file I/O, folder watching, and native dialogs.
- Start screen: **New project** (from the demo template or blank) · **Open folder** · recent projects.
- Main layout: Project browser (left) · Tabbed editor area (center) · Inspector (right) · Problems/Playtest dock (bottom).

## Project browser
- Top-level sections: Scenes · Items · Characters · Dialogues · Flags · Audio · Images.
- Within each section: create folders, nest, drag-and-drop to reorder/move, rename, duplicate, delete.
- Delete warns with a list of references ("Used by 3 rules in 2 scenes") and offers to cancel.
- Search box filters across all sections by name/ID.
- Drag files from the OS onto the browser (or onto a scene) to import them.
- Double-click opens the asset in a tab.

## Saving & history (D21)
- Saving is manual (D145): a Save button (Cmd/Ctrl+S) writes the project and a "Saved" toast confirms it; a status shows "Unsaved changes" until then. Going back to the project selector with unsaved changes asks first.
- Undo/redo (Cmd/Ctrl+Z / Shift+Z) across all editors, with at least 200 steps per session.
- If files change on disk outside the editor (e.g. git checkout), reload with a notice.

## Acceptance
- [ ] Create a project, make 3 nested folders, move scenes between them, and restart: the structure persists.
- [ ] Undo restores a deleted hotspot including its rules.
