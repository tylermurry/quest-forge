---
title: Make things interactive
description: Make things the player can click, and write the rules that say what happens.
sidebar_position: 4
---

# Make things interactive

Give the player things to look at, touch and talk to, and decide what happens when they do.

## Draw a hotspot

A **hotspot** is a clickable area drawn over part of the background, like a pond or a window.

1. Open the scene. In the **Layers** panel, click **Hotspots**.
2. Choose the **Polygon Tool** (**P**) or the **Rectangle Tool** (**R**) and draw around the thing.
3. Type its **Name (shown to the player)** in the **Inspector**, for example "pond".

Objects and placed characters are clickable too, as long as they have a name.

## Set where the player stands

When the player uses a hotspot, they walk over to it first. Choose exactly where they stand:

1. Choose the **Walk-to Point Tool** (press **W**).
2. Click the hotspot, then click where the player should stand. Drag to set which way they face.

Without a walk-to point, the player walks to the nearest place they can stand.

## Say something: quick text

Most things only need a line of text. Select the hotspot, object or character, open the **Rules** tab in the
**Inspector**, and fill in the **Quick text**:

- **Look text**: what the narrator says when the player looks at it.
- **Hand text**: what happens when they touch it.
- **Talk text**: what happens when they talk to it.

Each box makes a simple rule for you, listed under **Rules**.

## Write a rule

For anything more than a line of text, write a rule.

1. Select the thing and open the **Rules** tab.
2. Click **Add rule**.
3. Under **When**, choose the trigger: **Look**, **Hand**, **Talk**, **Walk** or **Use**. For **Use**, choose
   the item too.
4. Click **+ Condition** to add conditions, if the rule should only run sometimes.
5. Click **+ Action** to add what happens. Add as many as you need: they run in order.

For example, a rule on a gate:

> **When** Hand · **If** Flag `gate_unlocked` is true · **Do** Narrate "It swings open." · Change scene
> **Garden** at **from_gate**

Pickers list everything you can choose. If what you need doesn't exist yet, type a name and choose
**Create … and use it** to make it on the spot.

## Rule order and Once

The rules list is **checked top to bottom: the first rule that matches runs.** Drag a rule by its handle to
move it. Put the most specific rules first.

Switch on **Once** for a rule that should only ever run one time, like finding a coin under a mat.

## Regions

A **region** is an invisible area of floor that does something when the player walks into it, like the path
out of the garden.

1. In the **Layers** panel, click **Regions** and draw the area.
2. In the **Inspector**, open **Rules** and add a rule. Its trigger is **Player walks in**.

A common region rule is **Change scene**, to take the player to the next room.

## When the player enters or leaves a scene

Click an empty part of the scene to select the scene itself, then open **Rules**. Its triggers are **Player
enters the scene** and **Player leaves the scene**. Use them for things like a welcome line or starting music.

## Default responses

When the player tries something that no rule answers, the narrator gives a **default response**. Click
**Game** in the **Project Browser** to change them under **General** then **Default Responses**, one for each of Look, Hand,
Talk, Use and Combine.

## More

- **Pick on canvas**, next to a point in an action such as **Walk player to**, lets you click the spot on the
  scene. The scene must be open in a tab.
- A rule's **…** menu has **Duplicate rule** and **Delete rule**.
- If you edit a quick-text rule by hand, its box shows it's now set by that rule.
- **Walk** rules run when the player walks to the thing with the Walk verb. Without one, Walk just walks.

## See also

- [Rules: how a click becomes an action](../01-concepts/03-rules.md)
- [Rules](../03-reference/08-rules.md), [Triggers](../03-reference/09-triggers.md),
  [Conditions](../03-reference/10-conditions.md), [Actions](../03-reference/11-actions.md)
