# claude contract fixture (M1-AC3)

Not recorded yet: it waits on the owner's recording (B4). `claude.test.ts` covers the same rules with hand-written frames until then; the fixture replays a real session through the same adapter.

## What it must hold

One session of one long-lived `claude -p --input-format stream-json --output-format stream-json --verbose` process, three turns, recorded by the owner (VER-4):

1. The two-prompt task's first prompt, then its second prompt, in the same session.
2. "Use a subagent to count the lines in package.json." as the third turn, so the recording has a subagent's messages (`parent_tool_use_id` not null).

Every frame is kept as claude wrote it, in order, with each frame's stdin message beside it. Per turn it must show:

- `system/init` with `model`, then each main-conversation assistant message's `message.model`;
- the assistant messages with their `usage`, and the `stream_event` frames (`message_start`, `message_delta`) that carry the real output counts;
- the `result` with `usage`, `total_cost_usd` and `modelUsage`, so each turn's figures are its totals less the result before it (CH-2);
- the subagent turn's totals, which grow by more than its main-loop `usage` shows.

## Header (VER-4)

The file records its date, the claude version and the model. It was recorded in a clean checkout of the commit under test, with no secret in the file tree or in claude's environment beyond its own login, redacted (WSP-8), and read whole by the owner before it was committed; the PR says so.

## Not covered by this fixture

A `/clear` turn, a stopped turn and a zero-cost result come from the unit tests. Add each to the recording only if the owner records them.

## The replay (not built yet)

There is no replay runner at this head: it is built with the fixture, once the owner has recorded and read it. It feeds the recorded stdout through `ClaudeChannel` and checks the appended instructions, the permission mode `system/init` reports, that a subagent's messages leave the context size unchanged, and that the three turns' `usage.raw.models` and `costUsd` add up to the last result's `modelUsage` and `total_cost_usd`. Until then the M1-AC3 replay and the M1-AC14 live run are `not_run`; `claude.test.ts` checks the same sums on hand-written frames.
