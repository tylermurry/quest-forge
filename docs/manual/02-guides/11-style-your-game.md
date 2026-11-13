---
title: Style your game
description: Give your game its own frame, font, colors and icon bar, then check the look and share it.
sidebar_position: 11
---

# Style your game

Out of the box your game has a simple gold-edged frame and small white text. Here you give it a look of its own:
your picture around every panel, your font, your colors and your own icon bar. You can leave any part alone and it
keeps the game's own look.

Everything lives in **Game Settings ▸ Styling**. Click **Game** at the top of the Project Browser, then choose
**Frames**, **Typography**, **Character Dialogue**, **Inventory** or **Icon Bar** from the menu on the left. One
preview above the settings shows your changes as you make them. Each section is explained in full in
[Game settings](../03-reference/04-game-settings.md#styling).

## Make and import a frame picture

Draw a frame in any art program: a picture with a border you like around the edge. The corners stay as you drew
them, the sides repeat, and the middle fills in, so it fits panels of every size. A frame with see-through parts
shows the game behind it.

Save it as a **PNG** or **WebP**. Then, in **Frames**, click the **Image** menu and choose **Import image…**. The
picture goes into your **Images** too, so you can use it again.

## Choose the frame and cut it

1. In **Frames**, pick your picture from the **Image** menu. One frame goes around every panel in the game.
2. Drag the **Border size** slider until the guides on the picture sit where the border ends. You can also drag
   any guide, or click one and press the arrow keys to nudge it. All four move together.
3. Set **Scale** to how thick the border should look in your game.

Changed your mind? **Use default look** brings back the frame a new project starts with. See
[Frames](../03-reference/04-game-settings.md#frames) for the details.

A very thick frame (**Scale** above 24) can reach over the sides of the Inventory and the Save and Load screens.
If you use one, look at those panels in the preview and in a playtest.

## Place the narration

Click **Position**, beside the Frames heading. **Top**, **Center** and **Width** decide where narration, speech,
the dialogue choices and the inventory go. They all line up there. See
[Position](../03-reference/04-game-settings.md#frames).

## Pick your font, size and color

1. Open **Typography**.
2. Choose a built-in font from **Font**, or click **Import font…** and pick a WOFF2 or WOFF file. It's packed into
   your game when you build it, so it works offline.
3. Set the **Text size** and **Text color**.

If a font can't be loaded, the game uses a built-in font and the words stay readable. Players can make all the
text larger or smaller in the game's **Settings**. See
[Typography](../03-reference/04-game-settings.md#typography).

## Color conversations

Open **Character Dialogue**. Choose the **Name color** that shows who is speaking, the **Hover effect**
(**Brighten** or **Darken**) for the answer under the pointer, and the **Separator color** for the thin line above
the choices. See [Character Dialogue](../03-reference/04-game-settings.md#character-dialogue).

## Style the icon bar

Open **Icon Bar**.

1. Pick a **Bar frame** picture and cut it with the **Border size** slider, just like the panel frame. The bar
   keeps its own picture and borders.
2. Pick a picture for each of the seven buttons: Walk, Look, Hand, Talk, Item, Inventory and Settings. A button
   you leave alone keeps its built-in icon.
3. Choose **Brighten** or **Darken** for the button under the pointer and the button for the current verb.

See [Icon Bar](../03-reference/04-game-settings.md#icon-bar).

## Leave the Inventory as it is

**Inventory** has no settings yet. Open it to see how your frame looks around the inventory panel.

## Check it in the preview

Above the settings, choose a **Sample**: **Short Narration**, **Long Narration**, **Character Speech**,
**Dialogue Choice**, **Inventory** or **Icon Bar**. Opening a section picks its sample for you. Point at the
answers in **Dialogue Choice**, or move over the buttons in **Icon Bar**, to see the hover look. Drag the bar below
the preview to make it taller, and click **Actual game size** to see it at the size of the game. Long samples show
how your frame and font cope with a lot of words. See [Game settings](../03-reference/04-game-settings.md#styling).

## Go back to the start

**Reset to Default**, at the top right of **Frames**, **Typography**, **Character Dialogue** and **Icon Bar**,
puts that one section back how a new project starts. It asks first, and **Undo** brings your settings back. Your
imported pictures and fonts stay in your libraries.

## Play it, then build it

1. Click **Play** to see your look in the real game, with real narration, conversations, the inventory and the
   icon bar. See [Test your game](./09-test-your-game.md).
2. Fix anything in **Problems**. A picture or font that was deleted but is still used by your styling shows up
   there.
3. Choose **File ▸ Build Game…**. The `.quest` file carries your pictures and font, so it looks the same when
   players open it on the website, even offline. See [Share your game](./10-share-your-game.md).

A game with no styling at all looks and plays just as it always did.
