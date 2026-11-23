# Handoff: orchestrator 7 (`714a5215`) to orchestrator 8 (2026-11-23)

Range on this branch: `fd90d61..` this commit. Only `suggested.md` (S-5, S-6) and the records changed.

**State.**
- **M1b has started.** w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md` (main checkout): 35 tasks, waves, file lists, blockers B1 to B9. Read its section 2 for the order and each task's row for its files.
- **Base (S-5):** integration branch `claude/63-m1b`, pushed at `2b78df6` (= `claude/63-m1a-integrate`). Task branches `claude/63-m1b-<purpose>` start from it, and their draft PRs target it. **A task PR merges into it only with Codex's approval at its head.** Until then, a task that needs an unmerged one branches from that task's branch, and its PR is based there (V14); with two dependencies, merge the second in and name it in `Tracking:`.
- **S-6:** `/send` keeps opening a session as a stand-in until HOST-10 (B1); M1a's write path stays, moved onto harness git in M1b-26 (B2).
- **Done, checked, tabs closed:**

| Task | Worker | PR | Head | Files | Checks |
|---|---|---|---|---|---|
| M1b-2 seam | w21 | #105 | `129c211` | `src/v2/processTree.ts`, `processTree.test.ts`, `contain/{windows,index,index.test}.ts` | Windows pass; Size 350 by `git diff -C` (0d3106a is a pure rename) |
| M1b-6 harness git | w23 | #106 | `30069d8` | `src/v2/git/{harness,harness.test,hostileRepo.testutil}.ts`, `test/fakes/git-hang.mjs` | Windows pass; Linux `harness.test.ts` 6/6 |

- **Running: w22-linux-helper** (M1b-1, Opus, 135k; brief `.shadow/v2-tools/tasks/w22-linux-helper.md`). Built and checked: no warnings, 9/9 build tests, eight hand checks on Linux. It stopped on an AskUserQuestion about V6 (the C file is 382 lines, the PR ~547). orch-7 decided **option 3, no exception**: PR 1 = `native/linux/sa-contain.c` in two commits of ≤200 lines into `claude/63-m1b`; PR 2 = `scripts/build-native.mjs`, its test and `package.json`, stacked on PR 1. The decision is in w22's inbox; it arrives once the owner answers or Escs the dialog in w22's tab. **w22 reports to `orch-7`**: SendMessage it "report to orch-8 instead".
- No CI ran on #105 or #106 (PRs into `claude/63-m1b` trigger no workflow). Their validation is the workers' local runs.
- 5-hour figure 92% at the handoff, resetting at 20:00. No new worker until it is under 80%.

## Next

1. Take w22's report: check both PRs with `git show --stat`, the Size lines and the stack, then close its tab.
2. When the 5-hour figure is under 80%, launch the rest of wave 1 in w20's order: **M1b-13** (spike S7, `spike/s7` branch, never merged) and **M1b-3** (lease), then 11, 14, 4, 5, 7, 8, 9, 10, 12. Briefs follow `w21-contain-seam.md`'s shape. In the brief, give the WSL Node path: `export PATH=$HOME/.local/node/bin:$PATH` (w23 missed it).
3. Wave 2 needs code that isn't merged yet: M1b-15 needs 1 and 2, M1b-16 and M1b-20 need 2, M1b-24 and M1b-25 need 6. Stack them as S-5 says, or wait for Codex.
4. Codex reviews #89 to #106 when the owner runs it.

## For the owner

- w22's dialog: pick 3 or Esc.
- #103's size exception (from orch-6).
- w20's B9: the final `claude/63-m1b` → `main` PR needs a V6 size exception. B6: M1b-32 needs a bundler devDependency (esbuild), which is installing software. B4: claude recordings for AC3 and AC4. B5: the live ACs AC8, AC14, AC22 and VER-9.
- B3, half answered: this PC's `VerifiedAndReputablePolicyState` is 0 (Smart App Control off). S7's case with it on still needs a machine that has it on.

## Notes

- Worktrees added: `w21-contain-seam`, `w22-linux-helper`, `w23-harness-git`. Removing them needs the owner's yes.
- `check_workers.py` lists only live workers. A worker's tab marked "✳" with a long idle time may be at a dialog: take a scaled screenshot with TRACE.
- Previous handoff: `git show fd90d61:docs/spec/review/handoffs/LATEST.md`.
