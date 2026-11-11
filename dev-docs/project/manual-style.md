# User manual style guide

How the user manual (`docs/manual/`, served at `/docs/`) is written. Read it before writing or changing a
manual page. The page list is in [manual-outline.md](manual-outline.md) and the features it must cover are in
[feature-inventory.md](feature-inventory.md).

## Reader

A creative person who has never programmed. They may have played point-and-click adventures and may have art
or a story. They don't know what a polygon, a state or an ID is until a page tells them. Never assume they read
another page first, except the Concepts section.

## Shape

1. **Concepts**: the mental model, taught before any feature. What Quest Forge does, the building blocks and
   how they connect, how rules turn a click into actions, what the game remembers, and how a game gets from
   the editor to players.
2. **Guides**: task-first pages about what you're making ("Build a scene"). Each one ends by linking to the
   reference pages it touched.
3. **Reference**: everything, one entry per thing: every panel, menu, field, trigger, condition and action.

There's no tutorial, no getting-started page, and no sample game. Examples are small and live on the page that
uses them.

## Voice

Model: Stripe's docs. Clean, task-first, as few words as the reader needs.

- Speak to the reader as **you**. Their hero is "the player" or "your hero".
- Lead with what the reader wants to do, then how. One idea per sentence. Short paragraphs (three sentences
  at most).
- Warm but restrained. Adventure-game flavour belongs in examples (a pond, a fishing rod, a grumpy gardener),
  never in instructions. No jokes in steps.
- Plain words: "draw", "click", "drag", "pick". Explain a term the first time a page uses it, or link to where
  Concepts explains it.
- No code, no file formats, no YAML. The reader never edits project files by hand.

| Write | Not |
|---|---|
| Draw the floor where your hero can walk. | The walkable polygon defines the navigable region. |
| Rules are checked top to bottom. The first one that matches runs. | Rule evaluation uses first-match semantics. |
| Click **Play**. | Simply click Play. / Just hit Play! |

## Words

- The product is **Quest Forge** (two words). The file a game builds into is a **`.quest` file**.
- Use the app's on-screen labels **exactly**, in bold: **Build Game…**, **Walk-to Point Tool**,
  **Player walks in**. Check the label in the app or in [feature-inventory.md](feature-inventory.md).
- Menu paths use ▸: **File ▸ Build Game…**. Panels and tabs: the **Inspector**, the **Rules** tab.
- **Build Game**, never "export". **Playtest** (the noun and the activity), **Play** (the button).
- **Name** is what players read; **ID** is what rules use. Never call an ID a name.
- The things on the scene's layers are **objects**, **placed characters**, **hotspots** and **regions**. "Thing"
  is fine for "any of these".
- Say "the player" for the person playing and "the player character" only when the difference matters.

## Keyboard shortcuts

Both platforms inline, Mac first: **Save** (⌘S / Ctrl+S), **Redo** (⌘⇧Z / Ctrl+Shift+Z). Keys with no
modifier are written once: press **P** for the **Polygon Tool**. Function keys: **F5**, **Shift+F5**.
Every shortcut also appears on the Menus and keyboard shortcuts reference page.

## Page templates

Every page has front matter with `title`, `description` (one sentence, used in link previews) and
`sidebar_position`.

**Concept page**

1. One paragraph: what this idea is and why it matters to the reader.
2. The idea, built up in short sections, with a diagram where a picture is clearer than words.
3. A "Where to next" line linking the guides that use it.

**Guide**

1. One sentence: what you'll make.
2. Numbered steps for the common case. One action per step; the label in bold.
3. Short sections for the next most common variations.
4. A **More** section for edge cases, limits and shortcuts.
5. **See also**: the reference pages this guide touched.

**Reference page**

1. One sentence: what this part of the app is.
2. One `##` entry per item (field, menu command, trigger, condition, action), in the order the app shows
   them. Each entry: what it does, its fields, and for rule parts an example written as the rule card reads
   ("When **Use** with **fishing rod**").
3. No step-by-step instructions; link to the guide instead.

## Callouts

Docusaurus admonitions, only these three, at most two per page:

- `:::tip Tip` a faster or better way.
- `:::note Note` something that would otherwise surprise the reader.
- `:::warning Watch out` something that loses work or breaks the game.

## Diagrams

Mermaid, written in the page (```` ```mermaid ````). The docs site renders them in light and dark themes.

- Use them for ideas, not for the UI: how the building blocks connect, how a click becomes an action, the
  path from editor to player.
- At most about ten boxes. Labels in the app's words. Never carry meaning by colour alone.
- Every diagram is followed by text that says the same thing, so a reader who can't see it loses nothing.

## Scope

- Document only what works today. Leave out features that are planned and not yet in the app. When an issue
  ships a feature, it adds or updates the manual page in the same change.
- Where a feature works only partly, document the part that works. Don't mention what's missing.
- No screenshots or video. Describe where a control is by its label and panel instead.

## Keeping it true

- Every **Shipped** row in [feature-inventory.md](feature-inventory.md) is covered by at least one page, as
  listed in [manual-outline.md](manual-outline.md).
- A change that adds, removes or renames something a user sees updates the inventory and the manual pages
  that mention it, in the same change (DOC-1).
- Check every step against the running editor before committing it.
- `corepack pnpm --filter @questforge/docs build` must pass. Broken links fail it.

## Files

Pages live in `docs/manual/<nn>-<section>/<nn>-<page>.md`. The number prefixes set the order and are dropped
from URLs (`/docs/concepts/building-blocks/`). Each section folder has a `_category_.json` with its label.
Use `.md` (CommonMark). Switch to `.mdx` only when a page needs a component.
