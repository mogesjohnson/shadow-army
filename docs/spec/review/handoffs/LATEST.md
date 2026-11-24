# Handoff: orchestrator 16 (`ff294482`) to orchestrator 17 (2026-11-24)

Range on this branch: `c5754f0..` this commit. Changed: this file and `STATE.md`.

orch-16 started at 06:31 UTC at 71k and handed off at about 06:50 at about 165k. It closed orch-15, w44, w45 and w46, made two combined bases, and launched w47 and w48. Working notes: `.shadow/v2-tools/tasks/orch-16-notes.md` in the main checkout.

**State.**
- M1b runs on `claude/63-m1b` (S-5). w20's plan is `.shadow/v2-tools/tasks/w20-m1b-plan-report.md`.
- **Codex has reviewed none of #89 to #132.** All M1b PRs are drafts waiting at their heads: #105 to #128 as in the previous handoffs (`git show c5754f0:docs/spec/review/handoffs/LATEST.md`), plus these four, each checked against its `Size:` line and within V6:
  - #129 M1b-21 trees and failure path `62c53e1` (on #125; 319 lines, 2 files, 2 commits; orch-16 corrected its `Size:` from 321)
  - #132 M1b-21 sweep and the `sweepMain` entry `4483698` (on #129; 272 lines, 3 files, 4 commits). M1b-21 is complete as #129 + #132.
  - #130 M1b-22 server log `9338b48` (on #126; 30 lines, 4 files, 1 commit; orch-16 corrected its `Size:` from 25)
  - #131 M1b-30 mod trust dialog `7166886` (on `claude/63-m1b-base-mod-trust`; 94 lines, 2 files, 1 commit)
- **S-7 bases**: as before (`linux-driver` `665cea7`, `server-wiring` `08ba067`, `mod-preflight` `bb85f2f`, `mod-trust` `1c6c264`), plus `claude/63-m1b-base-watch` `783ef13` = #130 + #129, and `claude/63-m1b-base-mod-sweep` `e0a48fd` = #131 + #132.
- 5-hour figure: 55% at 06:47 UTC. GitHub Actions is still off.

**Running, both reporting to "orch-16, or the next orch".**

| Worker | Model | Task | Files | Base |
|---|---|---|---|---|
| w47-watch-shutdown | Opus medium | M1b-23, two stacked PRs past 300 lines (watch, then the main/post office wiring), plus the trees close-path caller (`remove()` after end, failure helpers when `close()` throws) | `src/v2/watch*`, `main.ts`, `postOffice.ts` (close path), `postOffice.test.ts` (shutdown cases), `server.ts` (export only), new `test/fakes/` | `claude/63-m1b-base-watch` |
| w48-mod-sweep | Sonnet medium | M1b-21's mod caller: run `sweepMain` when the post office's output ends with no shutdown event, one transcript line | `plugins/shadow-army/hooks/register*` | `claude/63-m1b-base-mod-sweep` |

At 06:48: w47 128k (may stop at 150k with a `## Left`), w48 68k. Briefs: `.shadow/v2-tools/tasks/<name>.md`. Check each report with `git show --stat` per commit and `gh pr view <n> --json additions,deletions` against the PR's `Size:` line (additions plus deletions), then close its tab.

## Next

1. If w47 stops with a `## Left`, launch a fresh worker on what is left, same files and base (its branch).
2. **M1b-26** (post office chain 1: `postOffice.ts`, `postOffice.test.ts`, `postOffice.fixes.test.ts`) after w47 is done: base = w47's top head. Add to it the callers left for M1b-26: `TreeRecord.create` before start and `listing()` after `list()` (w44, #129), and `sweepTrees` before opening channels (w44, #132). Opus medium; split past 300 lines. Then M1b-27, then M1b-28 (add w45's `trust` command, below), all serial on `postOffice.ts`.
3. Blocked as before: M1b-16/17 (B3), M1b-18/19/33/34/35 (CI off, no local macOS), M1b-32 (B6).
4. Caller work for later, as in the previous handoffs plus:
   - w45 (#131): the post office needs a `trust` command, `{action:"trust"}` -> `{files:[{name,status,hash|null}], details?}` and `{action:"trust",accept:[{name,hash}]}` -> `{ok}` or `{ok:false,reason}`, built on `src/v2/trust.ts`. Goes with M1b-28 (trust gating).
   - w44 (#132): not built: macOS sweep ops (needs M1b-18), the PO-13 checksum check, and the Windows creation-time unit (must be Unix ms in M1b-17).
5. For M1b-33 (from w35): `docs/spec/v2.md` on `claude/63-m1b` is stale (lacks M1-AC24 to 28).

## For the owner

- Codex's review queue: open drafts #89 to #132, none reviewed. M1b keeps going on combined bases (S-7).
- orch-15 says it answered orch-16's cockpit duplicate dialog ("Continue as orch-16") itself; orch-16 surfaced this to the owner.
- As before: the thin M2 slice question (orch-11, not yet in `suggested.md`); M1-AC29 live run not recorded; GitHub Actions; #103's size exception; B3, B4, B5, B6, B9; unused cockpit worktrees `orch-8` to `orch-16` under `AIConnections-worktrees/` (orch-16's holds local branches `claude/63-m1b-base-watch` and `claude/63-m1b-base-mod-sweep`, both pushed).

## Notes

- Start-up reading plus the TRACE skill took orch-16 from 71k to 105k. Read only RUNBOOK section 0 and this file; skip `orch-*-notes.md` unless needed.
- One launch costs about 6k with one `screenshot: "scaled"`; closing a tab costs about 2k.
