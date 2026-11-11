---
title: Actions
description: Every action a rule or dialogue can run, in the Do part of a rule.
sidebar_position: 11
---

# Actions

The **Do** part of a rule. Actions run one after another; each waits for the one before it to finish, so a
line of text stays up until the player clicks. Dialogues run the same actions in **Actions** nodes.

The action menu groups them as below.

## Text

### Narrate

The narrator says something.

| Field | What it is |
|---|---|
| **Narration** | The text. |

### Say

A character says a line, in their text colour, playing their talk animation.

| Field | What it is |
|---|---|
| **Character** | Who speaks. |
| **Line** | What they say. |

## Movement

### Walk player to

The player walks to a point.

| Field | What it is |
|---|---|
| **Point** | **X** and **Y**, or **Pick on canvas**. |

### Walk character to

Another character walks to a point in the current scene.

| Field | What it is |
|---|---|
| **Character** | Who walks. |
| **Point** | **X** and **Y**, or **Pick on canvas**. |

### Face

The player turns to face a direction.

| Field | What it is |
|---|---|
| **Facing** | down, up, left or right. |

### Change scene

Takes the player to another scene. The current scene's **Player leaves the scene** rule runs first, then the
new scene's **Player enters the scene** rule.

| Field | What it is |
|---|---|
| **Scene** | Where to go. |
| **Spawn point** | Where in that scene the player appears. |

## Items

### Give item

Puts an item in the player's inventory. Does nothing if they already have it.

| Field | What it is |
|---|---|
| **Item** | The item. |

### Take item

Takes an item away. Does nothing if they don't have it.

| Field | What it is |
|---|---|
| **Item** | The item. |

## State

### Set flag

| Field | What it is |
|---|---|
| **Flag** | The flag. |
| **Value** | **true** or **false**. |

### Add to counter

Adds a number to a counter. Add a negative number to subtract.

| Field | What it is |
|---|---|
| **Counter** | The counter. |
| **Amount** | A whole number. |

### Award points

Adds points to the score. Each award only counts once, however often the rule runs.

| Field | What it is |
|---|---|
| **Points** | How many, 1 or more. |
| **Award** | A name for what the points are for, such as `caught_fish`. |

## World

### Show object

Makes an object visible.

| Field | What it is |
|---|---|
| **Object** | The object. |
| **Scene** | The scene it's in. |

### Hide object

Makes an object invisible. A hidden object can't be clicked and its obstacle stops blocking the way.

| Field | What it is |
|---|---|
| **Object** | The object. |
| **Scene** | The scene it's in. |

### Play animation

Plays an animation once.

| Field | What it is |
|---|---|
| **On** | A character, or an object in a scene. |
| **Animation** | One of the object's one-shot animations, or one of the character's slots. |

### Move character to

Puts a character in a scene at a point, instantly. The game remembers it.

| Field | What it is |
|---|---|
| **Character** | Who moves. |
| **Scene** | Which scene. |
| **Point** | **X** and **Y**, or **Pick on canvas**. |
| **Facing** | down, up, left or right. |

## Audio

### Play sound

Plays a sound effect once.

| Field | What it is |
|---|---|
| **Sound** | The sound. |

### Play music

Starts a music track, replacing the one playing.

| Field | What it is |
|---|---|
| **Music** | The track. |

### Stop music

Stops the music. No fields.

## Flow

### Start dialogue

Starts a conversation. The rule waits until it ends.

| Field | What it is |
|---|---|
| **Dialogue** | The dialogue. |

### Wait

Pauses before the next action.

| Field | What it is |
|---|---|
| **Seconds** | From 0.1 to 60. |

### Die

Ends the game with the **You have died** box, the message and the score. The player can **Restore**,
**Restart** or **Try again** from where they entered the scene.

| Field | What it is |
|---|---|
| **Message** | Why they died. |

### Win the game

Ends the game with the **You won!** box and the score. The player can **Restore** or **Restart**. No fields.
