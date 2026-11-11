---
title: Sound and music
description: Add music to your scenes and sound effects to anything that happens.
sidebar_position: 8
---

# Sound and music

Give each scene its music, and play sound effects when things happen.

## Import sounds

Drag MP3, OGG or WAV files onto the **Audio** section of the **Project Browser**, or click **Import files…**.
Select a sound to listen to it in the **Inspector**.

## Give a scene music

1. Click an empty part of the scene to select it.
2. In the **Inspector**, choose a track under **Music**.

The music starts when the player enters the scene. If the next scene has the same track, it carries on without
restarting. **None (keep what's playing)** leaves whatever is already playing.

## Play music and sounds from rules

| Action | What it does |
|---|---|
| **Play sound** | Plays a sound effect once. |
| **Play music** | Starts a music track, replacing the one playing. |
| **Stop music** | Stops the music. |

For example, on a door:

> **When** Hand · **Do** Play sound **door_creak** · Change scene **Shed** at **default**

## Players control the volume

Players can turn music and sound effects up or down separately, under **Settings ▸ Volume** in the game.

## See also

- [Actions](../03-reference/11-actions.md)
- [Scene things](../03-reference/06-scene-things.md)
