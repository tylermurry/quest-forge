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
- `packages/engine`: web runtime (M1+). `packages/editor`: Tauri + React editor (M3+).
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
- One ticket ≈ one commit, with tests. Commit messages are imperative and explain why.
