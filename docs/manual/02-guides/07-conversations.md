---
title: Conversations
description: Write conversations with lines, choices and branches, and start them from your rules.
sidebar_position: 7
---

# Conversations

A **dialogue** is a conversation: characters say lines, and the player picks what to say back. You build it as
a graph of boxes, called **nodes**, joined by lines.

## Create a dialogue

1. Choose **New dialogue** from the **Dialogues** section's **…** menu.
2. The dialogue opens in a tab with a **Start** node. Every dialogue begins there.

## Add nodes

Each node has **ports**: dots you drag from to connect it to the next node.

1. Drag from a node's output port to an empty part of the graph.
2. Choose the kind of node from **Create node**. It's added and connected.

To connect two existing nodes, drag from an output port to the other node. To remove a connection, select it
and press ⌫ / Backspace.

Select a node to edit it in the **Inspector**.

## The kinds of node

| Node | What it does |
|---|---|
| **Line** | A **Speaker** says a **Line**. Leave the speaker empty for the narrator. Optionally play an **Animation while speaking**. |
| **Choices** | Shows options for the player to pick. Each option has its own output port. |
| **Actions** | Runs actions in order, such as **Give item** or **Set flag**, then carries on. |
| **Branch** | Checks conditions. If they're all true it carries on from its **true** port, otherwise from **false**. |
| **End** | Ends the conversation. |

## Write choices

Select a **Choices** node and click **Add option** for each thing the player can say.

- **Show if…** adds conditions to an option. The option is hidden unless they're all true.
- Make an option **once-only** and it goes away after the player picks it, like a question they've already
  asked.

Connect each option's port to what happens next. Loop back to the **Choices** node to let the player ask
another question.

## Start a conversation

A rule starts a dialogue with the action **Start dialogue**. Usually it's the **Talk** rule of a placed
character:

> **When** Talk · **Do** Start dialogue **gardener chat**

The rule waits while the conversation plays, then carries on with any actions after it.

## When it ends

When a dialogue reaches an **End** node, or a port with nothing connected, it runs the game's **Dialogue ends**
rule for that dialogue, if there is one. To add one, double-click **Game**, open **General** then **Rules**, and add a rule with the
trigger **Dialogue ends**.

## Test a conversation

Select a node and choose **Play ▸ Play from This Node** (Shift+F6), or click the play button on the graph.
Playtest starts in the scene that starts this dialogue and plays it from that node.

## More

- **Auto-Layout** in the **Dialogue** menu tidies the graph. **Fit Graph in View** brings it all into view.
- A **Choices** node with every option hidden ends the dialogue.
- Changing scene, dying or winning during a dialogue stops it, without running **Dialogue ends**.
- You can also connect nodes from the keyboard.

## See also

- [Dialogue editor](../03-reference/12-dialogue-editor.md)
- [Actions](../03-reference/11-actions.md)
