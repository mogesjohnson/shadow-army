# 0014: The owner steers: stop a turn, control the queue, facts on the card, one list of decisions

- **Status:** accepted on 2026-10-08 with spec v0.3 (#68), and amended by spec v0.4 (#69). It was proposed the same day, from Codex's review of the design canvas.

## Context

Spec v0.2 lets the owner watch every soldier well, but gives few ways to correct one mid-turn:

- A message to a busy soldier waits until the turn ends, so a soldier heading the wrong way keeps going.
- Queued instructions cannot be seen or withdrawn, and they can become harmful once the plan changes.
- A summary card says the soldier answered. It does not say whether files changed, whether tests ran, or whether the work reached the folder.
- Approvals, handoffs, logins and failures each ask for attention in their own place.

The review also found state that read two ways: a message to a disconnected soldier was "queued" on one page and "failed" on another, and "handing off" meant both writing a summary and waiting for the owner.

## Decision

- **Stop a turn.** s in the pane, or `/stop`, stops a running turn through the CLI's own interrupt. The session and the work so far stay. Afterwards the soldier's queue is held until the owner sends it (MSG-9, CH-10).
  - A stop also cancels any approval request the turn has open. Stopping is the owner's answer, and it approves nothing (CH-6).
  - The next message goes in only once the stopped turn has ended (CH-10).
- **The queue is visible.** The owner can see, cancel or change any queued message before it is delivered (MSG-10).
- **One meaning for each message state.** A queued message waits, and goes by itself once it can, including after a reconnect. A message ends as interrupted (delivered; the turn may have changed files), not delivered (nothing was sent), or cancelled. "Failed" is no longer a state (MSG-3, MSG-4).
- **Facts on the card.** Beside "answered", the summary card states the changes on the branch, whether tests ran and passed, and whether the work is applied. These come from git and the tool-call record, never from the summary's text (MSG-11, WSP-9).
- **One list of decisions.** Everything that waits on the owner is in one list, and a new decision gets no toast of its own while another is open (HOST-14, HOST-8). Briefs sent in one turn wake Claude once (MSG-8).
- **State that reads one way.** "Preparing handoff" is separate from "handoff ready", which needs the owner (SES-4). The meter names both measures (SES-2). States that need the owner keep their word at every width, names shorten to unique two-letter tags (VIS-6, HOST-6), and every surface is drawn at 24 rows (VIS-3).

## Consequences

- Each channel needs an interrupt. Spike S6 checks each CLI, and agy in particular. A CLI without one, or one whose turn does not end after the stop, is stopped by ending its process tree and resuming its session.
- A turn ended that way has no end event, so the post office finishes it: the checkout guard and the claim audit run once, before the session resumes or another message goes in (PO-8).
- A turn is over only when its work has stopped. Background work a CLI keeps running after its end event, such as claude's background commands, belongs to that turn, and s stops it (PO-8).
- A session service is not that work. A language server or MCP server that the CLI's own configuration declares, and that the CLI keeps for the whole session, never holds a turn open, and s leaves it running. Any process not declared that way stays the turn's work (PO-8).
- A message ends as the CLI's own end event says. A turn the CLI reports as failed, such as after a rate limit or a context overflow, ends its message as interrupted, with the error and the work so far. A completed turn, or a refusal, is answered (PO-8).
- The post office has to record each turn's tool calls and the branch's state, so that the card's facts do not depend on what a model says.
- The mod gains `/stop`, `/queue`, `/decisions`, `/diff` and `/apply`, and the pane gains the keys s, q, g, d, x and c.
