---
title: Game settings
description: Settings and rules that apply to the whole game.
sidebar_position: 4
---

# Game settings

Double-click **Game** at the top of the Project Browser (or select it and press **Enter**). The **Game Settings**
tab opens in the middle of the window, with the Inspector hidden to give it room. Closing the tab or switching to
another tab brings the Inspector back. Selecting **Game** with a single click only shows a button that opens the tab.

The tab has two parts: **General** and **Styling**. Each has a list of sections down the left.

## General

The sections of **General** are **Start**, **Score**, **Default Responses** and **Rules**.

### Start

**Play starts in** a scene **at** a spawn point. A new game, and **Play** in the editor, start here.

### Score

**Max score**: the total the player can score, shown in the game as "Score: 5 of 25". A whole number, 0 or
more. Award points with the **Award points** action.

### Default Responses

What the narrator says when no rule answers. Quest Forge checks the thing's rules first, then uses these.

| Response | Used when the player… | Starts as |
|---|---|---|
| **Look at something with no rule** | looks at something with no matching rule. | "You see nothing special." |
| **Hand on something with no rule** | touches something with no matching rule. | "You can't do that." |
| **Talk to something with no rule** | talks to something with no matching rule. | "Nobody answers." |
| **Use an item that doesn't work there** | uses an item where no rule expects it. | "That doesn't work." |
| **Combine items that don't go together** | combines two items with no **Combine** rule. | "Those don't go together." |

Walking has no default response: it's just a walk.

### Rules

Rules that work anywhere. They have two triggers:

- **Combine**: the player uses one inventory item on another. Either order matches.
- **Dialogue ends**: a dialogue reaches its end.

See [Rules](./08-rules.md) and [Triggers](./09-triggers.md).

## Styling

The sections of **Styling** are **Shared Frames**, **Typography**, **Icon Bar** and **Dialogue Choices**.
Each one has a preview on the right that shows your changes at once.

### Shared Frames

One picture can frame every panel in your game: narration, speech, the dialogue choices and the inventory. You
make the picture in any art program and import it like any other image (PNG or WebP). A frame with see-through
parts shows the game behind it.

For now this section sets up and previews the frame. Your game does not draw it on its panels yet; that arrives in a
later update.

Click the **Image** menu to pick a picture from your Images, or click **Import image…** to add a new one from
your computer. Click **Use built-in look** to go back to the game's own panels. The picture stays in your Images
either way.

Questforge cuts the picture into nine pieces so it fits panels of any size:

- The four **corners** are never changed.
- The four **edges** repeat along each side to fit.
- The **centre** repeats to fill the middle.

You choose where the cuts are. The picture is shown large with four lines, called guides, one for each side.

- Drag a guide to move it. One drag is one step for **Undo**.
- Click a guide and press the arrow keys to move it one pixel at a time. Hold **Shift** to move ten.
- Or type the border sizes, in pixels, into **Left border**, **Right border**, **Top border** and **Bottom border**.
  The numbers and the guides always match.

Guides stay inside the picture. If the left and right borders (or the top and bottom borders) use up the whole
picture, a warning appears: there is no centre left to repeat, so the game draws only the corners and leaves the
middle of the panel empty. Move a guide back to fix it.

The preview on the right draws the frame the way the game does, on a sample background so you can see any
see-through parts. Pick a **Sample** (one sentence of narration, several paragraphs, a character speaking, the
inventory or dialogue choices) to see the same frame on each panel. Pick a **Shape** (narrow, wide, tall or short)
to see how it stretches, and **Zoom** to look closer. The preview doesn't change your game.

### Typography

The font, size and colour of the words in your game: narration, speech, the dialogue choices, the buttons and the
panel titles.

Until you change something here, your game keeps its original look: small, white, typewriter-style text. The first
change you make switches to your own typography, starting from **16 pixel** white text.

- **Font**: pick one of the built-in fonts (**Monospace**, **Serif** or **Sans-serif**), or a font you imported.
  Click **Import font…** to add a WOFF2 or WOFF font file from your computer. The font is packed into your game
  when you build it, so it works offline. If a font can't be loaded, the game uses a built-in font instead and the
  words stay readable. The editor tells you when that happens.
- **Text size**: the size in pixels, from 6 to 72.
- **Text colour**: click the colour square to pick one.

A character's own colour stays on their name and on the outline of their speech box. Your text colour is used for
the words themselves. Once you pick your own typography, narration is shown on the same dark panel as speech, so
white text can be read.

Players can make all the text larger or smaller in the game's **Settings**. Their choice is a percentage of the
size you set here, so what you pick is always the starting point. Very long text is shown a little smaller when it
would not fit on the screen, so it is never cut off.

The preview on the right uses your frame from **Shared Frames** and draws text the way the game does. Pick a
**Sample** (one sentence of narration, several paragraphs, a character speaking or dialogue choices) and **Zoom**
to look closer. Each change shows at once.

### Dialogue Choices

How the answers look when a conversation offers choices. The answers use your frame from **Shared Frames** and your
text from **Typography**. Here you pick two colours:

- **Highlight colour**: fills the whole answer the player points at or selects. Its text turns black or white on
  its own, whichever is easier to read on your colour.
- **Separator colour**: the colour of the thin line along the top of the choices. Its thickness and spacing are
  set by the game.

Until you change a colour, the choices keep their original look: a gold highlight and no extra line. The first
change you make adds the line, using the game's pale gold unless you pick another colour.

The preview shows a character speaking and four answers in your frame and text. Point at an answer, click it, or
press the up and down arrow keys to see its highlight. The choices stay where they are in the game, and long
lists still have pages.

### Icon Bar

The row of buttons across the top of your game: Walk, Look, Hand, Talk, Item, Inventory and Settings. You can give
the bar its own frame and a picture for each button. Anything you leave alone keeps the game's own look, and the
bar stays the same size and in the same place.

Until you change something here, the bar keeps its original look, with a gold square under the button you are
using. The first change you make switches to your own look, with the **Brighten** effect.

- **Bar frame**: pick a picture (PNG or WebP) from your Images, or click **Import image…**, and cut it into nine
  pieces with the same guides and border boxes as [Shared Frames](#shared-frames). The bar's borders are its own;
  they don't change the panels' frame. The frame is drawn across the whole bar, so see-through parts show the game
  behind it. With a frame, the buttons have no background of their own: only the pictures show on it. If the
  picture can't be loaded, the bar keeps its original look.
- **Button pictures**: pick a picture for each of the seven buttons. Each one is fitted inside its button with its
  proportions kept, so it is never stretched. A button with no picture keeps its built-in icon, and **Use built-in**
  puts it back. Make the pictures in any art program; you don't need a sprite sheet. The **Item** picture shows
  while the player has no inventory item selected. Once they select an item, the button shows that item's own
  picture, as it always has.
- **Hover / Active effect**: choose **Brighten** or **Darken**. The button under the mouse and the button for the
  current verb get the same effect, on the picture only: see-through parts stay see-through and the button behind
  it does not change.

The preview on the right is the real bar, drawn the way the game draws it, over a soft multicoloured background so
you can see any see-through parts. Move the pointer over it to see the hover look, and click a button, or press the
left and right arrow keys, to see the selected look. Each change shows at once. The preview doesn't change your
game.

When you click a problem about the game's start, score, default responses or rules in the **Problems** panel, the
Game Settings tab opens on the right section and highlights the setting.
