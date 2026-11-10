# 02 — Rule Vocabulary

**North Star:** see [README](README.md). Decisions: D37, D40, D41.

## Purpose
This closed set of words is everything a designer can express. It must cover KQ6-style puzzles while staying small enough that every option fits in a dropdown. Anything else is a feature request, not a scripting hatch.

## Rule shape
`WHEN <trigger> [IF <all conditions>] DO <actions in order>`, plus a `once` toggle.

## Triggers
| Trigger | On |
|---|---|
| `look` / `hand` / `talk` / `walk` | hotspot, object, character |
| `use_item <item>` | hotspot, object, character |
| `combine <item> + <item>` | game-level (inventory) |
| `enter_region` | region |
| `scene_enter` / `scene_exit` | scene |
| `dialogue_end <dialogue>` | game-level |

## Conditions
`has_item` · `not has_item` · `flag is true/false` · `counter <op> n` (`= ≠ < >`) · `visited <scene>` · `object visible/hidden` · `first time` (rule never fired).

## Actions
| Category | Actions |
|---|---|
| Text | `narrate "<text>"` · `say <character> "<text>"` |
| Movement | `walk_player_to <point>` · `walk_character_to <character> <point>` · `face <dir>` · `change_scene <scene> <spawn>` |
| Items | `give_item` · `take_item` |
| State | `set_flag` · `add_to_counter` · `award_points <n> <award-id>` (each award-id counts once) |
| World | `show_object` · `hide_object` · `play_animation <target> <anim>` · `set_character_position` |
| Audio | `play_sound` · `play_music` · `stop_music` |
| Flow | `start_dialogue` · `wait <seconds>` · `die "<message>"` · `win_game` |

## Evaluation (D40)
- When a trigger fires, the target's rules are checked top-to-bottom; the **first** rule whose conditions pass runs. The rest are skipped.
- If nothing matches: game-level default response for that verb ("You can't do that.", "Nobody answers.").
- Actions run in order; text and movement actions block until finished. Player input is locked during a sequence (Sierra behavior).

## Acceptance
- [ ] Every demo puzzle is expressible with only this vocabulary (checked in spec 15).
- [ ] Unit tests cover first-match, `once`, award dedupe, and default fallbacks.
