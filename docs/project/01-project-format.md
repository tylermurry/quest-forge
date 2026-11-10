# 01 — Project Format

**North Star:** see [README](README.md). Decisions: D12, D13, D14, D22.

## Purpose
Define how a project is stored on disk. Only the editor writes these files. They are readable YAML so git diffs and disaster recovery work, but users are never asked to edit them.

## Layout
```
my-game/
  game.yaml                 # title, start scene + spawn, player character, max score, default responses
  flags.yaml                # named flags (bool) and counters (int) with initial values
  scenes/
    <any folders>/
      <scene-id>.scene.yaml
  items/<any folders>/<item-id>.item.yaml
  characters/<any folders>/<char-id>.character.yaml
  dialogues/<any folders>/<dlg-id>.dialogue.yaml
  assets/
    images/…  audio/…        # imported files, copied into the project
  .editor/                  # editor UI state only (open tabs, zoom). Never game data. Gitignored.
```

## Rules
- Every asset has a stable `id` (slug, unique per asset type), set on creation and editable only through the "Rename" command, which updates all references.
- References point at IDs, never at file paths. Moving a file between folders changes nothing else (D22).
- Folder structure is purely organizational and mirrored directly in the project browser.
- Every file has `schemaVersion: 1`. The editor migrates older versions on open.
- Geometry (polygons, points) is stored as integer pixel coordinates in 640×400 scene space.

## Scene file (shape)
```yaml
schemaVersion: 1
id: beach
name: Sunny Beach
background: assets/images/beach.png
music: beach_theme            # audio id, optional
depth: { far: { y: 180, scale: 0.4 }, near: { y: 390, scale: 1.0 } }
walkable: { outer: [[x,y], …], holes: [[[x,y], …]] }
spawns: { default: { x: 320, y: 360, facing: down }, from_path: { … } }
objects:                      # ordered = layer order
  - { id: palm, image: …, x: 40, y: 0, baseline: 300, visible: true, obstacle: [[x,y],…] }
hotspots:
  - { id: shell, name: "seashell", shape: [[x,y],…], walkTo: { x, y, facing }, rules: [ … ] }
regions:                      # walk-into triggers (D41)
  - { id: exit_north, shape: […], rules: [ … ] }
rules: [ … ]                  # scene-level: on enter / on exit
```

## Acceptance
- [ ] Round-trip: load → save produces byte-identical files.
- [ ] Moving a scene to another folder changes only that file's path.
- [ ] Renaming an item ID updates every referencing rule across the project.
