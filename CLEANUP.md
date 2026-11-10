# Cleanup plan: aligning the code with the standards

A one-time audit of the whole repository against `docs/standards/`, done on 2026-11-09, and the
plan to fix what it found. Delete this file when every item is done or handed to the owner.

## Summary

The code is in good shape. The audit found no secrets, no skipped tests, no leftover debugging,
no `TODO` notes, no unused variables and no build output in the repository. All 757 tests pass.

It found 14 things to fix and 6 that need the owner's decision. Two of the owner items are
security settings in the desktop app that break a Must rule; they are not fixed here because a
wrong fix would only show up when running the real app, which the automated checks do not do.

## How the audit was done

- **Mechanical scans** of every tracked file: unused code (`tsc` with unused checks, `knip`),
  silenced checks, swallowed errors, leftovers (`TODO`, `console`, skipped tests), secrets,
  committed build output, dependency vulnerabilities (`pnpm audit`), workflow permissions,
  accessibility markers (labels, alt text, keyboard handlers, motion) and Rust panics.
- **Reading** the places the scans pointed at, plus the Tauri configuration and the workflows.
- **Not done:** a line-by-line read of all 23,000 lines, a measured performance test, a contrast
  measurement of the editor's colours, and a run of the desktop app. Clippy (the Rust linter) is
  not installed locally, so the Rust code was read but not linted.

## What will be fixed

Each item is one commit. "Must" items break a rule that would block a pull request.

### Workstream A: editor (`packages/editor`)

| # | Rule | Finding | Fix |
|---|---|---|---|
| A1 | SIM-2 Must | Three copied UI components are used nowhere: `ui/components/ui/badge.tsx`, `scroll-area.tsx`, `separator.tsx`. | Delete them. |
| A2 | SIM-2 Must, ARC-6 | About 45 functions and constants in `src/model`, `src/ui` and `dev/` are exported but used by no other file (`knip` lists them). Some are dead; most are only used inside their own file. | Delete the dead ones. Drop `export` from the rest. Leave the copied shadcn files in `ui/components/ui` alone (D92). |
| A3 | COR-3 Must | Saving playtest presets and scene view settings ignores a failed write (`model/playtest/presets.ts`, `model/scene/sceneUi.ts`). A preset the user saved can be lost with no message. | A failed preset save shows a plain-English notice. The view-settings write stays silent, with the reason written next to it. Add tests. |
| A4 | COR-3 Must, MNT-5 | Six other places turn a failure into an empty result with no reason given (for example `platform/browser.ts:80`, `platform/tauri.ts:161`, `ui/Workspace.tsx:38`, `ui/playtest/PlaytestArea.tsx:26`, `model/playtest/presets.ts:31`, `model/editor.ts:119` and `:342`). | Read each. Where ignoring is right, say why in a comment. Where the user should know, surface it. |
| A5 | MNT-3 Must | Seven `eslint-disable` comments and four `as unknown as` casts silence a check with no reason next to them. | Add the reason beside each, or remove the cast where the types can be made to fit. |
| A6 | UXA-9 Should | The highlight flash animation ignores the reduced-motion setting (`ui/styles.css`). | Turn the animation off under `prefers-reduced-motion`. |
| A7 | TST-1 Must | `model/scene/hit.ts`, `snap.ts`, `shapes.ts` and `frame.ts` have no test file of their own. | Check whether the scene tests already exercise their behaviour. Add direct tests only for behaviour nothing covers. |

### Workstream B: engine and schema (`packages/engine`, `packages/schema`)

| # | Rule | Finding | Fix |
|---|---|---|---|
| B1 | SIM-2 Must, ARC-6 | About 12 exports are used by no other file (for example `hasFired` in `rules.ts`, `characterPosition` in `state.ts`, layout and controller constants). | Delete the dead ones. Drop `export` from the rest. |
| B2 | COR-3 Must, MNT-5 | Several catches return a fallback with no reason given (`engine/src/game.ts:248`, `saves.ts:66` and `:74`, `ui/draw.ts:243`, `webaudio.ts:53`, `:60` and `:179`, `schema/src/node.ts:83`). | Read each. Add the reason, or surface the failure where the player or author should know. |
| B3 | COR-3 Must | A sprite sheet that does not fit its image is only reported with `console.warn` (`engine/src/game.ts:311`), which no author will see. | Report it the way other asset problems are reported to the playtest, and test it. |
| B4 | MNT-3 Must | Four `as unknown as` casts have no reason next to them (`engine/src/session.ts:131`, `webaudio.ts:37`, `schema/src/project.ts:197`, `references.ts:286`). | Add the reason, or remove the cast. |
| B5 | TST-1 Must | `engine/src/restore.ts` and `schema/src/migrate.ts`, `geometry.ts`, `warnings.ts`, `references.ts` are not imported directly by any test. | Confirm they are tested through the package's public interface. Add tests only for behaviour nothing covers. |

### Workstream C: site, docs, dependencies and workflows

| # | Rule | Finding | Fix |
|---|---|---|---|
| C1 | DEP-4 Must | `pnpm audit` reports 15 known vulnerabilities, 2 critical and 5 high. All are in build tools, not in what ships: `undici` (through `wrangler`) and `tinypool`, `serialize-javascript`, `uuid` (through Docusaurus). | Move to patched versions, by upgrading the parent or with a pnpm override. Re-run the audit, the checks, and the site and docs builds. One low-severity item (`deepmerge`) has no patch; leave it and note it. |
| C2 | DEP-3 Must | The docs config uses `@docusaurus/plugin-content-docs` and `@docusaurus/types` without declaring them in `docs/package.json`. | Declare them. |
| C3 | SEC-3 Must | `ci.yml` and `site.yml` do not limit the workflow token's permissions. | Add `permissions: contents: read` to both. |
| C4 | SEC-3, DEP-4 Should | Workflows use third-party actions by tag (`dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`), which the action's owner can move. | Pin third-party actions to a commit, with the version in a comment. |
| C5 | TST-1 Must | The site's logic in `router.ts`, `questFile.ts` and `releases.ts` has no tests. | Add tests. |
| C6 | SIM-2, UXA-9 | `HOME_TITLE` and the `DesktopOS` type are exported but unused elsewhere; smooth scrolling and a transition in `styles.css` ignore the reduced-motion setting. | Drop the exports; respect `prefers-reduced-motion`. |
| C7 | DOC-6 Should | The repository has no `README.md`, so a visitor to the public repository sees nothing. | Add a short one: what Questforge is, how to run and check it, and links to the docs. |

## What needs the owner

These are not fixed here. Each needs a decision, or a check only a person can do.

| # | Rule | Finding | What is needed |
|---|---|---|---|
| O1 | SEC-3, SEC-4 Must | The desktop app lets its window read **any file on the computer** through the asset protocol (`tauri.conf.json`, `assetProtocol.scope: ["**"]`). The file commands are confined to the project folder, but this setting is not. | Narrow it to the open project folder. This needs someone to run the app afterwards and confirm that images and sounds still load. |
| O2 | SEC-6 Must | The desktop app has no content security policy (`"csp": null`), the browser safeguard that limits what a page may load and run. | Write a policy and run the app to confirm nothing breaks (the dialogue graph, images, audio). Same manual check as O1. |
| O3 | DEP-2 Must | The public repository has no licence, so nobody else may legally use or contribute to the code, and "compatible with the project's licence" cannot be judged for its dependencies. | Choose a licence. |
| O4 | UXA-2 Must | The game player and the scene canvas are operated by pointer only. The rule says everything must work from the keyboard. | Decide: record point-and-click as a deliberate exception in the decision log, or plan keyboard play. |
| O5 | MNT-2 Must | The project has no linter or formatter, so its conventions are followed by habit, not checked. The `eslint-disable` comments in the code refer to a tool that is not installed. | Decide whether to add one. It is a new dependency and would touch many files once. |
| O6 | DOC-4 | The docs site address in `docs/docusaurus.config.js` is still a placeholder. | Supply the real domain. |

## Looked at and left alone

- **Large files** (SIM-6 Should): `engine/src/session.ts` (697 lines) and `editor/src/model/scene/tools.ts` (592) are long but each has one job and is well tested. Splitting them would be churn.
- **Non-null assertions** (67 uses of `!`): each sits where `noUncheckedIndexedAccess` cannot see an index is safe. Not a silenced check under MNT-3.
- **Accessibility markers**: every image has alt text, every icon button has a label, and click handlers sit on buttons or keyboard-reachable rows.
- **The copied shadcn components** keep their unused exports, so they stay comparable with upstream (D92).

## How the work is run

- Three Sonnet subagents, one per workstream, each in its own copy of the repository so they
  cannot disturb each other. The workstreams touch separate files.
- Each item is one commit with its tests, and `corepack pnpm check` must pass after each.
- An agent that finds an item is wrong, or needs a product decision, stops that item and reports
  it. It does not guess (AIC-2) and does not widen the item (AIC-4).
- Afterwards the three branches are combined on `docs-standards`, the full check and both builds
  are run again, and the result is reported item by item.

## Results

Done on 2026-11-09. All 19 items in the three workstreams are finished, one commit each, on
branch `docs-standards`.

**Checked after combining the work:** `corepack pnpm check` passes (91 test files, 802 tests,
up from 757), the site and docs builds pass, `pnpm audit` reports 1 low finding (was 15), and
`knip` reports no unused code outside the copied shadcn components.

| # | Result |
|---|---|
| A1 | Done. The three unused components are deleted. |
| A2 | Done. 6 dead exports deleted, 43 made file-local. |
| A3 | Done. A failed preset save now shows a notice saying the presets will be lost when the editor closes. Tested. |
| A4 | Done. Every case was a correct fallback; each now says why. |
| A5 | Done. All 7 suppressions carry a reason; one cast removed, three kept with a reason. |
| A6 | Done. With reduced motion the highlight shows and switches off without fading. Not looked at in a browser. |
| A7 | Done. 9 new tests for scene hit-testing, snapping and polygon helpers. `frame.ts` holds only types and needs none. |
| B1 | Done. 1 dead function deleted, 11 exports made file-local. Schema had none. |
| B2 | Done. All 8 were correct fallbacks; each now says why. |
| B3 | Done. A sprite sheet that does not fit its image now appears as a note in the playtest log. The message is tested; the wiring in `game.ts` is not, because it needs a real image decoder. |
| B4 | Done. All 4 casts kept, each with its reason. |
| B5 | Done. `migrate`, `references` and `warnings` were already covered. 13 new tests for `restore` and `geometry`. |
| C1 | Done. `wrangler` upgraded; three narrow overrides for Docusaurus's build tools, to remove when Docusaurus catches up. `deepmerge` (low) has no patch. |
| C2 | Done. |
| C3 | Done. |
| C4 | Done. The two third-party actions are pinned to commits. The workflows have not been run since. |
| C5 | Done. 21 new tests. The two React hooks are tested against a stand-in for React, not real rendering. |
| C6 | Done. Not looked at in a browser. |
| C7 | Done. `README.md` added. |

### Left over

- **O1–O6** above still need the owner.
- **Three more unexplained casts** in `packages/editor/src/model/playtest/log.ts` (lines 80–82)
  were missed by the audit, so A5 did not cover them (MNT-3).
- **A flaky test:** `packages/editor/test/rule-inspector-ui.test.tsx` timed out several times
  while three agents ran the suite at once, and passes when the machine is not overloaded. It
  breaks TST-4 in spirit (a test should not depend on the machine it runs on) and is worth a
  look.
- **`removeFolder` in `schema/src/node.ts`** ignores every error from reading the folder, not
  only "the folder is gone". Narrowing it is a small behaviour change nobody asked for.
- **The workflow changes (C3, C4)** are only proven when the workflows next run.
