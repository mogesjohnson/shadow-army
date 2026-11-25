# Handoff: orchestrator 35 (`974562bf`) to orchestrator 36 (2026-11-25)

Range: `1bc9655` (orch-34's handoff) to this commit. orch-34's handoff (`git show 1bc9655:docs/spec/review/handoffs/LATEST.md`) and orch-33's (`d0c2180`) still hold where not done below. orch-35 started at 79k and handed off at about 150k, early on purpose (see Lessons).

**Owner, 2026-11-25:** check Codex's reviews at every 5-minute watch tick (comments on #63 since the last tick, and the open PRs' latest reviews). Last tick: 02:20 UTC. Review 12 is landing PR by PR; its summary is not on #63 yet.

**Lessons:**
- **TRACE images are the context cost.** orch-35 went from 79k to 146k in 20 minutes closing four tabs and launching three workers. Use `screenshot: "none"` and `returnObservation: "none"` everywhere, except the one `scaled` check of a typed launch line.
- The 5-hour figure was 78% at 02:18. Start no worker at 80% or more.

**Done** (each report checked with `git show --stat` at the PR's head, tab closed):
- orch-34's tab closed.
- **w94-fix135-138:** #135 at `9398604` (C1, C2, C4 fixed, C3 answered, body and reply posted). #138: #135 merged in at `4743d90`; C2 to C5 left (now w96), C1 split out (Next 3).
- **w92-fix136-137:** #136 partly fixed at `5279ee7` (no replies, no body); #137 untouched. The rest is w97 and Next 2.
- **w95-fix132-linux-end:** #132 at `977117a`: C2 closed on both systems (`sa-contain end` binds the kill to a pidfd; Windows keeps its held handle), WSL runs recorded, body updated (456 lines, size exception).
- Queued briefs now name `orch-35`: run `sed -i 's/orch-35/orch-36/g'` on w80, w82, w83, w90, w91, w93 and on any new brief, and SendMessage the running workers your name.

**Decisions** (can be undone, inside the repo):
- #136 C1: wire `src/workspace/session.ts`'s `ws.finish` and `openWriteSession` through the harness git under the hold, rather than switching writes off (which would break apply, server and slice).
- #136 C2: the Windows ACL reader is M1b-17's work, a build note; the `snapshot.ts:37` default bypass is fixed now.
- #136 C4's startup retry of a logged unfinished removal is fixed in #137 (PO-1 startup).
- #138 C1 (lossless FILETIME) is its own task (Next 3).

**Running** (three live, all launched 02:16 to 02:18):
- **w96-fix138-rest** (`2ab83ca5`, Opus medium): #138 C2 to C5 from w94's draft. Files: `channel.ts`, `claude.ts`, `claude.test.ts`, `contain/windows.ts`, `contain/windows.test.ts`.
- **w97-fix136-rest** (`df51e77a`, Opus medium): #136's rest. Files: `postOffice.ts`, `postOffice.test.ts`, `client.test.ts`, `src/workspace/session.ts`, `snapshot.ts`, `snapshot.test.ts`.
- **w89-fix128** (`a6cd365e`, Sonnet high): #128. Files: `plugins/shadow-army/hooks/register.ts` and its test.

**Codex review 12, seen so far:** #139 at `58c0070` changes requested (C1 [P0] `postOffice.ts:584`, `:644`: closing a session wakes the guard before the tree teardown finishes); #140 at `1807198` changes requested (C1 [P1] `cli.ts:144`, `:156`: Ctrl+C aborts the trust controller while a plain send is in flight).

## Next

1. Close each worker when it reports (check the head first). A worker that stops with a `## Left` gets a fresh task on the same files.
2. **`postOffice.ts` queue, one at a time:** w97, then `w98-fix137` (#137 C1 to C8: merge #136's fixed head into `claude/63-m1b-po-startup` first; give it `server.ts` for C2's lock-before-recovery; C1 and C4 need `sweep.ts` and `contain/trees.ts`, so either run it apart from Next 3 or answer them as Next 3's), then `w93-fix133`, then #139 (review 12), then the PO-14 gate (#127 C2, orch-33's Next 3; #127 must not merge before it).
3. **After w96:** the #138 C1 task (Opus medium): the exact Windows FILETIME carried losslessly (string or bigint) in `Identity` (`contain/trees.ts`, #129), the lock's identity, the tree-record parser and the sweep's compare (`contain/sweep.ts`, #132), with `windows.ts` emitting it; millisecond records count as too weak for a destructive decision. Stack it after #129 and #132.
4. **`register.ts` queue:** w89, then w90-fix131, then w91-fix134 (also `sweep.ts`: not beside Next 3 or w98).
5. Free to run beside the others: w80-fix114 (`sanitize.ts`, Sonnet high), w82-fix119 (roster and instructions, Sonnet medium), w83-fix117 (`scripts/check-spec-trace.mjs`, Sonnet medium), and #140 (`cli.ts`) once review 12's summary lands.
6. orch-33's Next 6 and 7 (each tick's review check; Codex batch 14 when reviews 6 to 12 are fixed; orch-32's Next 6).
7. Neither `STATE.md` was updated by orch-34 or orch-35: bring both up to date at the next milestone.
