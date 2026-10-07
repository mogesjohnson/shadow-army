# 0008: Claude is the Monarch

- **Status:** accepted by the owner, 2026-10-06 and 2026-10-07
- **Replaces:** in part, 0002 (lead on the Claude CLI subscription) in `docs/legacy/adr/`

## Context

v1 ran a separate Monarch CLI. It planned every goal in a fresh session, then made a second call to write the report. Measured on 2026-10-06, those two calls cost about 62k tokens for a simple goal, before any soldier worked. Meanwhile the owner already works in a Claude Code session that knows the repository.

## Decision

The owner's own Claude Code session is the Monarch. It plans, sends briefs by name through the mod's `send` tool, and reads five-line summaries. No other process plans for the army.

## Consequences

- The separate Monarch calls disappear, along with re-reading the repository on every goal.
- Each delegation adds turns to the owner's main session, at that session's size. Short summaries keep this cheap (v2 spec MSG-5).
- The Monarch's own permissions stay the owner's. The mod neither widens nor narrows them (HOST-13; open question Q1).
