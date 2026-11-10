# Questforge

Questforge is a no-code desktop editor for classic point-and-click adventures. A storyteller or artist who has never programmed can import art, layer it into scenes, draw clickable areas, give them rules, playtest in the editor, and build a game that runs on desktop and mobile.

## What is in this repository

| Folder | What it is |
|---|---|
| `packages/schema` | The project file format: schemas, loading and saving, validation, and the `.quest` built-game file. |
| `packages/engine` | The web runtime that plays a game (Canvas 2D). |
| `packages/editor` | The desktop editor (Tauri and React). |
| `packages/site` | The public web site: the home page and the `.quest` player. |
| `templates/demo` | "The Lantern", the demo game, made only in the editor. |
| `docs` | The documentation site (Docusaurus), which renders `docs/standards` and `docs/project`. |

## Getting started

You need Node 22 or newer. Run pnpm through corepack, which picks the pinned version:

```sh
corepack pnpm install
```

Run the typecheck and all tests:

```sh
corepack pnpm check
```

Start a dev page (each one reloads as you edit):

```sh
corepack pnpm --filter @questforge/engine dev   # the game runtime, http://localhost:5174
corepack pnpm --filter @questforge/editor dev   # the editor in a browser, http://localhost:5175
corepack pnpm --filter @questforge/site dev     # the public site, http://localhost:5178
corepack pnpm --filter @questforge/docs dev     # the documentation, http://localhost:5179
```

The desktop app needs [Rust](https://rustup.rs). Start it with:

```sh
corepack pnpm --filter @questforge/editor tauri dev
```

## Documentation

- [`docs/standards/`](docs/standards/index.mdx): the engineering standards every change is held to.
- [`docs/project/`](docs/project/README.md): what Questforge is and how it is built (the vision, the specs and the decision log).
