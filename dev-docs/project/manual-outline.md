# User manual outline

Every page of the user manual (`docs/manual/`), what it is for, and which rows of
[feature-inventory.md](feature-inventory.md) it covers. Every **Shipped** row is covered at least once. Write
pages to [manual-style.md](manual-style.md).

## Pages

| # | Page | Purpose |
|---|---|---|
| | **Home** (`index.md`) | What Quest Forge is, who the manual is for, and how it's organized. |
| **C** | **Concepts** | |
| C1 | How Quest Forge works | You describe a game and the engine plays it; a project is a folder; the working loop; the editor window at a glance. |
| C2 | The building blocks | Every core object, what it holds, how they connect (diagram); names vs IDs; folders. |
| C3 | Rules: how a click becomes an action | Verbs, walking over, When / If / Do, top to bottom, first match, Once, default responses, the other triggers (diagram). |
| C4 | What the game remembers | The game state: what changes during play, what a save keeps, what Playtest shows. |
| C5 | From editor to player | Problems, Playtest, Build Game, the `.quest` file, playing on the website (diagram). |
| **G** | **Guides** | |
| G1 | Start and save a project | New project, open a folder, recent projects, saving, undo and redo, the panels. |
| G2 | Organize your project | The Project Browser: sections, folders, search, create, rename, change ID, duplicate, delete, import, Used by. |
| G3 | Build a scene | Background, walkable area and holes, depth lines, spawn points, objects, baselines and draw order, obstacles, layers, tools, snapping, zoom, aids, where play starts. |
| G4 | Make things interactive | Hotspots, names, walk-to points, quick text, your first rules, rule order and Once, regions, scene enter and leave, default responses. |
| G5 | Puzzles with items | Items, giving and taking, Use with, Combine, flags and counters, conditions, score and awards, showing and hiding objects, changing scene, dying and winning. |
| G6 | Characters and animation | Slicing images and the origin, character animation slots, placing characters, Say, moving and turning characters, object animations, Play animation. |
| G7 | Conversations | Dialogues: the graph and node types, options and Show if, once-only options, branches, starting a dialogue, Dialogue ends, Play from This Node. |
| G8 | Sound and music | Importing audio, listening, scene music, Play sound, Play music, Stop music. |
| G9 | Test your game | The Problems panel, Play, Play from Here, presets, Restart, debug layers, the state panel, the event log. |
| G10 | Share your game | Build Game, the `.quest` file, playing it on the website, what players can do. |
| **R** | **Reference** | |
| R1 | Menus and keyboard shortcuts | Every menu command and shortcut, both platforms. |
| R2 | Start screen and main window | Start screen, panels, tabs, title bar, saving, undo. |
| R3 | Project Browser | Sections, Game row, search, folder and row menus, import, the Inspector's details for a browser entry. |
| R4 | Game settings | Start, Score, Default responses, game rules. |
| R5 | Scene editor | Toolbar tools, what each tool draws on each layer, snapping, zoom, aids, the Layers panel. |
| R6 | Scene things | Inspector fields for the scene, objects, placed characters, hotspots, regions, spawn points, walkable area and depth lines. |
| R7 | Items, characters and images | The item tab, character tab and animation slots, the image tab (slicing, origin), object animations. |
| R8 | Rules | The rule card, quick text, rule order, Once, duplicate and delete, pickers and Create … and use it, Pick on canvas, who has which triggers. |
| R9 | Triggers | One entry per trigger. |
| R10 | Conditions | One entry per condition. |
| R11 | Actions | One entry per action, in the app's groups (Text, Movement, Items, State, World, Audio, Flow). |
| R12 | Dialogue editor | The graph, node types and their fields, ports, creating and connecting nodes, Auto-Layout, Fit Graph in View. |
| R13 | Problems panel | Errors and warnings, filters, jumping to the problem, inline markers. |
| R14 | Playtest | Play modes, Restart, Stop, debug layers, the state panel, presets, the event log. |
| R15 | Build Game and `.quest` files | Build Game, what's in the file, playing it on the website. |
| R16 | The game as players see it | Icon bar, verbs and right-click, labels, text, inventory, dialogue choices, settings, saves, death, winning, touch. |

Files: `docs/manual/01-concepts/`, `02-guides/`, `03-reference/`, numbered in the order above (e.g.
`01-concepts/02-building-blocks.md`).

## Coverage

Each inventory section's **Shipped** rows, and the pages that cover them. **Partial** rows are covered for the
part that works (see the style guide's Scope). **Planned** rows aren't covered.

| Inventory section | Rows | Pages |
|---|---|---|
| 0. Concepts | What the app does · core objects · how they connect · how a game runs · game state | C1–C5 |
| 1. Start screen | New project · Open folder… · Recent projects | G1, R2 |
| 2. Main window | Panels · Show and hide panels · Editor tabs · Save · Unsaved-changes guard · Undo / Redo · Delete · Back to Project Selector · Outside changes | C1, G1, R1, R2 |
| 3. Project Browser | Sections · Game · Search · Folders · Create things · Rename / Change ID… / Duplicate / Delete · Move between folders · Import files… · Details · Listen | C2, G2, G8, R3 |
| 4. Game settings | Start · Score · Default responses · Game rules | C3, G3, G4, G5, R4 |
| 5. Scene editor: toolbar | Select / Move · Polygon · Rectangle · Spawn Point · Walk-to Point · What a shape becomes · Snap · Zoom · Aids | G3, G4, R1, R5 |
| 5. Scene editor: layers | Layers · Show / lock · Draw order · Delete from the list | G3, R5 |
| 5. Scene editor: things | Scene · Background · Walkable area · Depth lines · Spawn points · Hotspots · Regions · Objects · Placed characters · Baseline · Scene rules | C2, G3, G4, G6, R6 |
| 6. Tabs | Item · Character (name and animation slots) · Image slicing · Origin · Character animation slots · Object animations | G5, G6, R7 |
| 7. Rules | Who has rules · Quick text · Rule order · Rule card · Once · Duplicate / delete · Pickers with create · Pick on canvas · every condition and action group · Flags and counters (creating them, using them) | C3, G4, G5, G6, G8, R8–R11 |
| 8. Dialogue editor | Graph · Node types · Making nodes · Starting and ending · Play from This Node | G7, R12, R14 |
| 9. Problems | Problems · Errors vs warnings · Inline markers | C5, G9, R13 |
| 10. Playtest | Play · Play from Here · Start from preset · Restart / Restart Scene / Stop · Changed since start · Debug layers · State panel · Presets · Event log | C4, C5, G9, R1, R14 |
| 11. Build Game | Build Game… | C5, G10, R15 |
| 12. Game as players see it | Icon bar · Verbs · Labels · Text · Inventory · Dialogue choices · Settings · Saves · Death · Winning · Touch | C3, C4, G10, R16 |
| 13. Sharing | Play on the website · Download the editor | C5, G1, G10, R15 |

Not covered by decision: **Help menu**, **Game title and player character** (can't be changed in the editor),
**close-ups**, **game skins**, **MCP server**, **Sprite Studio**. Pages are added when those ship.
