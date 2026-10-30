# Handoff: session 22, the main session (session "main"), to the next session (2026-10-30)

Written by the main session at its save point, at 67k by the cockpit's context line. The owner's N1 decision is recorded, V24-FC1 is done and v0.25 is applied. The next session's one task is fix check V25-FC1. The previous handoff is `git show 74edc93:docs/spec/review/handoffs/LATEST.md`.

## How this session worked

As in sessions 20 and 21, with the three forks one after another, since each step needed the last one's text: fork1 drafted the owner's N1 decision; main applied it and froze `v2@d3cc343.md`; fork2 ran V24-FC1 on that snapshot (one Opus `spec-verifier`, high), with the decision text as its point 5; fork3 drafted all of V24-FC1's findings. Main sent fork3's N2 back once (see below). All three forks have done their one task and stopped.

## The range

- Start `74edc93`. End: the commit that last changed this file. `git diff 74edc93..HEAD --stat` shows it all.
- Paths: `docs/spec/v2.md`; `ledger.md`; `decisions.md` (D-38 answered); `batches/V24-FC1.md` (the packet); `raw/V24-FC1.md`; `drafts/v025/` (`repairs1.txt`, `pairs1.json`, `pairs1-decisions.json`, `ledger1.json`, `rows1.txt` from fork1; `repairs3.txt`, `pairs3.json`, `ledger3.json`, `rows3.txt` from fork3).
- Commits: `cb70c92` and `d3cc343` (the decision drafted and applied), `1d65067` (V24-FC1), then fork3's drafts and `5e90643` (v0.25 batch 3 applied).

## What is finished

- **The owner's N1 decision** (`d3cc343`): wherever a start's comparison holds harness git, the hold message names the file, says the change can't be told apart from the owner's own, and says how to release it (in M1, undo the edit); M1-AC10 tests the M1 line. The two M2 ideas (Accept this config; Inspect the issue against the project's goals, with its three safety rules) are open question Q10 in section 8, citing D-38 and R-M1-269. New row R-M1-278; D-38 marked answered; the Version row's 0.25 entry begins with it.
- **V24-FC1** (fork2; `raw/V24-FC1.md`): FIXED 5, SOUND 5, FAITHFUL 3, CONFIRMED 5, REFUTED 2; nothing NOT FIXED, NOT SOUND or NOT FAITHFUL. fork3 notes the counts line disagrees with the table (4 SOUND rows, 1 REFUTED row covering five files); the ledger follows the table. New findings N1 to N10.
- **v0.25 batch 3** (fork3, `5e90643`), 18 pairs, rows R-M1-279 to 288, 11 ledger verdicts:
  - **N1, P1** (fork3 settled it from the spec text: nothing named harness git's git folder, so it found it by plain discovery through a snapshot's `.git` file, as WSP-12 840 assumes). WSP-10 795 now gives harness git `GIT_DIR`, `GIT_WORK_TREE` and `GIT_COMMON_DIR` from what Shadow Army knows (the folder's own, or the log's `worktrees/<id>` entry), and 798's comparison also covers each snapshot's and worktree's `.git` file. M1-AC10 checks the environment with a recording git on `PATH`.
  - **N2, P2, main's call:** fork3 first took the verifier's `--ignore-submodules=all`, which would stop the checkout guard seeing a soldier's change inside a submodule. Main sent it back. Now 798 compares each checked-out submodule's `.git` file and its `.git/modules/<name>/` `config`, `hooks/` and `info/` (snapshots included; the snapshot command trusts the submodules it checks out), 795 names the submodule's `.git` file as the one exception to the environment rule, and the guard's and claim audit's listings get `--ignore-submodules=none` so a `.gitmodules` `ignore=all` can't hide changes (fork3's addition beyond the fix text). `submodule.recurse=false` was dropped (status ignores it). M1-AC10's case holds harness git for a submodule's filter and its rewritten `.git` file, and still finds a write inside the submodule.
  - N3 to N10 (P3): a removal cut short (its entry deleted at the next start), the `commondir` AC, M2-AC5's release text, the example line's timing, the M1 line shows no file and no diff (pointing at 799), PO-5's guard-closed record, M1-AC16's real sweep, residual 15's wording. fork3's choices are in `repairs3.txt`'s header.
  - Both checkers give 0 problems: `trace-v2.mjs` on an LF copy against `v2@d3cc343.md`, and `check-appendix-c.mjs`. `git diff --check` is clean.
- **Snapshot frozen:** `.shadow/v2-tools/review/snapshots/v2@5e90643.md` (in the main checkout's `.shadow`, LF).

## Next: the one task, V25-FC1

Run fix check V25-FC1 on `v2@5e90643.md`: one Opus `spec-verifier` at high, packet in the shape of `batches/V24-FC1.md` (pair-to-line map from `drafts/v025/pairs3.json`). It checks:

1. **N1 (P1)**: the environment rule at 795 and the `.git` file comparison at 798. Does naming `GIT_DIR`/`GIT_COMMON_DIR` break anything harness git does in a snapshot or worktree (WSP-11 811's write check, 798's HEAD check, WSP-12 840)? Is there still a file that redirects config or objects (`objects/info/alternates`, `config.worktree` with `extensions.worktreeConfig`, `info/grafts`, `shallow`)?
2. **N2 (P2)**: main's alternative. Is the submodule comparison complete (nested submodules, a submodule added or removed by the soldier, `.gitmodules` changes, a submodule's `commondir`)? Does the guard still see every change inside a submodule with `--ignore-submodules=none`, and does running git in a compared submodule stay safe?
3. N3 to N10, and fork1's decision text (FAITHFUL in V24-FC1; check only that batch 3 didn't break it).
4. Whether any repair broke a neighbour.

Then save the report to `raw/V25-FC1.md`, and repair what it confirms as v0.26. After a clean fix check, run round 5 for F and M1 (`drafts/r3/PROMPTS.md`'s lenses, two reviewers per unit).

## Left open

- Main decided N2 itself (a technical call that keeps the checkout guard whole). The owner may overrule it.
- The owner's other questions are unchanged: P-17's Windows cases, the haiku model mismatch, alpha Q4 deferred until A6, the `Co-Authored-By: Ziggy` line on PR #81, and the cockpit mod's "+" choice.
- Cheaper process (Sonnet drafting forks, owner calls settled before forks start): still not adopted.
