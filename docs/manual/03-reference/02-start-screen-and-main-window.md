---
title: Start screen and main window
description: The start screen and the parts of the editor window.
sidebar_position: 2
---

# Start screen and main window

The start screen opens and creates projects. The main window is where you make your game.

## Start screen

### New project

Type a **Game title** and click **Create blank project**, then choose a folder to put it in. The new project
has one scene (**First Scene**) with a stand-in background, a walkable floor and a `default` spawn point; a
player character; and default responses.

### Open folder…

Opens an existing project folder.

### Recent projects

Projects you've opened before. Click one to open it.

## Title bar

| Control | What it does |
|---|---|
| Back arrow | Returns to the start screen (**File ▸ Back to Project Selector**). Asks first if there are unsaved changes. |
| Game title | The open game. |
| Undo and Redo arrows | **Edit ▸ Undo** and **Edit ▸ Redo**. |
| **Save** | Saves changes to the project folder. Shows **Unsaved changes** or **Saving…**. |
| **Play** | Starts a playtest. Its arrow has **Play from here** and **Start from preset**. While playing, **Restart** and **Stop** take its place. |
| Panel buttons | Show or hide the Project Browser, Problems and Inspector. |

## Project Browser

On the left. Every building block in your game. See [Project Browser](./03-project-browser.md).

## Editor tabs

In the middle. Double-click a scene, item, character, dialogue or image in the Project Browser to open it here.
Each opens in its own tab. Close a tab with its **×**.

## Inspector

On the right. The details of what's selected. For anything that has rules, it has two tabs: **Details** and
**Rules**. A warning mark on **Rules** means some rules have problems.

## Problems

At the bottom. Everything wrong with the game. See [Problems panel](./13-problems-panel.md).

## Saving and undo

- Nothing is saved until you click **Save**. Playtest and Build Game use your unsaved changes too.
- Undo keeps your last 500 changes. Each change is one step, labelled in the **Edit** menu, such as
  **Undo Move object**.
- Changes to the project's files from outside Quest Forge are loaded automatically.
