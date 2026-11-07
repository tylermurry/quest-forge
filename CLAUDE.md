# Questforge — working notes for Claude sessions

Questforge is a no-code desktop editor for Sierra-style point-and-click adventures.

## Read first
- `specs/README.md`: the North Star and the spec index. Every feature must serve it.
- `specs/DECISIONS.md`: the decision log. Follow it exactly. Record every new decision there
  with an ID, plus a status (`Locked` when the user confirmed it, `VERIFY` when it's your
  proposal). If a spec is ambiguous or seems wrong, stop and ask instead of guessing.
- `specs/15-demo-and-build-order.md`: milestones M0–M9. Work one milestone per session, read
  the specs it lists, and don't start the next milestone.

## Repo layout (pnpm workspace, D52)
- `packages/schema` (`@questforge/schema`): zod schemas, project load/save, references/rename,
  validation. Node-only code (fs adapter) is exported from `@questforge/schema/node`.
- `packages/engine`: web runtime (M1+). Canvas 2D, no runtime dependencies besides the schema (D30). `packages/editor`: Tauri + React editor (M3+).
- `templates/demo`: "The Lantern". Built **only** in the editor (D6). Never hand-edit it.

## Conventions
- Run pnpm through corepack: `corepack pnpm install`, `corepack pnpm check` (typecheck + tests).
  `corepack pnpm test` runs all Vitest projects. Tests live in `packages/*/test/*.test.ts`.
- TypeScript strict + `noUncheckedIndexedAccess`. Internal packages export `src/*.ts` directly,
  with no build step. Import with `.ts` extensions.
- Schemas are strict (unknown keys are errors, D59) and use no zod defaults, so parsing never
  invents keys and round-trips stay byte-identical (D54). Optional fields are omitted when unset.
- Project files are only ever written by the canonical serializer (`serialize.ts`). Test fixtures
  must be in canonical form. The round-trip test enforces this.
- Problems (validation) carry `severity`, `code`, a plain-English `message`, a `breadcrumb`, and
  a jump-to `location` (`file` + data `path`).
- Schema package map: `common/assets/flags/item/character/rules/game/scene/dialogue.ts` (schemas; `dialogue.ts` also has the
  graph helpers `nodePorts` (ports `next` / `then` / `else` / `option:<id>`), `reachableNodes` and `silentLoops`, D140),
  `project.ts` (load, `planSave`/`saveProject`, `moveAsset`), `references.ts` (reference index,
  `renameId`, `renameSceneId` for objects/spawns/hotspots/regions), `validate.ts` + `geometry.ts` (spec 14 errors), `warnings.ts` (spec 14
  warnings and empty rule text, D119/D122; `logicBlocks` walks every rule and dialogue node, `awardTotal`), `migrate.ts`
  (`MIGRATIONS`; v2 gives rules IDs, `withRuleIds` also builds test data). The test fixture project is
  `packages/schema/test/fixtures/mini`. It must stay canonical and problem-free (no warnings either). To change it, load it,
  edit the Project and save it with `saveProject` (a throwaway script), never by hand.
- Rules have a required `id` (`rule_<n>`, unique within the list, never shown, D117); fired keys are `<owner>/<id>`. Rule
  text (`narrate`/`say`/`die`) may be `""` (an `empty_text` error, D119). Tests that mean "valid" check errors only
  (`errorsIn` in editor tests); warnings have their own tests in `schema/test/warnings.test.ts`.
- Engine package map (`packages/engine/src`): `nav.ts` (visibility graph + A*, obstacles), `depth.ts`
  (scale lerp, baseline sort), `sprite.ts` (sheet slicing, origin, mirroring, slot fallback),
  `viewport.ts` (letterbox transform picked in CSS px, 60 Hz `FixedStep`), `world.ts` (one scene's
  simulation: movement, actors, hit-test, approach points), `state.ts` (the serializable `GameState`),
  `rules.ts` (conditions, first-match, rule keys, default responses), `sequence.ts` (action runner
  behind a `SequenceHost`), `dialogue.ts` (`DialogueRun`: walks a dialogue graph; once/first-time keys by
  stable IDs, D137; endings, D141), `session.ts` (a game being played: state, verbs, scene changes, regions,
  text, the dialogue playing and its `choices`), `ui/` (`textbox.ts` layout and timing, `layout.ts` 44 CSS px controls
  and `choiceLayout` for the dialogue list box (D143), `controller.ts` pointer input → bar/inventory/list box/session,
  `icons.ts` + `draw.ts` drawing), `render.ts` (Canvas 2D),
  `game.ts` (`createGame`, image cache, DOM glue), `trace.ts` (playtest trace events, D129), `debug.ts` (debug layer
  shapes, D132).
  Keep logic in `session.ts`, `world.ts` and `ui/controller.ts`/`layout.ts` so it stays testable in Node.
  Only `game.ts`, `render.ts`, `ui/draw.ts` and `ui/icons.ts` touch the canvas or DOM.
- Everything that must survive a scene change or a save lives in `GameState` as plain JSON (D75).
  UI state (current item, open panels) stays out. Rules are identified by location keys (D73).
- New actions/conditions: handle them in `sequence.ts` / `rules.ts` (exhaustive switches), and say in
  DECISIONS.md which milestone owns anything stubbed (D71).
- Session tests build projects with `test/support/project.ts` (real schemas, in memory).
  Wait for arrivals with a helper, not a fixed time: text boxes close by themselves (D78).
- The engine imports every data shape from `@questforge/schema`. Never redefine a schema type.
  Engine math uses `Vec` (`vec.ts`), which may be fractional; on-disk geometry stays integer.
- Engine fixture: `packages/engine/fixtures/m1` is generated by `scripts/build-m1-fixture.ts`
  (`corepack pnpm --filter @questforge/engine fixture`). Edit the script, not the YAML or PNGs.
  `test/fixture.test.ts` checks it's canonical and problem-free (except the dev-only stress scene's `scene_unreachable`
  warning) and plays the M2 puzzle chain
  (garden + shed) and the M7 shop (coin under the workbench, the visitor's `shop` dialogue in the shed) with touch taps only.
- Dev page: `corepack pnpm --filter @questforge/engine dev` (Vite, port 5174, also `engine-dev` in
  `.claude/launch.json`; `engine-dev-alt` uses another port when 5174 is taken). `window.game` exposes
  the running game (`game.session`, `game.ui`) for debugging. Browser-tool clicks are mouse events:
  test touch by dispatching `PointerEvent`s with `pointerType: "touch"` on the canvas.
- Schema project model (M3): `Project` splits content (docs, `folders`, `pendingFiles`) from disk state
  (`files`, `saved`, `savedFolders`, `trash`). Undo swaps content and keeps disk state (`withDiskState`).
  `planSave` also creates/removes section folders (empty ones get a `.keep`, D83) and moves image/audio
  files to follow `assets.yaml` (moves, `.editor/trash`, pending imports, D88). `ProjectFs` has folder and
  binary operations (`listFolders`, `writeBytes`, `move`, `makeFolder`, `removeFolder`, `removeTree`).
- Editor package map (`packages/editor/src`): `model/` is DOM-free and holds all logic: `browser.ts`
  (section trees, search), `commands.ts` (pure Project → Project browser commands, reference summaries),
  `history.ts` (undo snapshots, merge keys, 500 steps), `editor.ts` (`Editor`: project + history +
  autosave + save errors + outside-change reload), `workspace.ts` (tabs, selection, expanded folders; UI
  state, never undone), `actions.ts` (UI intents → one labelled undo step each), `importing.ts`,
  `template.ts` (blank project) + `png.ts`, `locate.ts` (jump-to), `recent.ts`, `appCommands.ts`
  (File/Edit/View command registry + shortcuts). `platform/` adapts the host: `platform.ts`
  (interface), `browser.ts` (dev page, HTTP to the sandbox), `tauri.ts` (typed Rust commands + native
  menu), `bindings.ts` (generated). `ui/` is thin React that only calls `Actions`/`Editor`/the registry.
  Rust lives in `src-tauri/` and does only file I/O confined to the project folder, watching, recent
  projects and dialogs (D90).
- Editor UI stack (D92): Tailwind v4 (tokens in `ui/styles.css`, dark only), shadcn/ui components copied
  into `ui/components/ui` (add more with `corepack pnpm dlx shadcn@latest add <name>` from
  `packages/editor`, with a `pnpm` shim on PATH; then fix any `from "cn"` import to `@/ui/lib/utils`),
  lucide icons, react-resizable-panels, dnd-kit for in-app drags. Prefer shadcn/Radix over hand-rolled
  menus or dialogs. Radix menus are portaled but React still bubbles their events to the trigger's
  ancestors: stop propagation on menu content. Use `cn()` for class merging and `@/` imports only in
  shadcn files.
- App commands: add to `COMMANDS` in `model/appCommands.ts` and register a handler where the state
  lives (`App` for File, `Workspace` for Edit/View). The app's native menu and the dev page's
  shortcuts both run the registry; never add a separate keydown handler.
- Run every editor change as `editor.apply(label, p => command(p), mergeKey?)`; commands throw
  `CommandError` with a plain-English message, which becomes a notice. Typing fields pass a merge key
  and call `history.breakMerge()` on blur (D84).
- Editor tests: model tests in Node with `test/support/fixtures.ts` (`m1Project()`, `m1Copy()`); thin
  component tests are `.tsx` files starting with `// @vitest-environment jsdom`. Never write to
  `packages/engine/fixtures/m1` from the editor; use a copy.
- Editor dev page: `corepack pnpm --filter @questforge/editor dev` (Vite with `--configLoader runner`,
  port 5175, `editor-dev` in `.claude/launch.json`). It edits real folders in the gitignored
  `packages/editor/.sandbox/` through `dev/sandbox.ts`, seeded with a copy of the m1 fixture
  (`garden-m1`); delete a sandbox folder to reset it. Read `specs/DECISIONS.md` D93–D109 before touching the scene editor. `window.editor` exposes the open `Editor`.
  In-app drags use dnd-kit, so the browser tool's `left_click_drag` works on tree rows. Component tests
  drag with pointer events after giving rows a `getBoundingClientRect` (see `browser-ui.test.tsx`);
  Radix menus need `@testing-library/user-event`. jsdom polyfills live in `test/support/setup.ts`.
- Scene editor (M4, spec 09): DOM-free logic in `packages/editor/src/model/scene/`: `view.ts` (zoom/pan
  transform, pixel snap, grid threshold), `sceneUi.ts` (per-scene layer/tool/snap/aids/zoom state in
  `ws.sceneUi`, saved to `.editor/view.json`, never undone, D101), `things.ts` (`ThingRef` = `{ list, key }`
  selection keys, Layers panel rows, draw order), `shapes.ts` (every polygon as a `PolyRef`), `snap.ts`,
  `hit.ts` (click order, D108), `commands.ts` (pure scene commands), `problems.ts` (validation problems
  by thing), `frame.ts` (what one canvas frame shows), `controller.ts` (`SceneController`: zoom/pan,
  drafts, delete, frame) and `tools.ts` (`SceneTools`: Select/Move, Polygon, Rectangle, Spawn, Walk-to,
  drops, reorder, ghost/path aids). Drags call `preview(label, run)` and `commit()` on release, so a drag is
  one undo step and an unclosed polygon never enters history (D84).
  UI in `ui/scene/`: `SceneEditor.tsx` (toolbar, Layers panel, registry handlers), `SceneCanvas.tsx`
  (forwards pointer/wheel/space input, counts clicks itself), `draw.ts` (the only canvas drawing: engine
  `drawSprites` for the scene, screen-px overlays, D93), `images.ts` (one `CanvasImages` per workspace via
  `CanvasImagesContext`), `SceneInspector.tsx`. The engine's `sceneDrawables`/`drawSprites`/`sceneNav`/
  `scaleAt` are reused, never re-implemented; preview-only actors use IDs starting `ghost:`.
- Scene editor tests drive `SceneTools` in Node with `test/support/scene.ts` (`sceneEditor(project, sceneId,
  sizes)` gives `click`/`drag`/`at` in scene coordinates at 2×; image sizes are given since there is no DOM).
  The dnd-kit `DndContext` lives in `Workspace`; components listen with `useDndMonitor` and tag drop data
  with a `kind` (`browserFolder`, `sceneCanvas`, `objectSlot`). Dev page: `window.scene` is the open scene's
  controller. `editor-dev-alt` (port 5177) runs the editor when 5175 is taken; `tauri dev --config
  '{"build":{"devUrl":"http://localhost:5177","beforeDevCommand":""}}'` points the app at it. The app is
  single-instance: a second launch hands over to a running one and exits.
- Sprites & animation (M4b, spec 05, D111–D115): object animations live on the scene object (`animation` loops,
  `animations` are named one-shots; each names its own image). The engine passes an `ObjectPose` through
  `sceneDrawables`; `World` owns the loop clock and one-shots (never `GameState`, D112). `play_animation`
  refers to an `animation` (scope `<scene>/<object>`, `animationScope`) or a character `slot`; rename one-shots
  with `renameObjectAnimation`. Editor logic: `model/sprites.ts` (slicing, origin, cell hit-test, `fitZoom`,
  frames as text), `model/animations.ts` (slot commands, `slotView`/`slotLabel` via the engine's `resolveAnim`,
  frame picking), `model/scene/objectAnimations.ts`. UI in `ui/sprites/`: `ImageEditor.tsx` (the image tab;
  images open in tabs through `opensTab`), `CharacterAnimations.tsx`, `ObjectAnimations.tsx` (in the object
  Inspector), `AnimCanvas.tsx` (live preview), `draw.ts` (sheet grid; frames go through engine `drawSprites`).
  The scene canvas sets `controller.clock` each frame and keeps redrawing only while `animating` (D113); tests
  leave the clock at 0. `test/support/sheet.ts` makes an 8×4 walk sheet (the dev page can import it too).
- Rule inspector + Problems (M5, specs 10/14, D116–D124): DOM-free logic in `packages/editor/src/model/rules/`: `owner.ts`
  (`RuleOwnerRef` = scene thing / scene / game, `ownerRules`, `updateOwnerRules`, allowed triggers, `newRuleId`), `vocab.ts`
  (labels and sentence `Part`s per trigger/condition/action; the card renders these), `defaults.ts` (`RuleDefaults`: new parts
  start on the first existing choice, else a red placeholder ID), `commands.ts` (rule edits by rule ID; part edits are re-parsed
  by the schema and a new scene resets its spawn/object), `quick.ts` (quick fields own the last plain rule per verb, D118),
  `pickers.ts` (`pickerOptions`, `fieldPick` scoping, `createAndUse` = create + use in one undo step, D123), `problems.ts`
  (problems by rule and part), `pointPick.ts` (Pick on canvas, D124). `model/game.ts` edits game settings; `model/locate.ts`
  returns a `Jump` (`ws.jumpTo` opens, selects, activates the layer and sets `ws.highlight` for the card to flash);
  `model/problemList.ts` filters the panel. UI in `ui/rules/` (`RuleInspector`, `RuleCard`, `PartFields`, `Picker`,
  `GameInspector`); `Dock.tsx` is the Problems panel. Every Inspector page goes through `ui/InspectorShell.tsx` (sticky
  title, Details / Rules tabs for rule owners, tab in `ws.inspectorTab`, D125). Rule cards are dnd-kit sortables tagged `kind: "ruleCard"`.
- Playtest (M6, spec 12, D126–D135): DOM-free logic in `packages/editor/src/model/playtest/`: `playtest.ts` (`Playtest`: runs,
  the D38 gate via `validateNow()`, Restart = the run's origin, Restart scene = `session.entry` + the current project, `stale`,
  `hooks(run)` for trace and the in-game Restart), `state.ts` (`stateView`, `applyStateEdit`; live edits mutate the session's
  GameState and are never undo steps), `presets.ts` (`PresetStore` on `.editor/presets.json`, `readState`, `sanitizeState` drops
  stale IDs; every saved-state start goes through it), `log.ts` (`formatLog(events, runProject, nowProject)`: trace → plain-English
  lines from `rules/vocab.ts`, jumps found by rule ID). The engine side: `Session` takes `SessionHooks` (`trace`, `restart`) and
  `SessionStart.state`; `firstMatch` takes an optional `RuleReport`; `debugShapes(world, flags)` is what the toggles draw. Nothing
  is traced unless a hook is passed, so the exported game is unchanged. UI in `ui/playtest/` (`PlaytestPanel`, `GameView` mounts
  `createGame` per run with `key={run.id}`, `StatePanel`, `EventLog`, `Presets`); panels re-render through `usePlaytest`
  (once a frame, plus every 200 ms while playing). `PlaytestArea` replaces the scene editor and Problems in `Workspace` while `playtest.playing`, which also collapses the browser and inspector until Stop (D133); `ws.showProblems()` expands the Problems dock.
  Play commands are `play.*` in a Play menu; F-keys are accelerators, not plain shortcuts. The game canvas has
  `data-playtest-game`: plain shortcuts and Space skip it (`inPlaytestGame`), Escape blurs it. Tests use
  `test/support/playtest.ts` (`playtestEditor()` on an m1 disk copy, headless sessions, `tap`/`settle`). Dev page:
  `window.game` is the running playtest game.
- Dialogue graph (M7, spec 11, D136–D144): engine `start_dialogue` blocks the rule; `dialogue_end` runs at the end, then
  the rule goes on (D136). Editor DOM-free logic in `packages/editor/src/model/dialogue/`: `commands.ts` (pure node/port/
  option commands by stable ID, `editConditions`/`editActions` take list edits from `rules/parts.ts`, which rule cards
  share), `context.ts` (`dialogueContext`: the scene that starts it, D142), `layout.ts` (auto-layout), `problems.ts`
  (problems by node and part). UI in `ui/dialogue/`: `DialogueEditor.tsx` (React Flow; local node state follows the
  file and a drag commits on drop; port dropped on empty space opens the create menu; registry handles `edit.delete`,
  `dialogue.layout`, `dialogue.fit`), `NodeCard.tsx`, `NodeInspector.tsx` (the Inspector page for a
  `{ kind: "dialogueNode" }` selection). `ui/rules/PartRows.tsx` holds the condition/action rows both inspectors use.
  Play from This Node (`play.node`, Shift+F6) is `Playtest.playNode()`; the log and state panel read the engine's
  `dialogue_*` trace events. Dev page: `window.dialogueGraph` is the React Flow instance. The browser tool's instant
  drag doesn't start a React Flow connection: dispatch `mousedown` on the handle, a few `mousemove`s, then `mouseup`.
- Validation is debounced: `Editor.problems` is the last result, refreshed 250 ms after a change (D120). Tests call
  `editor.validateNow()` instead of waiting. Browser-tool clicks by `ref` may scroll the page first; prefer coordinates or a
  JS `click()` when testing popovers. Radix dropdowns open from the keyboard in jsdom (`focus()` + `{Enter}`).
- Tauri app: needs Rust (rustup). `corepack pnpm --filter @questforge/editor tauri dev` runs the
  editor in a native window (it starts the Vite dev server itself); `tauri build` makes the bundle.
  Rust unit tests: `cargo test --manifest-path packages/editor/src-tauri/Cargo.toml`; this also
  regenerates `src/platform/bindings.ts` (tauri-specta), so commit it after changing a command.
  New commands need `#[specta::specta]` and an entry in `specta_builder()`.
- One ticket ≈ one commit, with tests. Commit messages are imperative and explain why.
