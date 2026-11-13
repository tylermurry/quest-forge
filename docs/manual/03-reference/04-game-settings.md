---
title: Game settings
description: Settings and rules that apply to the whole game.
sidebar_position: 4
---

# Game settings

Click **Game** at the top of the Project Browser (or select it and press **Enter**). The **Game Settings** tab opens
in the middle of the window, with the Inspector hidden to give it room. Closing the tab or switching to another tab
brings the Inspector back.

A menu down the left lists the sections under two headings, **General** and **Styling**. Click a section to show it.
The menu stays where it is while you scroll through a long section.

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

The sections of **Styling** are **Frames**, **Typography**, **Character Dialogue**, **Inventory** and **Icon Bar**.
One preview sits above all of them and shows your changes at once. It stays where it is while you scroll through a
section's settings below it.

- Pick a **Sample** to see: **Short Narration**, **Long Narration**, **Character Speech**, **Dialogue Choice**,
  **Inventory** or **Icon Bar**. Opening a section switches to its sample (Frames to **Short Narration**, Character
  Dialogue to **Character Speech**, Inventory to **Inventory**, Icon Bar to **Icon Bar**); Typography keeps
  whichever sample is showing.
- Drag the bar between the preview and the settings to make the preview taller or shorter. The game screen grows
  and shrinks to fill it, keeping its shape.
- While the game screen isn't exactly the game's own size (640 by 400 pixels), **Actual game size** appears.
  Click it to size the preview so the game screen is exactly that size.
- With **Dialogue Choice**, point at an answer, click it, or press the up and down arrow keys to see its hover effect.
  With **Icon Bar**, move the pointer over the bar to see the hover look, and click a button, or press the left
  and right arrow keys, to see the selected look.

**Reset to Default**, at the top right of Frames, Typography, Character Dialogue and Icon Bar, puts just that section
back to how a new project starts: the built-in frame picture with narration in its usual place, the default font
size and color, the default name color and choice look, and the built-in icon bar. It asks you first, and **Undo**
brings your settings back. Your imported images and fonts stay in your libraries, the other sections don't change,
and players keep their own **Text size** setting. The button is greyed out while the section already looks as it
did in a new project. In a project made before Styling existed, resetting a section switches it to the new-project
look.

The preview draws everything the way the game does, on the same checkerboard a scene with no background shows, so
you can see any see-through parts. It doesn't change your game.

### Frames

One picture frames every panel in your game: narration, speech, the dialogue choices and the inventory. You make
the picture in any art program and import it like any other image (PNG or WebP). A frame with see-through parts
shows the game behind it.

For now this section sets up and previews the frame. Your game does not draw it on its panels yet; that arrives in a
later update.

Beside the Frames heading, a bar switches between its two parts, **Panel Frame** and **Position**. The frame is set
up in **Panel Frame**. A new project starts with a default frame: a simple gold-edged panel, the picture `frame.jpg` in the **Styling**
folder of your Images. Click the **Image** menu to pick another picture from your Images, or click **Import image…**
to add a new one from your computer. Click **Use default look** to go back to the default frame; if you deleted
`frame.jpg`, it is added back. The button is hidden while the default frame is in use. Pictures you pick stay in your
Images either way.

Questforge cuts the picture into nine pieces so it fits panels of any size: the four corners stay as drawn, the
four edges repeat along each side, and the centre repeats to fill the middle. The four borders always move
together, so every corner is the same square.

- Drag the **Border size** slider to set the borders roughly. **Scale** sits right under it (see below).
- Drag any of the four guides on the picture to fine-tune. All four move together, and one drag is one step for
  **Undo**.
- Click a guide and press the arrow keys to move it one pixel at a time. Hold **Shift** to move ten.

The borders always leave at least one pixel in the middle to repeat. A frame from an older project whose borders
use up the whole picture shows a warning: the game draws only the corners and leaves the middle of the panel empty.
Move the slider or a guide to fix it.

**Scale**, under **Border size**, sets how thick the borders are drawn in the game, from 8 to 64 pixels (16 to start with). The picture is
drawn bigger or smaller so that its borders are that thick, whatever size you made it, and everything else scales
with it. There is no extra padding: the words start right inside the borders, so the borders you cut decide how
much room there is around them.

In **Position**, where the panels go. Narration, speech, the dialogue choices and the inventory all go here, in the
game and in the Styling preview, so they all line up. Every panel is centred across the screen, and speech no longer
sits above the character who is talking: the speaker's name at the top of the box says who it is.

- **Top**: how far down the screen the panel starts, in pixels (50 to start with).
- **Center**: puts the panel in the middle of the screen, top to bottom. The **Top** slider is turned off while it
  is ticked, and keeps its value for when you untick it.
- **Width**: how wide the panel is, as a percentage of the screen (60% to start with), so it stays in proportion
  to the game. The panel grows taller to fit its words.

A panel that would run off the bottom of the screen is moved up until it fits. The inventory is never narrower
than its row of buttons, so they stay big enough to tap.

Until you change something here, your game keeps its original placement: narration a little above the middle,
speech above the speaker, the choices along the bottom and the inventory in the middle. The first change you make
moves them all to your position.

### Typography

The font, size and color of the words in your game: narration, speech, the dialogue choices, the buttons and the
panel titles.

New projects start with **14 pixel** white text. A project made before typography existed keeps its original look
(small, white, typewriter-style text) until you change something here; the first change switches it to your own
typography, starting from 14 pixel white text.

- **Font**: pick one of the built-in fonts (**Monospace**, **Serif** or **Sans-serif**), or a font you imported.
  Click **Import font…** to add a WOFF2 or WOFF font file (point at the info icon beside it for a reminder) from your computer. The font is packed into your game
  when you build it, so it works offline. If a font can't be loaded, the game uses a built-in font instead and the
  words stay readable. The editor tells you when that happens.
- **Text size**: the size in pixels, from 6 to 72.
- **Text color**: click the color square to pick one.

Your text color is used for the words themselves, speech included. Speakers' names use the name color from
[Character Dialogue](#character-dialogue), and a character's own color stays on the outline of their speech box. Once you pick your own typography, narration is shown on the same dark panel as speech, so
white text can be read.

Players can make all the text larger or smaller in the game's **Settings**. Their choice is a percentage of the
size you set here, so what you pick is always the starting point. Very long text is shown a little smaller when it
would not fit on the screen, so it is never cut off.

### Character Dialogue

How speech and conversation choices look. They use your frame, position and width from **Frames** and your text from
**Typography**.

- **Name color**: the color of every speaker's name, pale gold to start with. One color is used for every
  character, so names always match. What they say uses your text color from **Typography**.
- **Hover effect**: how the answer under the pointer is marked: **Brighten** (to start with) or **Darken**. The
  answers have no box around them and sit right next to each other, so the pointer is always on one; the effect
  lights up or shades the whole answer, with rounded corners, and the pointer turns into a hand.
- **Separator color**: the color of the thin line along the top of the choices. Its thickness and spacing are
  set by the game.

New projects start with **Brighten** and the line in pale gold. A project made before these settings existed keeps
its original look (each answer on a gold-edged button, no extra line) until you change the effect or the separator;
the first change switches it to plain answers with the effect and adds the line.

The choices go where you put the panels in **Frames**, and long lists still have pages.

### Inventory

For now this section has no settings: opening it shows the inventory panel in your frame in the preview, so you can
see how the frame looks around it. Settings for the inventory arrive in a later update.

### Icon Bar

The row of buttons across the top of your game: Walk, Look, Hand, Talk, Item, Inventory and Settings. You can give
the bar its own frame and a picture for each button. Anything you leave alone keeps the game's own look, and the
bar stays the same size and in the same place.

Until you change something here, the bar keeps its original look, with a gold square under the button you are
using. The first change you make switches to your own look, with the **Brighten** effect.

- **Bar frame**: pick a picture (PNG or WebP) from your Images, or click **Import image…**, and cut it into nine
  pieces with the same **Border size** slider and guides as [Frames](#frames). The bar's borders are its own;
  they don't change the panels' frame. The frame is drawn across the whole bar, so see-through parts show the game
  behind it. With a frame, the buttons have no background of their own: only the pictures show on it. If the
  picture can't be loaded, the bar keeps its original look.
- **Button pictures**: pick a picture for each of the seven buttons. Each one is fitted inside its button with its
  proportions kept, so it is never stretched. A button with no picture keeps its built-in icon, and **Use built-in**
  puts it back. Make the pictures in any art program; you don't need a sprite sheet. The **Item** picture shows
  while the player has no inventory item selected. Once they select an item, the button shows that item's own
  picture, as it always has. If a button's picture is no longer in your Images, or its file can't be loaded, a
  message beside it says so and the button keeps its built-in icon.
- **Hover / Active effect**: choose **Brighten** or **Darken**. The button under the mouse and the button for the
  current verb get the same effect, on the picture only: see-through parts stay see-through and the button behind
  it does not change.

The preview's **Icon Bar** sample is the real bar, drawn the way the game draws it, across the top of the screen.

When you click a problem about the game's start, score, default responses or rules in the **Problems** panel, the
Game Settings tab opens on the right section and highlights the setting.
