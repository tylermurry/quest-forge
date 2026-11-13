# Feature inventory

Every feature a game maker or player meets today, grouped the way the app groups them. It is the checklist for
the user manual (docs/manual/): every **Shipped** row must be covered by at least one manual page. Names are
exactly what the app shows on screen.

Status: **Shipped** works today. **Partial** works but something a user would expect is missing (noted).
**Planned** is an open 1.0.0 issue and does not exist yet.

Checked against `main` at 1adb06d plus the docs-split branch, from the code and the editor dev page
(sample project `garden-m1`), on 2026-11-10. Update it when a feature lands or changes.

The manual teaches the mental model in section 0 **before any feature**: what the app does, the core
objects, how they connect, and how a game runs. The owner asked for this. Every feature page then builds on
those terms.

## 0. Concepts and object model

### What the app does

You **describe** a game and the **engine plays** it. Nothing you make is code. A project is a folder of
plain files: settings, scenes, items, characters, dialogues, flags, plus your images and sounds. The editor
edits that description. The same engine runs it in Playtest, inside the editor, and in any browser once you
**Build Game** into one `.quest` file.

The working loop: **make things → give them rules → fix what Problems reports → Playtest → Build Game →
share the `.quest`**.

### The core objects

| Object | What it is | Holds or uses |
|---|---|---|
| **Game** | The whole adventure and its settings. | Title, the player character, where play starts (scene + spawn point), max score, default responses, game rules (Combine, Dialogue ends). |
| **Scene** | One room or screen, always 640 × 400. | A background image, music, a walkable area, depth lines, spawn points, and the things the player meets: objects, placed characters, hotspots, regions. Scene rules (enter, leave). |
| **Object** | A picture placed in a scene: a tree, a key on a table. | An image (or an animation), a position, a baseline, visible or hidden, an optional obstacle, rules. With no name it is scenery the player can't click. |
| **Hotspot** | A clickable area painted into the background: a pond, a window. | A shape, a name the player sees, a walk-to point, rules. |
| **Region** | An invisible area of floor. | A shape, rules that run when the player walks in. |
| **Spawn point** | A named place where the player appears. | A position and a facing. The game's start, and every Change scene, name one. |
| **Walkable area and depth lines** | Where characters can walk, and how big they look at each height. | One outline with holes; a far and a near line, each with a scale. |
| **Character** | A person: the player or anyone else. | A name, text colour, walk speed, and animation slots (walk, talk, idle in four directions). It appears in a scene when **placed** there, with its own rules per scene. |
| **Item** | Something the player can carry. | A name, description and icon. It only exists for the player once a rule gives it. |
| **Dialogue** | A conversation. | A graph of nodes (Line, Choices, Actions, Branch, End). A rule starts it. |
| **Flag / counter** | The game's memory of what has happened. | A flag is true or false; a counter is a whole number. Rules set and test them. |
| **Image / audio** | Imported files. | Images can be sliced into frames. Everything visual or audible points at one. |
| **Rule** | What makes anything happen. | **When** (a trigger) · **If** (conditions, all must be true) · **Do** (actions, in order). |

### How they connect

```
Game ── starts in ──▶ Scene + Spawn point
 │                       │
 │ player ─▶ Character   ├─ Background (Image), Music (Audio)
 │                       ├─ Walkable area, Depth lines, Spawn points
 │                       ├─ Objects ─────────┐
 │                       ├─ Placed characters ├─ each has Rules
 │                       ├─ Hotspots ─────────┤
 │                       ├─ Regions ──────────┘
 │                       └─ Scene rules
 └─ Game rules

Rules point at everything else by ID: items, flags, counters, scenes,
spawn points, characters, dialogues, sounds, animations.
Dialogues hold their own conditions and actions, like rules.
```

- **Names and IDs.** A name is what the player reads ("fishing rod"). An ID (`rod`) is what rules use. Rename
  freely; Change ID… updates every rule that uses it. "Used by" shows every reference.
- **Folders** only organize the Project Browser. They never change how the game plays.

### How a game runs

1. The player picks a **verb** (Walk, Look, Hand, Talk, or an item to Use) and clicks a thing.
2. For Hand, Talk, Use and Walk the player first walks over: to a hotspot's walk-to point, or else the nearest place
   they can stand. Look runs from where the player stands.
3. That thing's rules are checked **top to bottom**. The first rule whose trigger matches and whose
   conditions are all true runs its actions in order. A rule marked Once never runs again.
4. If no rule matches, the game's **default response** for that verb is shown.
5. Combining two items in the inventory runs the **Game's Combine rules** the same way. Walking into a region,
   entering or leaving a scene, and a dialogue ending are triggers too.

### What the game remembers (the game state)

The current scene and the player's position; the inventory; every flag and counter; awards scored; objects
shown or hidden; characters moved; scenes visited; which rules and once-only dialogue options have run; the
music playing. Saves store exactly this. Playtest's state panel shows and edits it live.

## 1. Start screen

| Feature | Where | What it does | Status |
|---|---|---|---|
| New project | Start screen ▸ Game title + Create blank project | Makes a new project folder with a blank game. | Shipped |
| Open folder… | Start screen ▸ Open | Opens an existing project folder. | Shipped |
| Recent projects | Start screen | Lists projects opened before, one click to reopen. | Shipped |

## 2. The main window

| Feature | Where | What it does | Status |
|---|---|---|---|
| Panels | Project Browser (left), Inspector (right), Problems (bottom), editor tabs (middle) | The four areas every task uses. | Shipped |
| Show and hide panels | View ▸ Project Browser (Mod+1), Inspector (Mod+2), Problems (Mod+3), Hide All Panels (Ctrl+\\); title bar buttons | Toggles each panel, or all of them for a bigger canvas. | Shipped |
| Editor tabs | Middle area | Click a scene, item, character, dialogue or image to open it in a tab. | Shipped |
| Save | File ▸ Save (Mod+S); title bar Save; save status | Saving is manual. The title bar shows Unsaved changes / Saving…. | Shipped |
| Unsaved-changes guard | Back to project selector | Asks "Go back without saving?" before losing changes. | Shipped |
| Undo / Redo | Edit ▸ Undo (Mod+Z), Redo (Mod+Shift+Z; Ctrl+Y on Windows/Linux); title bar arrows | Undoes any edit, one labelled step at a time (e.g. "Undo Delete hotspot"), up to 500 steps. | Shipped |
| Delete | Edit ▸ Delete (Backspace / Delete) | Deletes the selected thing. Warns when other things use it. | Shipped |
| Back to Project Selector | File menu (Mod+Shift+W); title bar arrow | Closes the project and returns to the start screen. | Shipped |
| Outside changes | Automatic | Files changed on disk outside the editor are reloaded. | Shipped |
| Help menu | — | Doesn't exist. Issue #17 wants the manual linked from a Help menu. | Planned (#17) |

## 3. Project Browser

| Feature | Where | What it does | Status |
|---|---|---|---|
| Sections | Scenes, Items, Characters, Dialogues, Flags, Audio, Images, Fonts | One tree per kind of thing, with a count. | Shipped |
| Game | Top row, "rules & settings" | A click or Enter opens the Game Settings tab in the center (the Inspector is hidden while it is up): a fixed left menu with General and Styling headings over their sections. | Shipped |
| Search | "Search names and IDs" | Filters every section by name or ID. | Shipped |
| Folders | Section menu ▸ New folder; Rename folder; Delete folder | Organizes any section into folders. | Shipped |
| Create things | Section/folder menu ▸ New scene / item / character / dialogue / flag | Creates one and opens or selects it. Images, audio and fonts are imported instead. | Shipped |
| Rename / Change ID… / Duplicate / Delete | Row menu (…) or right-click | Names are what players see; IDs are what rules use. Change ID updates every reference. Delete lists what will break. | Shipped |
| Move between folders | Drag rows; also from the keyboard | Moves things into folders within the same section. | Shipped |
| Import files… | Images, Audio and Fonts sections; or drop files from the computer | Imports PNG, JPG, WebP images, MP3, OGG, WAV audio and WOFF2/WOFF fonts (checked by their file signature). Other files are refused. A used font is built into the game. | Shipped |
| Details | Inspector when a browser row is selected | Name, ID, type, folder, file path, and **Used by** (every place it is referenced, each a link). | Shipped |
| Listen | Inspector for an audio file | Plays the sound. | Shipped |

## 4. Game settings and game-wide rules

| Feature | Where | What it does | Status |
|---|---|---|---|
| Start | Game Settings ▸ General ▸ Start: Play starts in [scene] at [spawn] | Where a new game begins. | Shipped |
| Score | Game Settings ▸ General ▸ Score: Max score | The total the score counts towards ("0 of 25"). | Shipped |
| Default responses | Game Settings ▸ General ▸ Default Responses | What the narrator says when no rule answers Look, Hand, Talk, Use or Combine. | Shipped |
| Styling tab | Game Settings ▸ Styling: Frames, Typography, Character Dialogue, Inventory, Icon Bar | Five sections under one preview in a resizable pane that stays put: all six samples (Short Narration, Long Narration, Character Speech, Dialogue Choice, Inventory, Icon Bar), switched to the section's own sample on opening (Typography keeps the current one); the game screen fills the pane's height in the game's shape, and Actual game size (shown only when it isn't 640×400) sizes the pane to fit it exactly. | Shipped |
| Icon Bar styling | Game Settings ▸ Styling ▸ Icon Bar: Bar frame (picker, Import image…, the nine-slice editor), seven button pictures, Hover / Active effect (Brighten, Darken) | The bar's own frame and borders, a picture per button (Walk, Look, Hand, Talk, Item, Inventory, Settings) fitted without stretching, built-in icons as the fallback, one effect on the hovered and selected icon only. The Item picture shows while no item is selected. No icon bar section keeps the original look. The preview's Icon Bar sample is the engine's real bar. | Shipped |
| Character Dialogue styling | Game Settings ▸ Styling ▸ Character Dialogue: Name color, Hover effect (Brighten / Darken), Separator color | One name color (pale gold until set) for every speaker in the game; speech text uses the Typography color, and the box outline keeps the character's color unless the shared frame replaces it. Styled choices have no button frame: the hovered or selected row is brightened or darkened with rounded corners, the pointer is a hand, and the separator is a thin line with 8 px above and below, a little wider than the rows. No choices section keeps the original gold buttons and no extra line. The Styling preview places speech, choices and the inventory at the Frames position and width. | Shipped |
| Inventory styling | Game Settings ▸ Styling ▸ Inventory | No settings yet; opening it shows the Inventory sample in the preview. | Partial: settings arrive later |
| Typography | Game Settings ▸ Styling ▸ Typography: Font picker (built-in or imported), Import font…, Text size, Text color, preview | One font, size (6–72 px, 14 px once customised) and color for all game text; no typography keeps the original 10 px look. A character's color stays on their box outline unless the shared frame replaces it. The preview uses the shared frame and the engine's text drawing. | Shipped |
| Text size (player) | Settings ▸ Text size | Players scale all text 75%–200% of the author's size, kept per game in the browser. | Shipped |
| Frames | Game Settings ▸ Styling ▸ Frames: Image picker, Import image…, Use default look, Border size slider, four draggable guides, Scale (8–64 px), Position: Top / Center / Width (%) | One image frames every panel, cut into a nine-slice whose four borders move in lock step (the slider, or any guide for fine tuning). Scale is how thick the borders are drawn; the borders are the only padding. New projects start on the default `Styling/frame.jpg`; Use default look restores it. Position (50 px down, or centred, and a percentage of the screen wide) places narration, speech, the dialogue choices and the inventory, in the game and the preview; until it is changed the game keeps the original placement. The game draws the frame at its Scale on narration, speech, the choices, inventory, Settings, Save/Load, Volume, Text size and the ending box; the fixed-size panels get it drawn around them, so a frame thicker than 24 px can reach over the sides of Inventory and Save/Load. A frame that can't be loaded leaves the built-in look. | Shipped |
| Game title and player character | — | Set when the project is created; the editor can't change either afterwards. | Partial |
| Game rules | Game Settings ▸ General ▸ Rules | Rules that work anywhere: **Combine** two items, **Dialogue ends**. | Shipped |

## 5. Scene editor

### Toolbar and Scene menu

| Feature | Where | What it does | Status |
|---|---|---|---|
| Select / Move Tool | V | Select, drag things and points. Drag a point to move it, Alt-click to delete it, double-click an edge to add one. | Shipped |
| Polygon Tool | P | Click points to draw a shape. Finish Shape (Enter), Cancel Shape (Escape). | Shipped |
| Rectangle Tool | R | Drag a rectangle shape. | Shipped |
| Spawn Point Tool | S | Places a spawn point (where the player appears) with a facing. | Shipped |
| Walk-to Point Tool | W | Click a hotspot, then where the player stands to use it; drag to set the facing. | Shipped |
| What a shape becomes | Depends on the active layer | Walkable: outline, then holes. Hotspots: a new hotspot. Regions: a new region. Objects: the selected object's obstacle. | Shipped |
| Snap to Vertices and Edges | Scene menu; toolbar | Snaps points to nearby shapes. | Shipped |
| Zoom | Zoom In (Mod+=), Zoom Out (Mod+-), Zoom to Fit (Mod+0), Actual Size (1×); floating Zoom bar beside the tool bar | Zooms the canvas. Space-drag and the mouse wheel pan and zoom. | Shipped |
| Aids | Toolbar toggles | Depth preview (ghost of the player), Path preview from the default spawn, Shade the walkable area. | Shipped |

### Layers panel

| Feature | Where | What it does | Status |
|---|---|---|---|
| Layers | Guides, Regions, Hotspots, Walkable, Objects, Background | Every thing in the scene, by layer. Clicking a layer makes it active, which picks what the tools draw. | Shipped |
| Show / lock layers | Eye and lock icons per layer | Hides a layer or stops it being clicked on the canvas. | Shipped |
| Draw order | Drag objects in the Objects layer; also from the keyboard | Changes which object draws in front. | Shipped |
| Delete from the list | Bin icon per row | Deletes that thing. | Shipped |

### Things in a scene (Inspector ▸ Details)

| Feature | Where | What it does | Status |
|---|---|---|---|
| Scene | Click empty canvas | Name, Background (image or None (black)), Music (or None (keep what's playing)). | Shipped |
| Background | Drop an image on the canvas, or choose one | The scene's painting. | Shipped |
| Walkable area | Walkable layer | Where characters may walk: one outline with holes. Characters path around holes and obstacles. | Shipped |
| Depth lines | Guides ▸ Far line, Near line | Characters scale between the far and near lines' scales by where their feet are. | Shipped |
| Spawn points | Guides layer | Named places the player appears (scene start, Change scene). Position and facing. | Shipped |
| Hotspots | Hotspots layer | Clickable areas with a name shown to the player, a walk-to point and rules. | Shipped |
| Regions | Regions layer | Invisible areas that run rules when the player walks in. | Shipped |
| Objects | Drop an image from the browser or the computer onto the canvas | A picture in the scene: name (empty = scenery the player can't click), image, position, Visible when the scene starts, Baseline (automatic or set), obstacle (Add obstacle), animations, rules. | Shipped |
| Placed characters | Drop a character from the browser onto the canvas | Where the character's feet are, its facing, visible or hidden, rules. One placement per character per scene. | Shipped |
| Baseline | Objects (characters use their feet) | The line that decides who draws in front: lower baselines draw in front. | Shipped |
| Scene rules | Scene ▸ Rules | **Player enters the scene**, **Player leaves the scene**. | Shipped |

## 6. Items, characters and images (tabs)

| Feature | Where | What it does | Status |
|---|---|---|---|
| Item | Item tab | Name, Description, Icon (an image). | Shipped |
| Character | Character tab | Name; animation slots. Text colour and walk speed are shown but can't be edited in the editor. | Partial |
| Image slicing | Image tab | Single image, or slice a spritesheet by Frame size or Rows × columns. Frame preview. | Shipped |
| Origin | Image tab ▸ Set origin / Reset origin | The point of the image that sits on the ground (the feet). | Shipped |
| Character animation slots | Character tab | Walk, talk and idle in four directions: pick image, frames ("Take a row"), frames per second, loop or play once, mirror left from right or draw left separately. Live preview. | Shipped |
| Object animations | Object ▸ Details | A looping animation, plus named one-shot animations that rules play with **Play animation**. | Shipped |
| AI-generated sprite animation | — | Idea board, proof of concept only. | Planned (#36) |

## 7. Rules (Inspector ▸ Rules)

| Feature | Where | What it does | Status |
|---|---|---|---|
| Who has rules | Objects, placed characters, hotspots (Look, Hand, Talk, Walk, Use); regions (Player walks in); scenes (enter, leave); Game (Combine, Dialogue ends) | | Shipped |
| Quick text | Rules tab ▸ Look text, Hand text, Talk text | One box per verb for the common case of "just say something". | Shipped |
| Rule order | "Checked top to bottom: the first rule that matches runs." Drag or keyboard to reorder | | Shipped |
| Rule card | When [trigger] · If [conditions] · Do [actions] | Rules read as sentences built from dropdowns and pickers. | Shipped |
| Once | Toggle per rule | The rule only ever runs once. | Shipped |
| Duplicate / delete rule | Rule menu | | Shipped |
| Pickers with create | Every picker | Search, or "Create … and use it" for a new item, flag, counter, character, etc. in one step. | Shipped |
| Pick on canvas | Point fields | Click the scene to place a point (needs the scene open in a tab). | Shipped |
| Conditions | Player has · Player doesn't have · Flag is true/false · Counter =, ≠, <, > · Visited [scene] · Object in scene is visible/hidden · First time | | Shipped |
| Actions: Text | Narrate · Say | | Shipped |
| Actions: Movement | Walk player to · Walk character to · Face · Change scene | | Shipped |
| Actions: Items | Give item · Take item | | Shipped |
| Actions: State | Set flag · Add to counter · Award points | | Shipped |
| Actions: World | Show object · Hide object · Play animation · Move character to | | Shipped |
| Actions: Audio | Play sound · Play music · Stop music | | Shipped |
| Actions: Flow | Start dialogue · Wait · Die · Win the game | | Shipped |
| Flags and counters | Flags section; pickers | A flag is true/false, a counter a whole number. New flags from the browser are true/false and start false; counters can only be made from a counter picker. Neither's starting value can be changed in the editor. | Partial |
| Close-up actions | Open/close a close-up | | Planned (#21) |

## 8. Dialogue editor

| Feature | Where | What it does | Status |
|---|---|---|---|
| Graph | Dialogue tab | Nodes joined by ports. Minimap, Auto-Layout, Fit Graph in View. | Shipped |
| Node types | Start · Line · Choices · Actions · Branch · End | Start: where it begins. Line: a speaker says a line, with an animation while speaking. Choices: options the player picks; each can have Show if… conditions and be once-only. Actions: runs actions. Branch: true/false on conditions. End: ends the dialogue. | Shipped |
| Making nodes | Drag from a port to empty space ▸ Create node | Adds and connects a node. Connect / disconnect from the keyboard too. | Shipped |
| Starting and ending | Start dialogue action; Game rule Dialogue ends | A rule starts a dialogue; when it ends, the Game's Dialogue ends rule for it runs. | Shipped |
| Play from This Node | Play menu (Shift+F6) | Playtests starting at the selected node. | Shipped |

## 9. Problems panel

| Feature | Where | What it does | Status |
|---|---|---|---|
| Problems | Bottom panel | Every error and warning in plain English. Click one to jump to the exact thing and field. | Shipped |
| Errors vs warnings | Errors / Warnings filters | Errors block Play and Build Game; warnings don't (e.g. a scene nothing leads to, an item never given). | Shipped |
| Inline markers | Rule cards, layers, inspector fields | The broken part is marked where you edit it. | Shipped |

## 10. Playtest

| Feature | Where | What it does | Status |
|---|---|---|---|
| Play | Play menu ▸ Play (F5); title bar Play | Runs the game inside the editor from the start. | Shipped |
| Play from Here | F6; Play button menu | Starts in the open scene. | Shipped |
| Start from preset | Play button menu | Starts from a saved game state. | Shipped |
| Restart / Restart Scene / Stop | Play menu; title bar | Restart from where the run started; restart the current scene; Stop (Shift+F5). | Shipped |
| Changed since start | Restart button | Shows when the project changed during the run. | Shipped |
| Debug layers | Playtest toolbar | Draws Walkable, Hotspots, Regions, Baselines, Path over the game. | Shipped |
| State panel | Left of the game | See and change live: Scene (go to), Inventory (add/remove), Flags and counters, Score (awards), Dialogue playing and once-only options, Visited scenes. | Shipped |
| Presets | State panel ▸ Presets ▸ Save state | Saves the current state by name ("Before cave") to start from later. | Shipped |
| Event log | Below the game | Clicks, rules and actions in plain English as you play, with links to the rule. | Shipped |

## 11. Build Game

| Feature | Where | What it does | Status |
|---|---|---|---|
| Build Game… | File menu (Mod+B) | Checks for errors, then saves the whole game as one `.quest` file. | Shipped |

## 12. The game as players see it

| Feature | Where | What it does | Status |
|---|---|---|---|
| Icon bar | Move the mouse to the top, or tap the tab on touch | Walk, Look, Hand, Talk, the current item, Inventory, Settings, and the score. The maker can set its frame, button pictures and hover / active effect. | Shipped |
| Verbs | Icon bar; right-click cycles verbs | Click the scene with the current verb. For everything but Look the player walks over first. | Shipped |
| Labels | Hover, or tap and hold on touch | Shows the name of what's under the pointer. | Shipped |
| Text | Narration and speech boxes | Click anywhere to skip. | Shipped |
| Inventory | Icon bar ▸ Inventory | Look at an item, pick one to use, combine two. | Shipped |
| Dialogue choices | List box | The player picks what to say. | Shipped |
| Settings | Icon bar ▸ Settings | Restart, Save, Load, Volume (Music and Sound effects), Text size. | Shipped |
| Saves | Settings ▸ Save / Load | Ten save slots, kept in the browser. Old saves still load after the game is updated. | Shipped |
| Death | Die action | "You have died" with Try again (back to the scene's start), Restore, Restart. | Shipped |
| Winning | Win the game action | "You won!" | Shipped |
| Touch | Phones and tablets | Every control is at least 44 px; no hover needed. | Shipped |
| Game skins | — | Restyle the game's chrome with your own images. | Planned (#20) |

## 13. Sharing and playing

| Feature | Where | What it does | Status |
|---|---|---|---|
| Play on the website | /play ▸ Choose a .quest file | Plays any `.quest` file in a browser, desktop or phone. | Shipped |
| Download the editor | Site home page | Installers for macOS, Windows and Linux. | Shipped (installers checked by #16) |

## 14. Planned for 1.0.0, not built yet

| Issue | Feature |
|---|---|
| #21 | Close-up overlay scenes |
| #20 | Full image skins for the game's chrome |
| #19 | MCP server in the running editor (AI tools driving the editor) |
| #36 | Sprite Studio, AI-generated sprite animation (proof of concept) |
| #17, #18 | This user guide: getting started, and the complete reference |
