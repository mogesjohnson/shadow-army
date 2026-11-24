# Handoff: orchestrator 20 (`b1e03056`) to orchestrator 21 (2026-11-24)

Range on this branch: `4c77771..` this commit (this file and `STATE.md`). orch-19's handoff is `git show 4c77771:docs/spec/review/handoffs/LATEST.md`; its Next item 4 and its For the owner still hold. orch-20 started at 16:25 UTC at 79k and handed off at about 16:50 at about 165k. Working notes: `.shadow/v2-tools/tasks/orch-20-notes.md` in the main checkout.

**Done.**
- Closed the tabs of orch-19, w52 and w54.
- **#137** (w52, `1c2566f`; 250 lines, 2 files, 2 commits, draft): the EPERM teardown flake is fixed (`Promise.allSettled` over the two guard captures) and `HarnessHold` is wired in. orch-20 reran what low memory had stopped. Windows full `npm test` passes: 67/67 files, 623 passed, 14 skipped. WSL `postOffice.test.ts` passes: 24 passed, 10 skipped. The body and a PR comment are updated.
- **#138** (w54, `d90b753`, `claude/63-m1b-claude-list` into `claude/63-m1b-exit-grace` (#135), draft; 224 lines, 5 files, 2 commits): the Windows job listing with process identities, the guardian identity, and both passed through `ClaudeChannel` and `NativeChannel`. Windows `npm test`: 627 passed, 14 skipped. WSL passes. Build notes: start times are Unix ms, not 100 ns FILETIME (`trees.ts` takes safe integers only, and the sweep compares ms); exit code 259 caveat. The `postOffice.ts:331` guardian hookup is described in #138's PR comment.
- **Chain 2 base** `claude/63-m1b-base-po-chain2` (`a1c1b56`) = #137's head plus a merge of #135.

- **#139** (w53, `58c0070`, `claude/63-m1b-po-chain2` into the chain 2 base, draft; 152 lines, 3 files, 1 commit): M1b-27 PR 1, items 1 and 2 (the guard waits for background work; a backlog pauses soldiers). Windows `npm test`: 635 passed, 14 skipped. Linux passes the changed files. Tab closed by orch-20.

No worker is running. w53 followed the spec over the brief on item 1: a declared session service never holds the guard (PO-8, M1-AC11). Its notes for items 3 to 6 are under `## Left` in its brief.

## Next

1. Close orch-20's tab once the cockpit marks it parked.
2. **Launch w55-po-chain2b** now (brief ready: `.shadow/v2-tools/tasks/w55-po-chain2b.md`, Opus medium). PR 1 is #139.
3. (w53 is done.) It does items 3 to 6 on `postOffice.ts` (serial after w53).
4. **Then the guardian hookup**, a short task on `postOffice.ts` after w55: pass the channel's guardian identity into `TreeRecord` (`postOffice.ts:331`), as #138's comment says. Its base is the chain 2 base plus a merge of #138.
5. Then M1b-28, as orch-19's Next item 4 says.

## For the owner

- Codex's review queue: drafts #89 to #138, none reviewed.
- Memory: Claude Code stopped w52's and orch-19's background jobs because of low memory. Keep at most two workers and one full test run at a time. A full Windows `npm test` takes about 13 minutes.
