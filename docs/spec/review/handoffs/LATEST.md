# Handoff: orchestrator 36 (`0ce47b59`) to orchestrator 37 (2026-11-25)

Range: `0097e52` (orch-35's handoff) to this commit. orch-35's handoff (`git show 0097e52:docs/spec/review/handoffs/LATEST.md`) and orch-34's (`1bc9655`) still hold where not done below. orch-36 started at 81k. The 5-hour figure climbed from 93% to 99%. At 03:26 UTC the owner logged in on another account (5-hour figure 15%), and orch-36 launched w99, w100 and w101.

**Owner, 2026-11-25:** check Codex's reviews at every 5-minute watch tick (comments on #63 since the last tick, and the open PRs' latest reviews and comments). orch-36's script for it: `bash C:/Users/johns/projects/AIConnections/.shadow/v2-tools/tools/codex_tick.sh <since ISO>` (one GraphQL call over the open PRs plus #63 comments). Last tick: 03:20 UTC.

**Lessons:**
- With no workers running, a tick costs about 1.5k of context. An orchestrator that waits out the 5-hour window still reaches 175k: hand off before it.
- Workers overran 150k (w89 164k, w97 161k) while busy in long test runs. Remind them at 145k.

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- orch-35's tab closed.
- **w96-fix138-rest:** #138 at `a14f65e`: C2, C3 and C5 fixed, C4 answered, C1 reply posted (Next 3). The owner-loss test passes on the old code too (libuv's kill-on-close job); said so in the body.
- **w89-fix128:** #128 C1 to C5 coded at `900976f`, stopped at 164k. Left: one 60 s test timeout, the tests for C1 to C6, C6, checks, replies and body. Brief: `tasks/w99-fix128-rest.md`.
- **w97-fix136-rest:** #136 C1 to C3 rest at `2149dfc` with fail-first tests, stopped at 161k. Left: suites on Windows and WSL, replies, body. Brief: `tasks/w100-fix136-close.md`.
- Both `STATE.md` files brought up to date (`71ff077`; the main checkout's is uncommitted by design).
- Queued briefs renamed to orch-36: run `sed -i 's/orch-36/orch-37/g'` on w80, w82, w83, w90, w91, w93, w99, w100, w101 and any new brief.

**Codex review 12 is complete** (summary on #63, 03:08 UTC): changes requested on all five.
- #139 `58c0070` (C1 to C5: P0 1, P1 3, P2 1): `postOffice.ts`, also `watch.ts`, `main.ts`, `claude.ts`.
- #140 `1807198` (C1 to C7: P1 6, P2 1): `cli.ts`, `cli.test.ts`. Brief: `tasks/w101-fix140.md`.
- #141 `201d0d5` (C1 to C6: P0 1, P1 3, P2 2): `postOffice.ts`, `snapshot.ts`.
- #142 `1ddfdbb` (C1 to C5: P0 1, P1 3, P2 1): `postOffice.ts`, `contain/windows.ts`, `contain/trees.ts`.
- #143 `b3f66e9` (C1 to C8: P0 5, P1 2, P2 1): `postOffice.ts`, `trust.ts`.

**Running** (launched 03:27 to 03:28 UTC with the `wt.exe` fallback to save orch-36's context; workers are black and white either way):
- **w99-fix128-rest** (`792a510a`, Sonnet high): #128's rest. Files: `plugins/shadow-army/hooks/register.ts` and its test.
- **w100-fix136-close** (`1b861682`, Sonnet high): #136's checks, replies and body. Files: `postOffice.ts`, `postOffice.test.ts`, `client.test.ts`, `src/workspace/session.ts`, `snapshot.ts`, `snapshot.test.ts`.
- **w101-fix140** (`9b8b67ae`, Sonnet high): #140, review 12. Files: `src/v2/cli.ts`, `cli.test.ts`.

## Next

1. Close each worker when it reports (check the head first). Their briefs name orch-36: SendMessage each your name. A worker that stops with a `## Left` gets a fresh task on the same files.
2. **`postOffice.ts` queue, one at a time:** w100, then `w98-fix137` (orch-35's Next 2: #137 C1 to C8; merge #136's fixed head into `claude/63-m1b-po-startup` first; give it `server.ts`; C1 and C4 need `sweep.ts` and `contain/trees.ts`), then `w93-fix133`, then #139, #141, #142 and #143 (review 12; write their briefs from each PR's review), then the PO-14 gate (#127 C2; #127 must not merge before it).
3. **#138 C1** (lossless FILETIME, Opus medium): orch-35's Next 3. #142 touches the same `contain/` files, so run it before #142.
4. **`register.ts` queue:** w99, then w90-fix131, then w91-fix134 (also `sweep.ts`: not beside Next 3 or w98).
5. Free to run beside the others: w80-fix114 (`sanitize.ts`), w82-fix119 (roster and instructions), w83-fix117 (`scripts/check-spec-trace.mjs`).
6. orch-33's Next 6 and 7 (each tick's review check; Codex batch 14 when reviews 6 to 12 are fixed; orch-32's Next 6).
