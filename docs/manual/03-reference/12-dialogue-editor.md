---
title: Dialogue editor
description: The dialogue graph, its node types and their fields.
sidebar_position: 12
---

# Dialogue editor

The tab that opens when you click a dialogue. A dialogue is a graph of **nodes** joined by connections,
starting at its **Start** node.

## The graph

| Part | What it is |
|---|---|
| Node | A box: one step of the conversation. |
| Port | A dot on a node. Connections go from a node's output ports to another node's input. |
| Minimap | A small map of the whole graph, in the corner. |

- Drag from an output port to empty space to open **Create node** and add a connected node.
- Drag from an output port to a node to connect them.
- Drag nodes to move them.
- Select nodes or connections and press ⌫ / Backspace to delete or disconnect them.
- Connections can also be made from the keyboard.

### Dialogue menu

| Command | What it does |
|---|---|
| **Auto-Layout** | Arranges the nodes neatly. |
| **Fit Graph in View** | Brings the whole graph into view. |

The play button on the graph is **Play from This Node** (Shift+F6): it playtests from the selected node.

## Node types

### Start

Every dialogue begins here. A rule starts it with **Start dialogue**. One output port.

### Line

Someone says a line, then the dialogue carries on.

| Field | What it is |
|---|---|
| **Speaker** | A character, or **Narrator**. |
| **Line** | What they say. |
| **Animation while speaking** | Optional: an animation to play during the line. |

### Choices

A question and the options the player answers with. The question and the options show together in one box. Each
option has its own output port.

| Field | What it is |
|---|---|
| **Speaker** | Who asks the question: a character, or **Narrator**. A character's name shows above the question; the narrator has no name. |
| **Question** | What they ask. Required: with nothing typed, the [Problems panel](./13-problems-panel.md) shows an error and the game can't be played or built. |
| Option text | What the player can say. |
| **Show if…** | Conditions. The option is hidden unless all are true. |
| Once | A once-only option goes away after the player picks it. |

**Add option** adds one; the arrows reorder them and **×** removes one. With no options shown, the dialogue
ends here.

A new **Choices** node starts with an empty question, asked by the speaker of the line it follows (if any). The
node's card in the graph shows the speaker and the question above the options.

### Actions

Runs actions in order, then carries on. Any action from [Actions](./11-actions.md) can be used.

### Branch

Checks conditions. If every condition is true, carries on from the **true** port, else from the **false**
port. With no conditions it's always true.

### End

Ends the dialogue and runs the game's **Dialogue ends** rule for it.

## How a dialogue ends

| Ending | Runs **Dialogue ends**? |
|---|---|
| An **End** node | Yes |
| A port with nothing connected | Yes |
| A **Choices** node with no options showing | Yes |
| A scene change, death, win or restart | No |

When it ends, the rule that started it carries on with its next action.
