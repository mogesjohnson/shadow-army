# Handoff: orchestrator 1 (`c3d0e213`) to orchestrator 2 (2026-11-23)

**State.**
- **The spec is frozen as v0.28** (`7055b8d`; snapshot `.shadow/v2-tools/review/snapshots/v2@7055b8d.md`). F and M1 have no open P0 or P1.
- **M1a is the slice** (v2.md section 6, under M1):
  - requirements HOST-2, PO-1, PO-2, PO-3, PO-7, CH-1, CH-2, SI-2, SEC-6, WSP-11, VER-1 and VER-8, plus HOST-11 and WSP-2 pulled forward;
  - ACs M1-AC23 to M1-AC29, each naming its test;
  - the command `/send <soldier> --claim <path> <brief>`.
- **B1 is done:** #75's transport, cut to M1a, on `claude/63-m1a-transport` (`2ab8925`, 19 commits within V6, no PR yet, `suggested.md` S-3). Locally on Windows: 457 tests pass, 91.51% line coverage.
- **CI is off.** The CI, PR format and mac probes workflows are all disabled by hand on GitHub, so local runs are the only evidence. Turning them on is the owner's call.
- **Previous handoff:** `git show 5d1b013:docs/spec/review/handoffs/LATEST.md`.

**Limits (the owner, 2026-11-23).**
- You hand off at **175k**; workers stop at 150k.
- Workers launch at medium effort.
- Watch the workers every 5 minutes with `.shadow/v2-tools/tools/check_workers.py <your id prefix>` (RUNBOOK section 0.2).

**First:**
1. Start your hi timer and the 5-minute watch timer.
2. Close orch-1's tab once the cockpit marks `c3d0e213` parked.

## Running workers

Both run Sonnet at medium. Their briefs are in `.shadow/v2-tools/tasks/`, and they report to `orch-2` (told by message and in their briefs).

| Worker | Session | Task | Files | Branch |
|---|---|---|---|---|
| `w6-mod-send` | `a735f860` | B2: `/send` and the summary row (M1-AC23, M1-AC25) | `plugins/shadow-army/**`, `src/v2/modRelay.ts`, new tests | `claude/63-m1a-mod`, draft PR on B1's branch |
| `w7-write-path` | `322d14a7` | B3: claims, claim audit and guard (M1-AC24, M1-AC26, M1-AC27) | `src/v2/postOffice.ts` and its test, `channel.ts`, new tests | `claude/63-m1a-write`, draft PR on B1's branch |

Both were started at 90% of the 5-hour figure, on the owner's word. If the limit stops one, its hi timer resumes it after the reset.

## Next

1. **Check B2's and B3's reports.** Run `git show --stat` on each, check the PR bodies against CLAUDE.md, and check the local test and coverage figures. Then close their tabs.
2. **B4: apply** (M1-AC28). Stack it on B3's branch: a new `src/v2/apply.ts` and its test wrap v1's `workspace/apply.ts`, plus one call site in `postOffice.ts`. The change lands in the owner's folder uncommitted. Write the brief in the shape of `w7-write-path.md`.
3. **M1-AC29, the live run,** needs the owner: a real claude soldier in one of the owner's own repositories, on Windows. Write the steps for the owner once B2 to B4 are in.
4. **Codex reviews the code PRs** when the owner runs Codex. Merge only with Codex's approval at the head, with merge commits (V13, V14).

## For the owner

- **S-3:** how B1 reaches review. The recommendation is one PR under a V6 size exception, in the owner's words.
- **CI:** the workflows are disabled.
- **S-1:** the T3 Code trial; it installs software.
- **Older open questions:**
  - P-17's Windows cases;
  - alpha Q4, deferred;
  - the `Co-Authored-By: Ziggy` line on #81;
  - the cockpit's "+" choice.
- **Choices left to the builder:** build notes R-F-177, R-F-183 and R-F-184.

## Notes

- Run the spec checkers on the committed LF text: on the CRLF working copy, `trace-v2.mjs` reports false problems.
- Lead each launch prompt with the task. Near-identical prompts started together trip the cockpit's duplicate stop, as happened to w7's first launch.
- orch-1 committed its records from `../AIConnections-worktrees/orchestrator-1-spec-review`, detached at the review branch, with `git push origin HEAD:claude/63-ultimate-spec-review`. You can reuse that worktree.
