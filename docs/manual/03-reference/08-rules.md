---
title: Rules
description: The Rules tab, quick text, the rule card and how rules are edited.
sidebar_position: 8
---

# Rules

The **Rules** tab of the Inspector, for anything that can have rules. For how rules run, see
[Rules: how a click becomes an action](../01-concepts/03-rules.md).

## Who has rules

| Owner | Triggers |
|---|---|
| Objects, placed characters, hotspots | **Look**, **Hand**, **Talk**, **Walk**, **Use** |
| Regions | **Player walks in** |
| Scenes | **Player enters the scene**, **Player leaves the scene** |
| The game | **Combine**, **Dialogue ends** |

## Quick text

Objects, placed characters and hotspots have three boxes at the top of the Rules tab: **Look text**, **Hand
text** and **Talk text**. Typing in one makes a simple rule: **When** that verb, **Do** Narrate the text.

The box keeps that rule up to date. If you add conditions or other actions to it, the box shows which rule
now sets it instead.

## Rules list

**Checked top to bottom: the first rule that matches runs.**

- **Add rule** adds a rule at the end.
- Drag a rule by its handle to reorder it. You can also reorder from the keyboard.
- The tab's label shows how many rules there are, with a warning mark if any has a problem.

## The rule card

| Part | What it does |
|---|---|
| **When** | The trigger. Some triggers have more to choose, such as **Use** with an item. |
| **If** | Conditions. **+ Condition** adds one. All must be true for the rule to run. |
| **Do** | Actions, numbered, run in order. **+ Action** adds one. Use the arrows to move an action up or down, and **×** to remove it. |
| **Once** | When on, the rule only ever runs one time. |
| Rule menu (**…**) | **Duplicate rule**, **Delete rule**. |

Parts with a problem are marked, with the problem written beside them.

## Pickers

Fields that choose something (an item, a scene, a flag) open a picker:

- Type to search.
- **Create … and use it** makes a new one with the name you typed and uses it, in one step.

Spawn points and objects are chosen from the scene picked in the same action or condition.

## Points

Actions that need a place, such as **Walk player to**, have **X** and **Y** fields and **Pick on canvas**.
Click **Pick on canvas**, then click the spot in the scene. The scene must be open in a tab. Esc cancels.

See [Triggers](./09-triggers.md), [Conditions](./10-conditions.md) and [Actions](./11-actions.md) for each
part.
