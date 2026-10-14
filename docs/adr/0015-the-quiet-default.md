# 0015: The quiet default: Margin's composition, with decisions at the head of the army

- **Status:** accepted by the owner on 2026-10-13, from the v2.1 design exploration. Spec v0.5 applies it.

## Context

Spec v0.4 says what each of the mod's surfaces shows, but not how they come together on the screen. The owner's design agent explored six whole-screen compositions built from v2's surfaces, on the v2.1 canvas (https://claude.ai/artifact/D75uVeeX9HGrvf43BdyVxB, version 8):

- War Table: the pane zoomed to the whole width, as a board of soldier cards around the Monarch.
- Campaign Timeline: a lane per soldier on one clock.
- Gatehouse: the needs-you tab grown into a list of the whole army, with the selected card under it.
- Review Desk: the d view, finished with a landing check before `/apply`.
- Margin: the quiet mode, with no host change.
- Summoning Circle: the owner's `/send` as a pane view.

A review on 2026-10-13 checked each design against v0.4. War Table needs a pane that can take the whole width, which only Claude Code can give. The Timeline needs the post office to keep one ordered event log.

## Decision

- **Margin is the default.** The owner works in Claude's transcript. The mod adds its rows there, each with a bar in its soldier's colour (HOST-11), and the strip, the status-line entry and toasts carry the rest. The pane opens only when asked for, or when a soldier needs the owner (HOST-3, VIS-1).
- **While you were away.** After 10 minutes with no input from the owner, once the army has settled, one digest says what changed: answers with their facts, what waits on the owner, what went cold, and the cost reported (HOST-15).
- **Gatehouse is the pane's first tab.** The decisions stay one list, oldest first. Below them the tab lists the rest of the army in groups. A chosen row's card opens under the list, where it is answered. A new decision never replaces the card the owner is reading (HOST-14).
- **A broad allow takes two presses.** An approval option that allows more than one request, such as "allow for this session", is sent only on the second press of its key, because the CLI decides what it covers (HOST-5).
- **Not adopted:** Review Desk and Summoning Circle.
- **Held:** War Table, until a pane can take the whole width, and the Timeline, until the post office keeps one ordered event log.

## Consequences

- The default needs no change to Claude Code.
- The pane's first tab still shows only while something waits, and it now lists the rest of the army as well.
- The digest needs an idle timer in the mod, and the post office's records of what changed and when (PO-6, OBS-3).
- Each adapter has to tell a broad allow from a one-time one, from its CLI's own options.
