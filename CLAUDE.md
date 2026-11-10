# Questforge — working notes for Claude sessions

Questforge is a no-code desktop editor for Sierra-style point-and-click adventures.

## Read first
- The work is planned as GitHub issues in milestones on `tylermurry/quest-forge` (currently **1.0.0**). Work one
  issue per session, unless the owner runs the `implement-ready-work` skill, which ships the project board's Ready
  column as one PR with one commit per issue (CHG-1's batch exception). Read each issue with `gh issue view <n>` and do what its Scope and Done-when say. If an issue is
  ambiguous or seems wrong, stop and ask instead of guessing.
- `docs/standards/index.mdx`: the engineering standards' table of contents. Before starting any change,
  read Change hygiene, AI collaboration and every page whose row matches the change, and write to those rules.
  Before asking for review, check the change against the same pages. A change to `docs/standards/` contains
  nothing else (CHG-4).
- `docs/project/conventions.md`: the conventions and package maps. Before changing a package, read "Working
  in the repo" and that package's section. Update the page in the same change when what it describes changes.
- Reviewing a PR or branch: use the `pr-review` skill (`.claude/skills/pr-review/SKILL.md`).

## Repo layout (pnpm workspace)
- `packages/schema` (`@questforge/schema`): zod schemas, project load/save, references/rename,
  validation, and the `.quest` format. Node-only code (fs adapter) is exported from `@questforge/schema/node`.
- `packages/engine`: web runtime. Canvas 2D, no runtime dependencies besides the schema. `packages/editor`: Tauri + React editor.
- `docs` (`@questforge/docs`): the Docusaurus site, two sections. `docs/standards/` holds portable, project-agnostic
  engineering standards (`.mdx`, keep it free of Questforge specifics so it can be copied to other repos);
  `docs/project/` holds Questforge's conventions and ideas (plain `.md`, `markdown.format: "detect"`). Dev:
  `corepack pnpm --filter @questforge/docs dev` (port 5179, `docs-dev` in `.claude/launch.json`); build:
  `corepack pnpm --filter @questforge/docs build` (broken links fail it, and CI runs it). `site.yml` copies the build
  into the site's assets under `/docs/` (`baseUrl: "/docs/"`, `trailingSlash: true`).
- `packages/site` (`@questforge/site`): the public splash page (`/`) and `.quest` player (`/play`), deployed to
  Cloudflare. Dev: `corepack pnpm --filter @questforge/site dev` (port 5178, `site-dev` in `.claude/launch.json`).
  `src/download.ts` picks the installer (tested in `test/download.test.ts`); screenshots live in `public/screenshots/` (WebP).
