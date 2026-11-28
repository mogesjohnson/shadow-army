=== comment 6084478520 on 69 at 2026-10-09T15:58:39Z

## Codex review process update (owner instruction, 2026-10-09)

This applies to code, specification, documentation and design reviews for Shadow Army, including this PR. After the normal diff review, check behavioral and design claims against current primary vendor documentation and repository code. Report actionable defects as **[P1]/[P2]**, quoting the affected lines and giving the trigger, outcome, impact, evidence and requested fix. Skip naming, formatting and style unless they hide a bug.

Every review must publish outcomes for these seven scenario families:

1. Stream dies mid tool-call.
2. User cancels after a partial edit.
3. Provider returns a rate limit, a context overflow and a refusal: **three separate cases**.
4. Retry runs after a partial success.
5. Cache hit after a change to model, effort, system prompt or tool schema: **four separate cases**.
6. One model's tool result or error is fed to a second model as context.
7. Cost log uses estimated tokens instead of provider usage.

For a code PR, exercise the reachable behavior in the changed code. For a spec/docs PR, simulate the behavior required by the changed text and quote those lines. For every case, say what happens, or **not reachable** with the contractual/code reason; a docs-only PR is not itself a reason to call a scenario unreachable. Missing specified behavior is an uncertainty to investigate, rather than proof of unreachability. Distinguish executed tests, code inspection and text/protocol walkthroughs explicitly.

Record the exact reviewed commit and verdict. Put the scenario outcomes and vendor/code evidence in visible PR comments or reviews, and attach actionable findings to the relevant changed lines so Claude can act on them. Recheck fixes at the new head before closing a finding. Comments documenting the process do not approve or merge a PR.

**What changes:** the ordinary diff review now has mandatory coverage of each failure above, including designs described in specs/docs, explicit vendor/code checks, and a public record of every outcome.


=== comment 6084661341 on 69 at 2026-10-09T16:09:35Z

## Codex test report: Sol, medium effort

At the owner's request, a **GPT-6.1 Sol subagent at medium effort** tested commit **`3ffc638a9e7050c2cf81f00f5f1d3ab227e17833`** in `AIConnections-v04`. The checkout matched PR #69's head and was clean.

| Check | Result |
|---|---|
| Dependency setup: `npm ci --ignore-scripts` | Installed the 104 locked packages; no hook setup or language-server installation. |
| `npm run build` | Passed. |
| `npx tsc --noEmit` | Passed. |
| `git diff --check` | Passed. |
| Existing scratch `trace-v2.mjs docs/spec/v2.md` | 96 requirements, 50 acceptance criteria, 0 problems. |
| Initial complete `npm test` | **Failed:** 36 files passed, 3 failed; 352 tests passed, 3 failed, 2 skipped. Duration 110.76 s. |
| Targeted hook-test rerun | **11/11 passed** after adding `C:\Program Files\Git\bin` to the test process's PATH. Original failure was confirmed `spawnSync sh ENOENT`; the hook had LF line endings. |
| Targeted UI/workspace rerun | `npx vitest run src/chat/ChatApp.test.ts src/workspace/links.test.ts --maxWorkers=1`, with the same process-local PATH, **passed: 28 passed, 2 skipped** in 28.85 s. |

The initial UI whole-run test timed out waiting for task completion; the claimed-link test exceeded its 5-second timeout. Windows cleanup `EPERM` errors followed. Both passed with one worker, without changing code, tests or timeout thresholds. This indicates environment/timing sensitivity; it does not establish a regression in this docs-only diff.

**Verdict on tests:** all initially failing tests passed on targeted reruns. The original full-suite run remains a failed run; a complete suite with the corrected environment was not rerun.

**Scope:** these are existing legacy implementation tests and structural spec checks. They do not execute the specified v2 failure scenarios or resolve **[P2] C5/C6**, which remain in the [review](https://github.com/mogesjohnson/shadow-army/pull/69#pullrequestreview-5472451558). No live providers or new tests were used.

Final tracked/untracked status is clean; only ignored `node_modules/` and `dist/` were generated. No code/spec/test edits, approval or merge occurred. The owner has assigned merging to Claude and the TypeScript 7 language-server issue/PR to another Codex session.


