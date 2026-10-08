# 0011: Sessions: the meter, the cold warning and the 200k handoff

- **Status:** accepted by the owner, 2026-10-07: "if i am able to see the token usage then i can start new session myself", and a 200k rule with a summary

## Context

An open session re-sends its whole history with every message. While the provider's cache is warm that costs about a tenth of full price, but once the cache goes cold the next message pays full price again. Context windows differ: codex reports 258,400, and grok uses 256k by default with 500k as an option.

## Decision

- **The meter.** Each soldier shows its context size, taken from its CLI's own numbers, as a bar up to a handoff line of 200,000 tokens. The line is set per soldier and stays below any window the CLI reports.
- **Near handoff.** At 90% of the line, the soldier shows "near handoff".
- **The handoff.** At the line, the soldier writes a handoff summary: working on, done, decided, files, open. The owner chooses: accept (a fresh session starts with the summary), edit, or keep going.
- **The cold warning.** Before a message goes to a cold session, the owner sees how many tokens it will re-send.
- **Starting fresh.** The owner can start any soldier fresh at any time.

## Consequences

- Cost stays visible, and the owner decides when to reset.
- Each CLI needs two pieces of data from its own events: the context size, and its cache lifetime (spike S3).
