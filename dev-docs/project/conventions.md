# Conventions and package maps

How the code is organised and the rules for working in it. Read the section for the package you are
changing before you start. When a change alters something described here, update this page in the same
change.

## Working in the repo

- Run pnpm through corepack: `corepack pnpm install`, `corepack pnpm check` (typecheck + tests).
  `corepack pnpm test` runs all Vitest projects. Tests live in `packages/*/test/*.test.ts`.
- TypeScript strict + `noUncheckedIndexedAccess`. Internal packages export `src/*.ts` directly,
  with no build step. Import with `.ts` extensions.
- One ticket ≈ one commit, with tests. Commit messages are imperative and explain why.
- GitHub (`tylermurry/quest-forge`, public): `.github/workflows/ci.yml` checks PRs; on every push to `main`, `site.yml`
  deploys the site (secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and `release.yml` builds all three
  platforms and publishes `vX.Y.Z` (latest tag + 1 patch, never committed). Installer file names are fixed: the site
  links to them, so change both together. `.github/actions/setup` is the shared Node/corepack/install step.

## Schema (`packages/schema`)

- Schemas are strict (unknown keys are errors) and use no zod defaults, so parsing never
  invents keys and round-trips stay byte-identical. Optional fields are omitted when unset.
- Project files are only ever written by the canonical serializer (`serialize.ts`). Test fixtures
  must be in canonical form. The round-trip test enforces this.
- Problems (validation) carry `severity`, `code`, a plain-English `message`, a `breadcrumb`, and
  a jump-to `location` (`file` + data `path`).
- Schema package map: `common/assets/flags/item/character/rules/game/scene/dialogue.ts` (schemas; `dialogue.ts` also has the
  graph helpers `nodePorts` (ports `next` / `then` / `else` / `option:<id>`), `reachableNodes` and `silentLoops`),
  `style.ts` (the optional game-wide `style` in `game.yaml`: schemas, `LEGACY_STYLE` and `AUTHOR_DEFAULTS`, the one
  `resolveStyle` the engine and editor read, `frameInsetProblems`; an absent style or section resolves to today's look, except `speech.name`, one pale-gold name colour for every speaker either way; `sharedFrame.scale`, `narration` (top / center / width %) and the frame are editor-preview only until the engine draws frames),
  `project.ts` (load, `planSave`/`saveProject`, `moveAsset`), `references.ts` (reference index,
  `renameId`, `renameSceneId` for objects/spawns/hotspots/regions), `validate.ts` + `geometry.ts` (blocking errors), `warnings.ts` (non-blocking
  warnings and empty rule text; `logicBlocks` walks every rule and dialogue node, `awardTotal`), `migrate.ts`
  (`MIGRATIONS`; v2 gives rules IDs, `withRuleIds` also builds test data), `zip.ts` (dependency-free zip read/write) and
  `quest.ts` (the built game: `compileGame`, `buildQuest`, `readQuest`, `usedAssetIds`).
  Font assets (WOFF2/WOFF, `assets/fonts/`) are an optional `fonts` list in `assets.yaml` (absent until the first
  import, so older files are unchanged), the `font` `RefKind` (counted from `style.typography.font`) and a
  `FolderSection`; they follow images and audio through rename, `planSave` moves and Build Game. The test fixture project is
  `packages/schema/test/fixtures/mini`. It must stay canonical and problem-free (no warnings either). To change it, load it,
  edit the Project and save it with `saveProject` (a throwaway script), never by hand.
- Rules have a required `id` (`rule_<n>`, unique within the list, never shown); fired keys are `<owner>/<id>`. Rule
  text (`narrate`/`say`/`die`) may be `""` (an `empty_text` error). Tests that mean "valid" check errors only
  (`errorsIn` in editor tests); warnings have their own tests in `schema/test/warnings.test.ts`.
- Schema project model: `Project` splits content (docs, `folders`, `pendingFiles`) from disk state
  (`files`, `saved`, `savedFolders`, `trash`). Undo swaps content and keeps disk state (`withDiskState`).
  `planSave` also creates/removes section folders (empty ones get a `.keep`) and moves image/audio
  files to follow `assets.yaml` (moves, `.editor/trash`, pending imports). `ProjectFs` has folder and
  binary operations (`listFolders`, `writeBytes`, `move`, `makeFolder`, `removeFolder`, `removeTree`).

## Engine (`packages/engine`)

- Engine package map (`packages/engine/src`): `nav.ts` (visibility graph + A*, obstacles), `depth.ts`
  (scale lerp, baseline sort), `sprite.ts` (sheet slicing, origin, mirroring, slot fallback),
  `viewport.ts` (letterbox transform picked in CSS px, 60 Hz `FixedStep`), `world.ts` (one scene's
  simulation: movement, actors, hit-test, approach points), `state.ts` (the serializable `GameState`),
  `rules.ts` (conditions, first-match, rule keys, default responses), `sequence.ts` (action runner
  behind a `SequenceHost`), `dialogue.ts` (`DialogueRun`: walks a dialogue graph; once/first-time keys by
  stable IDs; endings), `session.ts` (a game being played: state, verbs, scene changes, regions,
  text, the dialogue playing and its `choices`), `ui/` (`textbox.ts` layout and timing, `layout.ts` 44 CSS px controls
  and `choiceLayout` for the dialogue list box, and the Frames position: `placementOf(game.style)` gives the
  `Placement` (top and width from `style.narration`) that `layoutTextBox`, `choiceLayout` and `computeLayout` put
  narration, speech, the choices and the inventory at, centred across via `placeAt`; null, when `game.yaml` has no
  `narration` section, keeps the legacy layout (narration above the middle, speech over the speaker, choices at the
  bottom, a centred 600 px inventory), `controller.ts` pointer input → bar/inventory/list box/session,
  `nineslice.ts` nine-slice tile geometry (`nineSliceTiles`), `typography.ts` (the one place the text look is decided:
  `textStyle(game.style, family, playerPercent)` gives the font family, size, line height and colour; the legacy
  10 px look when `game.yaml` has no typography; `shrinkToFit`, the 1-px-at-a-time shrink that keeps text on screen
  and inside its control, never below the legacy size; `Measure`, the injected text measurer), `icons.ts` + `draw.ts` drawing, including
  `drawNineSlice`, `drawIconBar` (the icon bar: its own frame, each button's picture aspect-fit via `fitInside`, built-in icons as the fallback;
  `BarState` is the session part, so the editor's Icon Bar preview draws the same bar; with the `none` legacy effect it is the original look
  and with Brighten / Darken the effect marks the hovered and selected icon only, using `shadedImage`, a copy made once per image and effect), `drawText` (every line of text, the editor's Styling preview too), `drawChoiceBox` / `drawChoiceRows` (the dialogue list box; the rows draw the optional separator at the top of the choices region, `separatorRect` in `layout.ts`, and fill the hovered row with the highlight; `ChoicesView` is the session part, so the editor's Dialogue Choices preview draws the same rows) and `canvasMeasure`), `choices.ts` (pure: `choicesLook(game.style)` gives the highlight, separator and whether the author styled Dialogue Choices, the legacy look having no separator line of its own; `legibleInk` picks black or white by WCAG contrast for the highlighted row's text), `render.ts` (Canvas 2D),
  `game.ts` (`createGame`, image cache, DOM glue), `trace.ts` (playtest trace events), `debug.ts` (debug layer
  shapes), `restore.ts` (`readState`/`sanitizeState`: any stored GameState made safe for the project, shared by
  save slots and playtest presets), `saves.ts` (`SaveSlots` over a `KeyValueStore`, volumes and the player's Text Size 75–200%, `MemoryStore` for tests), `audio.ts` (`AudioSync`: music follows `state.music`, `session.sounds` drained; `sceneAudioIds`),
  `webaudio.ts` (the Web Audio backend, unlocked from pointer events), `quest.ts` (`loadQuest`: a `.quest` file →
  a `ProjectBundle` with blob asset URLs, `font/woff2` and `font/woff` types), `styleassets.ts` (DOM-free: which
  style images to preload, `loadStyleAssets` with injected loaders, the font-family fallback). `createGame` preloads the
  skin's images and registers the custom font with `FontFace` on the canvas's own document before the session starts;
  a failure logs a warning and falls back. `Game.fontFamily` is the CSS family text should use. `Session.load(state)` restores a save
  exactly (no `scene_enter`); `Session.tryAgain()` returns to the scene-entry snapshot.
  Keep logic in `session.ts`, `world.ts` and `ui/controller.ts`/`layout.ts` so it stays testable in Node.
  Only `game.ts`, `render.ts`, `webaudio.ts`, `ui/draw.ts` and `ui/icons.ts` touch the canvas, DOM or Web Audio.
- Everything that must survive a scene change or a save lives in `GameState` as plain JSON.
  UI state (current item, open panels) stays out. Fired rules are keyed by `<owner>/<rule id>`, never by position.
- New actions/conditions: handle them in `sequence.ts` / `rules.ts` (exhaustive switches), and give any
  stubbed one a GitHub issue.
- Session tests build projects with `test/support/project.ts` (real schemas, in memory).
  Wait for arrivals with a helper, not a fixed time: text boxes close by themselves.
- The engine imports every data shape from `@questforge/schema`. Never redefine a schema type.
  Engine math uses `Vec` (`vec.ts`), which may be fractional; on-disk geometry stays integer.
- Engine fixture: `packages/engine/fixtures/m1` is generated by `scripts/build-m1-fixture.ts`
  (`corepack pnpm --filter @questforge/engine fixture`). Edit the script, not the YAML or PNGs.
  `test/fixture.test.ts` checks it's canonical and problem-free (except the dev-only stress scene's `scene_unreachable`
  warning) and plays the puzzle chain
  (garden + shed), the shop (coin under the workbench, the visitor's `shop` dialogue in the shed) and the save /
  death / Try again / Restore loop (the saw in the shed) with touch taps only. Its audio is generated 8-bit WAV.
- Dev page: `corepack pnpm --filter @questforge/engine dev` (Vite, port 5174, also `engine-dev` in
  `.claude/launch.json`; `engine-dev-alt` uses another port when 5174 is taken). `window.game` exposes
  the running game (`game.session`, `game.ui`, `game.audio`) for debugging. Saves and volumes go to the page's
  localStorage (`questforge/<gameId>/…`); pass `storage` to `createGame` to change that. Browser-tool clicks are mouse events:
  test touch by dispatching `PointerEvent`s with `pointerType: "touch"` on the canvas.

## Editor (`packages/editor`)

- Editor package map (`packages/editor/src`): `model/` is DOM-free and holds all logic: `browser.ts`
  (section trees, search), `commands.ts` (pure Project → Project browser commands, reference summaries),
  `history.ts` (undo snapshots, merge keys, 500 steps), `editor.ts` (`Editor`: project + history +
  autosave + save errors + outside-change reload), `workspace.ts` (tabs, selection, expanded folders; UI
  state, never undone), `gameSettings.ts` (the Game Settings tab's areas and subsections), `style.ts` (pure typography commands `setTypographyFamily` / `setTypographyFont` / `setTypographySize` / `setTypographyColor` — the first one creates the section — and pure frame commands `setFrameImage` / `setFrameInsets` / `applyBuiltInFrame` (the default `Styling/frame.jpg`, which new projects get from `template.ts`) that take `which: "sharedFrame" | "iconBar"` so the Icon Bar reuses them, `setIcon` / `setIconEffect` for the icon bar's pictures and effect, `setChoiceHighlight` / `setChoiceSeparator` (the first one creates the section) and `setSpeechNameColor` for Character Dialogue, `setFrameScale`, `setNarrationTop` / `setNarrationCenter` / `setNarrationWidth`, lock-step border math (`uniformInsets`, `dragGuide`, `nudgeGuide`, at most `maxBorder` so a centre always remains), `insetWarnings`), `stylePreview.ts` (where the Styling preview's sample panels and text go, given a text measurer and size: narration at the style's top and width, the others fitting their content in the upper third; the drawn borders, `frameScale` from the frame's `scale`, are the only padding; panels shrink the text to stay on the 640×400 screen; the samples, Icon Bar included, and `SECTION_SAMPLE`), `builtInFrame.ts` (the default frame picture's bytes, `assets/frame.jpg` inlined by Vite), `actions.ts` (UI intents → one labelled undo step each), `importing.ts` (images, sounds and fonts; a font must start with its format's signature),
  `template.ts` (blank project) + `png.ts`, `locate.ts` (jump-to), `recent.ts`, `appCommands.ts`
  (File/Edit/View command registry + shortcuts). `platform/` adapts the host: `platform.ts`
  (interface), `browser.ts` (dev page, HTTP to the sandbox), `tauri.ts` (typed Rust commands + native
  menu), `bindings.ts` (generated). `ui/` is thin React that only calls `Actions`/`Editor`/the registry.
  Rust lives in `src-tauri/` and does only file I/O confined to the project folder, watching, recent
  projects and dialogs.
- Editor UI stack: Tailwind v4 (tokens in `ui/styles.css`, dark only), shadcn/ui components copied
  into `ui/components/ui` (add more with `corepack pnpm dlx shadcn@latest add <name>` from
  `packages/editor`, with a `pnpm` shim on PATH; then fix any `from "cn"` import to `@/ui/lib/utils`),
  lucide icons, react-resizable-panels, dnd-kit for in-app drags, react-colorful (only through `ui/ColorField.tsx`, the one
  color control; not the native `<input type="color">`). Prefer shadcn/Radix over hand-rolled
  menus or dialogs. Radix menus are portaled but React still bubbles their events to the trigger's
  ancestors: stop propagation on menu content. Use `cn()` for class merging and `@/` imports only in
  shadcn files.
- App commands: add to `COMMANDS` in `model/appCommands.ts` and register a handler where the state
  lives (`App` for File, `Workspace` for Edit/View). The app's native menu and the dev page's
  shortcuts both run the registry; never add a separate keydown handler.
- Run every editor change as `editor.apply(label, p => command(p), mergeKey?)`; commands throw
  `CommandError` with a plain-English message, which becomes a notice. Typing fields pass a merge key
  and call `history.breakMerge()` on blur.
- Editor tests: model tests in Node with `test/support/fixtures.ts` (`m1Project()`, `m1Copy()`); thin
  component tests are `.tsx` files starting with `// @vitest-environment jsdom`. Never write to
  `packages/engine/fixtures/m1` from the editor; use a copy.
- Editor dev page: `corepack pnpm --filter @questforge/editor dev` (Vite with `--configLoader runner`,
  port 5175, `editor-dev` in `.claude/launch.json`). It edits real folders in the gitignored
  `packages/editor/.sandbox/` through `dev/sandbox.ts`, seeded with a copy of the m1 fixture
  (`garden-m1`); delete a sandbox folder to reset it. `window.editor` exposes the open `Editor`.
  In-app drags use dnd-kit, so the browser tool's `left_click_drag` works on tree rows. Component tests
  drag with pointer events after giving rows a `getBoundingClientRect` (see `browser-ui.test.tsx`);
  Radix menus need `@testing-library/user-event`. jsdom polyfills live in `test/support/setup.ts`.
- Saving is manual in the app: `Editor.open(host, { autosave: false })`, Save = `editor.flush()`, and `App` confirms before leaving with `hasUnsavedChanges`. The model default is still autosave on, which most Editor tests rely on.
- Validation is debounced: `Editor.problems` is the last result, refreshed 250 ms after a change. Tests call
  `editor.validateNow()` instead of waiting. Browser-tool clicks by `ref` may scroll the page first; prefer coordinates or a
  JS `click()` when testing popovers. Radix dropdowns open from the keyboard in jsdom (`focus()` + `{Enter}`).
- Tauri app: needs Rust (rustup). `corepack pnpm --filter @questforge/editor tauri dev` runs the
  editor in a native window (it starts the Vite dev server itself); `tauri build` makes the bundle.
  Rust unit tests: `cargo test --manifest-path packages/editor/src-tauri/Cargo.toml`; this also
  regenerates `src/platform/bindings.ts` (tauri-specta), so commit it after changing a command.
  New commands need `#[specta::specta]` and an entry in `specta_builder()`.

### Scene editor

- Scene editor: DOM-free logic in `packages/editor/src/model/scene/`: `view.ts` (zoom/pan
  transform, pixel snap, grid threshold), `sceneUi.ts` (per-scene layer/tool/snap/aids/zoom state in
  `ws.sceneUi`, saved to `.editor/view.json`, never undone), `things.ts` (`ThingRef` = `{ list, key }`
  selection keys, Layers panel rows, draw order), `shapes.ts` (every polygon as a `PolyRef`), `snap.ts`,
  `hit.ts` (click order), `commands.ts` (pure scene commands), `problems.ts` (validation problems
  by thing), `frame.ts` (what one canvas frame shows), `controller.ts` (`SceneController`: zoom/pan,
  drafts, delete, frame) and `tools.ts` (`SceneTools`: Select/Move, Polygon, Rectangle, Spawn, Walk-to,
  drops, reorder, ghost/path aids). Drags call `preview(label, run)` and `commit()` on release, so a drag is
  one undo step and an unclosed polygon never enters history.
  UI in `ui/scene/`: `SceneEditor.tsx` (two floating bars at the bottom of the canvas, Scene tools then Zoom, and no top bar; Layers panel whose headers are `ui/SectionHeading.tsx`, the Project Browser's section header without its chevron, the active layer outlined and the whole layer clickable, registry handlers), `SceneCanvas.tsx`
  (forwards pointer/wheel/space input, counts clicks itself), `draw.ts` (the only canvas drawing: engine
  `drawSprites` for the scene, screen-px overlays), `images.ts` (one `CanvasImages` per workspace via
  `CanvasImagesContext`), `SceneInspector.tsx`. The engine's `sceneDrawables`/`drawSprites`/`sceneNav`/
  `scaleAt` are reused, never re-implemented; preview-only actors use IDs starting `ghost:`.
- Scene editor tests drive `SceneTools` in Node with `test/support/scene.ts` (`sceneEditor(project, sceneId,
  sizes)` gives `click`/`drag`/`at` in scene coordinates at 2×; image sizes are given since there is no DOM).
  The dnd-kit `DndContext` lives in `Workspace`; components listen with `useDndMonitor` and tag drop data
  with a `kind` (`browserFolder`, `sceneCanvas`, `objectSlot`). Dev page: `window.scene` is the open scene's
  controller. `editor-dev-alt` (port 5177) runs the editor when 5175 is taken; `tauri dev --config
  '{"build":{"devUrl":"http://localhost:5177","beforeDevCommand":""}}'` points the app at it. The app is
  single-instance: a second launch hands over to a running one and exits.

### Sprites and animation

- Sprites & animation: object animations live on the scene object (`animation` loops,
  `animations` are named one-shots; each names its own image). The engine passes an `ObjectPose` through
  `sceneDrawables`; `World` owns the loop clock and one-shots (never `GameState`). `play_animation`
  refers to an `animation` (scope `<scene>/<object>`, `animationScope`) or a character `slot`; rename one-shots
  with `renameObjectAnimation`. Editor logic: `model/sprites.ts` (slicing, origin, cell hit-test, `fitZoom`,
  frames as text), `model/animations.ts` (slot commands, `slotView`/`slotLabel` via the engine's `resolveAnim`,
  frame picking), `model/scene/objectAnimations.ts`. UI in `ui/sprites/`: `ImageEditor.tsx` (the image tab;
  images open in tabs through `opensTab`), `CharacterAnimations.tsx`, `ObjectAnimations.tsx` (in the object
  Inspector), `AnimCanvas.tsx` (live preview), `draw.ts` (sheet grid; frames go through engine `drawSprites`).
  The scene canvas sets `controller.clock` each frame and keeps redrawing only while `animating`; tests
  leave the clock at 0. `test/support/sheet.ts` makes an 8×4 walk sheet (the dev page can import it too).

### Rule inspector and Problems

- Rule inspector + Problems: DOM-free logic in `packages/editor/src/model/rules/`: `owner.ts`
  (`RuleOwnerRef` = scene thing / scene / game, `ownerRules`, `updateOwnerRules`, allowed triggers, `newRuleId`), `vocab.ts`
  (labels and sentence `Part`s per trigger/condition/action; the card renders these), `defaults.ts` (`RuleDefaults`: new parts
  start on the first existing choice, else a red placeholder ID), `commands.ts` (rule edits by rule ID; part edits are re-parsed
  by the schema and a new scene resets its spawn/object), `quick.ts` (quick fields own the last plain rule per verb),
  `pickers.ts` (`pickerOptions`, `fieldPick` scoping, `createAndUse` = create + use in one undo step), `problems.ts`
  (problems by rule and part), `pointPick.ts` (Pick on canvas). `model/game.ts` edits game settings; `model/locate.ts`
  returns a `Jump` (`ws.jumpTo` opens, selects, activates the layer and sets `ws.highlight` for the card to flash);
  `model/problemList.ts` filters the panel. UI in `ui/rules/` (`RuleInspector`, `RuleCard`, `PartFields`, `Picker`,
  `ui/components/ui/toggle-group.tsx` is Radix Toggle Group as a segmented bar, with `ToggleBar` for one choice that is always on (use it to switch parts of a page; use Tabs only where tab semantics fit); `ui/game/GameSettings.tsx` is the Game row's center editor (a left menu with General and Styling headings over their subsections, which scrolls apart from the page; no tabs and no title); `ui/game/NineSliceEditor.tsx` is the reusable Border size slider (`SliderField.tsx`) + guides component; the four borders move in lock step (a drag calls `onPreview` then `onCommit`, so it is one undo step; the slider and keys call `onChange`, merged under one key), `FrameControls.tsx` is the frame picker plus the nine-slice editor shared by Frames and the Icon Bar (`which` names the frame; each keeps its own image and borders; `builtIn` makes Use default look restore the default picture), `Frames.tsx` is Styling > Frames (those controls with Scale under the Border size slider, in a Panel Frame part, and the Top / Center / Width `SliderField`s in a Position part, switched by a `ToggleBar` beside the heading; the preview is shared, above the sections), `CharacterDialogue.tsx` is Styling > Character Dialogue (name, highlight and separator colours), `Inventory.tsx` is Styling > Inventory (a heading only for now), `IconBar.tsx` is Styling > Icon Bar (the bar frame, seven button pickers, the Brighten / Darken buttons), `Typography.tsx` is Styling > Typography (font picker with Import font…, size, colour), `useStyleFont.ts` registers the chosen font in the editor's document with the engine's `registerFont` so previews show it, `StylePreview.tsx` is the one Styling preview, in the top pane of a vertical split above every Styling section (its samples are a `ToggleBar`; `GameSettings.tsx` holds the chosen sample, switched per section by `SECTION_SAMPLE`, and the frame drafts in `FrameDraftContext`); it draws with the engine's `drawNineSlice`, `drawText` and, for the choices sample, `drawChoiceRows` on a 640×400 canvas over the scene editor's `checkerboard`, the frame scaled to its Scale; sized by `fitCanvas` to fill its pane's height in the game's shape, with Actual game size resizing the pane to 640×400; the Icon Bar sample is the engine's `drawIconBar` with hover, click and arrow keys; pointing at or clicking a choice row, or the arrow keys, picks the highlighted one); `Dock.tsx` is the Problems panel. The Game Settings tab is a singleton (`ws.openGame()`, active key `GAME_TAB`, subsection in `ws.gameNav`) opened by a click or Enter on the Game row; while it is active the Workspace collapses the Inspector (and restores it on leaving), and `ws.jumpTo` for a game field opens its General subsection, where `GameSettings` flashes and focuses the `data-game` field. Every Inspector page goes through `ui/InspectorShell.tsx` (sticky
  title, Details / Rules tabs for rule owners, tab in `ws.inspectorTab`). Rule cards are dnd-kit sortables tagged `kind: "ruleCard"`.

### Playtest

- Playtest: DOM-free logic in `packages/editor/src/model/playtest/`: `playtest.ts` (`Playtest`: runs,
  the validation gate via `validateNow()`, Restart = the run's origin, Restart scene = `session.entry` + the current project, `stale`,
  `hooks(run)` for trace and the in-game Restart), `state.ts` (`stateView`, `applyStateEdit`; live edits mutate the session's
  GameState and are never undo steps), `presets.ts` (`PresetStore` on `.editor/presets.json`, `readState`, `sanitizeState` drops
  stale IDs; every saved-state start goes through it), `log.ts` (`formatLog(events, runProject, nowProject)`: trace → plain-English
  lines from `rules/vocab.ts`, jumps found by rule ID). The engine side: `Session` takes `SessionHooks` (`trace`, `restart`) and
  `SessionStart.state`; `firstMatch` takes an optional `RuleReport`; `debugShapes(world, flags)` is what the toggles draw. Nothing
  is traced unless a hook is passed, so the exported game is unchanged. UI in `ui/playtest/` (`PlaytestPanel`, `GameView` mounts
  `createGame` per run with `key={run.id}`, `StatePanel`, `EventLog`, `Presets`); panels re-render through `usePlaytest`
  (once a frame, plus every 200 ms while playing). `PlaytestArea` replaces the scene editor and Problems in `Workspace` while `playtest.playing`, which also collapses the browser and inspector until Stop; `ws.showProblems()` expands the Problems dock.
  Play commands are `play.*` in a Play menu; F-keys are accelerators, not plain shortcuts. The game canvas has
  `data-playtest-game`: plain shortcuts and Space skip it (`inPlaytestGame`), Escape blurs it. Tests use
  `test/support/playtest.ts` (`playtestEditor()` on an m1 disk copy, headless sessions, `tap`/`settle`). Dev page:
  `window.game` is the running playtest game.

### Dialogue graph

- Dialogue graph: engine `start_dialogue` blocks the rule; `dialogue_end` runs at the end, then
  the rule goes on. Editor DOM-free logic in `packages/editor/src/model/dialogue/`: `commands.ts` (pure node/port/
  option commands by stable ID, `editConditions`/`editActions` take list edits from `rules/parts.ts`, which rule cards
  share), `context.ts` (`dialogueContext`: the scene that starts it), `layout.ts` (auto-layout), `problems.ts`
  (problems by node and part). UI in `ui/dialogue/`: `DialogueEditor.tsx` (React Flow; local node state follows the
  file and a drag commits on drop; port dropped on empty space opens the create menu; registry handles `edit.delete`,
  `dialogue.layout`, `dialogue.fit`), `NodeCard.tsx`, `NodeInspector.tsx` (the Inspector page for a
  `{ kind: "dialogueNode" }` selection). `ui/rules/PartRows.tsx` holds the condition/action rows both inspectors use.
  Play from This Node (`play.node`, Shift+F6) is `Playtest.playNode()`; the log and state panel read the engine's
  `dialogue_*` trace events. Dev page: `window.dialogueGraph` is the React Flow instance. The browser tool's instant
  drag doesn't start a React Flow connection: dispatch `mousedown` on the handle, a few `mousemove`s, then `mouseup`.

### Build Game

- Build Game: File ▸ Build Game… (`project.build`, Mod+B) writes one `.quest` file. Never call it "export".
  `model/build.ts` (`GameBuilder`: validation gate, `buildQuest` on the in-memory project, `BuildHost` reads asset bytes through
  `platform.assetUrl` and saves through `platform.saveBuild`). The app's Rust `build_save` (raw body, like `fs_write_bytes`)
  shows the save dialog and writes only the picked path; the dev page downloads. The engine dev page plays a `.quest`
  (Open game…, drop, or `?quest=<url>`). Tests: `schema/test/quest.test.ts`, `engine/test/quest.test.ts`, the puzzle chain from a
  built `.quest` in `engine/test/fixture.test.ts`, `editor/test/build.test.ts`.
