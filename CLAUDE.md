# Questforge — working notes for Claude sessions

Questforge is a no-code desktop editor for Sierra-style point-and-click adventures.

## Read first
- `docs/project/README.md`: the North Star and the spec index. Every feature must serve it.
- `docs/project/DECISIONS.md`: the decision log. Follow it exactly. Record every new decision there
  with an ID, plus a status (`Locked` when the user confirmed it, `VERIFY` when it's your
  proposal). If a spec is ambiguous or seems wrong, stop and ask instead of guessing.
- `docs/project/15-demo-and-build-order.md`: milestones M0–M9. Work one milestone per session, read
  the specs it lists, and don't start the next milestone.
- `docs/standards/index.mdx`: the engineering standards' table of contents (D159). Before starting any change,
  read Change hygiene, AI collaboration and every page whose row matches the change, and write to those rules.
  Before asking for review, check the change against the same pages. A change to `docs/standards/` contains
  nothing else (CHG-4).
- `docs/project/conventions.md`: the conventions and package maps. Before changing a package, read "Working
  in the repo" and that package's section. Update the page in the same change when what it describes changes.
- Reviewing a PR or branch: use the `pr-review` skill (`.claude/skills/pr-review/SKILL.md`, D161).

## Repo layout (pnpm workspace, D52)
- `packages/schema` (`@questforge/schema`): zod schemas, project load/save, references/rename,
  validation, and the `.quest` format. Node-only code (fs adapter) is exported from `@questforge/schema/node`.
- `packages/engine`: web runtime (M1+). Canvas 2D, no runtime dependencies besides the schema (D30). `packages/editor`: Tauri + React editor (M3+).
- `docs` (`@questforge/docs`): the Docusaurus site, two sections. `docs/standards/` holds portable, project-agnostic
  engineering standards (`.mdx`, keep it free of Questforge specifics so it can be copied to other repos);
  `docs/project/` holds Questforge's specs and decision log (plain `.md`, `markdown.format: "detect"`). Dev:
  `corepack pnpm --filter @questforge/docs dev` (port 5179, `docs-dev` in `.claude/launch.json`); build:
  `corepack pnpm --filter @questforge/docs build` (broken links fail it, and CI runs it). `site.yml` copies the build
  into the site's assets under `/docs/` (`baseUrl: "/docs/"`, `trailingSlash: true`).
- `templates/demo`: "The Lantern". Built **only** in the editor (D6). Never hand-edit it.
- `packages/site` (`@questforge/site`, D155): the public splash page (`/`) and `.quest` player (`/play`), deployed to
  Cloudflare (D157). Dev: `corepack pnpm --filter @questforge/site dev` (port 5178, `site-dev` in `.claude/launch.json`).
  `src/download.ts` picks the installer (tested in `test/download.test.ts`); screenshots live in `public/screenshots/` (WebP).
