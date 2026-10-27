# Road to first alpha

- **Status:** proposed by Grok Bot on 2026-10-25, for the owner and Claude to review. Nothing here is decided until the owner accepts it.
- **Tracking:** #63. Template source: [BEST-OF-AI-DEV](https://github.com/mogesjohnson/BEST-OF-AI-DEV) `template/` and its `docs/migrations/shadow-army.md`.
- **Scope:** a sequence of small PRs. Part A adopts the owner's template. Part B gets one real task through the v2 shape end to end. No code changes in this PR.

## Where we are (checked 2026-10-25 on `main` at `ab04992`)

- `main` still runs v1: `sa army`, `sa summon` (with `--write`, claims, worktree, claim audit, guard and apply), `sa route`, `sa run`, `sa vault`, `sa locks`, `sa worktrees`. v1 is legacy (ADR-0013), frozen at `v1.0.0` / `v1.0.1`.
- The v2 design is spec `docs/spec/v2.md` v0.5 (ADR-0008 to ADR-0015). Its first build milestone, M1 (post office and the claude channel), is draft #75: about 4,500 added lines under `src/v2/`, paused for a spec update, with CI red on coverage.
- Open drafts this plan must not trip over:
  - #75 M1 post office (`src/v2/`, `plugins/shadow-army/`, `native/`, `ci.yml`, `package.json`);
  - #76 spec v0.6 and #77 spec review (docs only; #76 adds an 85% coverage rule);
  - #71 TypeScript 7 Claude plugin (#70);
  - #79 CI matrix by event (#78), waiting on a Codex review;
  - #81 CI budget watchdog (#80).
- Actions minutes for October are used up; CI is off until 2026-11-01. Every "verify" step below is local.
- Rule files today: `CLAUDE.md` (agent rules), `CONTRIBUTING.md` (process), `rules.md` and `agent.md` (**runtime inputs**: `src/core/rules.ts` puts them into every brief, and `package.json` ships them), `orchestratorDelegate.md` (routing policy the code loads). There is no `AGENTS.md`.
- Commits and PR titles must start with `#<issue>` or `[F<n>]` (`.githooks/commit-msg`, `scripts/pr-format.mjs`). The template wants Conventional Commits with `Refs:` footers. Part A treats that switch as its own decision (A6).

## Ground rules for every PR below

- One PR per step, branch `<agent>/63-<topic>` (or the step's own issue when one exists), base `main` unless a step says otherwise.
- Under 400 changed lines, lockfiles excluded; aim under 200. A step that grows past that splits before review.
- Follow the repo's format in force at the time: `#63 ...` subjects until A6 lands.
- Codex reviews and merges; Claude reviews docs and plans. Grok never reviews. The author never merges.
- Every PR states each check as `pass`, `fail`, `blocked` or `not_run`. While CI is off, CI is `blocked`.

## Part A: adopt the template

Order matters: rules first, then checks that only run locally, then anything that touches CI.

### A1. One rules file: `AGENTS.md` and `RULES.md`

- **Goal:** every agent reads the same rules. `CLAUDE.md` becomes the one-line `@AGENTS.md` import.
- **Files:** `AGENTS.md` (new, at most 70 lines), `RULES.md` (new: template R1 to R15, then this repo's rules from R20 up), `CLAUDE.md`, `GEMINI.md` (new, `@AGENTS.md`), `CONTRIBUTING.md` (point at `AGENTS.md`, drop duplicates).
- **Not touched:** `rules.md`, `agent.md` and `orchestratorDelegate.md`. They are runtime inputs that the code loads and tests, so they stay where they are and `AGENTS.md` links them. (The migration note's step 1 says to merge `rules.md` and `agent.md` into `AGENTS.md`; that would break briefs. See Risks.)
- **Keep as repo rules (R20+):** Grok never reviews and `agy` never writes, enforced in code; thin orchestrator; adapters isolated; writes only in a soldier's worktree under its claims; `autonomy` only picks vendor flags; checkout guard and throwaway snapshots; the Monarch's calls stay read-only; no `full`-mode launches from a Claude Code session; shared working tree with Codex; `.shadow/` never committed; the current `#<issue>` commit format.
- **Acceptance:** each rule now in `CLAUDE.md` appears exactly once in `AGENTS.md` or `RULES.md`, with what enforces it. `CLAUDE.md` is only `@AGENTS.md` plus the template comment. No rule changes meaning.
- **Verify locally:** `npm test` and `npx tsc --noEmit` still pass. Diff old `CLAUDE.md` against the new files by hand, rule by rule, and list the mapping in a PR comment. Then, per the migration note, run one real agent task on the new rules before A2.

### A2. PR size gate

- **Goal:** the size habit becomes a check: `npm run check:size` counts changed lines against `origin/main`.
- **Files:** `scripts/check/pr-size.mjs`, `scripts/test/pr-size.test.mjs`, `scripts/test/run.mjs`, `package.json` (`check:size`, and `test` runs `vitest run` then `node scripts/test/run.mjs`), `vitest.config.ts` (exclude `scripts/test/`, which uses `node:test`).
- **Numbers:** fail above 400, warn above 200, set in the script's REPO-SPECIFIC block. The template ships 600 and 400 (its ADR-0003 is still "proposed"); tightening is allowed there and matches how this repo already works.
- **Acceptance:** a branch with 401 counted lines fails; 201 warns; `package-lock.json` is not counted; `PR_SIZE_LIMIT` can lower the limit but never raise it.
- **Verify locally:** `npm test`, then `npm run check:size` on this branch and on a scratch branch with a large dummy file.

### A3. Secret scan on pre-commit

- **Goal:** no key, token or `.env` file reaches a commit, which matters more here because soldiers can run unattended and the repo is public.
- **Files:** `scripts/check/secrets.mjs`, `scripts/test/secrets.test.mjs`, `scripts/lib/git-env.mjs`, `scripts/test/git-env.test.mjs`, `.githooks/pre-commit`.
- **Acceptance:** a staged fake token is refused with the file and line; a clean commit passes in under a second; nothing is printed of the secret itself.
- **Verify locally:** the tests, then stage a dummy `ghp_` string in a scratch file and try to commit.

### A4. Hook runner and pre-push

- **Goal:** one runner for every hook; pre-push runs types, tests and the size gate.
- **Files:** `scripts/hooks/run-checks.mjs` and its test, `.githooks/pre-push`, `.githooks/pre-commit` (through the runner), `scripts/setup-hooks.mjs` (template version, still run by `npm install`). REPO-SPECIFIC checks: `npx tsc --noEmit` and `npm test` on pre-push.
- **Acceptance:** `npm install` sets `core.hooksPath`; every check runs even after one fails; the existing `commit-msg` hook keeps working unchanged.
- **Verify locally:** fresh clone, `npm install`, `git config core.hooksPath`, then a push to a scratch remote with one failing test. Time it: if pre-push takes over a minute on Windows, move the full suite to an opt-in flag and say so.

### A5. Agent configs

- **Goal:** Claude Code and Codex start with the same allow and deny lists in this repo.
- **Files:** `.claude/settings.json`, `.codex/config.toml`, `docs/agents.md`, with `npm run build`, `npx tsc --noEmit`, `npm test` and `node dist/cli.js` allowed.
- **Depends on:** a decision on #71 and #75, which both add Claude plugin wiring. Rebase nothing; land A5 after whichever merges first and reconcile by hand.
- **Acceptance:** the template's `agent-config` test passes; force-push and `--no-verify` are denied; no setting removes a vendor safeguard (ADR-0010).
- **Verify locally:** start a Claude Code session and a Codex session in a fresh clone and run `npm test` from each without a prompt.

### A6. Commit format switch (only if the owner accepts the template's ADR-0004)

- **Goal:** Conventional Commits with `Refs: #N` and `Agent: <name>` footers, checked by the template's `commit-format.mjs` and `commit-msg.mjs`.
- **Files:** `.githooks/commit-msg`, `scripts/check/commit-format.mjs`, `scripts/check/commit-msg.mjs`, their tests, `scripts/pr-format.mjs` (replaced), `.github/pull_request_template.md`, `RULES.md` R7, and the cut-over commit recorded in `AGENTS.md`.
- **Acceptance:** the hook accepts `docs(plan): ...` and rejects `feat: x` without a scope; a `#63 ...` subject gets a message pointing at the footer; merge subjects still pass.
- **Verify locally:** the format tests, plus one real commit each way.
- **Hold until:** the open drafts (#75, #76, #77, #79, #81) are merged or parked, since every one of them uses `#N` subjects and would fail the new PR check.

### A7. Workflows: `pr-checks.yml` and pinned actions

- **Goal:** CI runs the size, secret and format checks from the base commit, and every action is pinned to a SHA.
- **Files:** `.github/workflows/pr-checks.yml` (replaces `pr-format.yml`), `.github/workflows/ci.yml` (pins only), `scripts/check/gate.mjs` and its test.
- **Depends on:** #79 and #81 merged first (both edit workflows), the owner's yes (a CI change, RULES R3), and 2026-11-01, when minutes reset.
- **Acceptance:** a test PR with 401 lines fails `pr-checks`; no workflow uses a tag like `@v4`; CI minutes per draft PR do not go up compared with #79.
- **Verify locally:** `node scripts/check/gate.mjs` against a scratch base; on GitHub after 2026-11-01 only.

## Part B: the alpha slice

### What "alpha done" means

The alpha is done when all of these hold on the owner's machine, on a tag `v2.0.0-alpha.1` that Codex merged:

1. From a fresh clone, `npm ci`, `npm run build`, `npx tsc --noEmit` and `npm test` pass on Windows, and on Linux or macOS.
2. In the owner's Claude Code session (the Monarch), one command, `sa task <soldier> "<task>"`, takes a real task for **one** soldier: `claude-sonnet` (Iron). Codex follows right after the alpha.
3. It creates the soldier's worktree and branch and takes the claims with the existing `src/workspace/` code.
4. It opens one live claude process in that worktree (`claude -p --input-format stream-json --output-format stream-json`), with the vendor harness as installed, the standing instructions appended (`--append-system-prompt`), and the soldier's `autonomy` from `shadow.config.json` (never `full` from a Claude Code session).
5. It sends the brief, waits for the `result` event, and keeps the turn's usage and cost.
6. It runs the claim audit and the checkout guard, writes the report to `.shadow/runs/<id>/`, and prints at most five summary lines, the changed files, tokens in and out, cost, the branch, and the commands to review, apply or undo.
7. A missing CLI, a missing login, a rate limit, a refusal and a timeout each end with their own message and a non-zero exit, and no claude process is left running.
8. Evidence (RULES R10, the "end-to-end flow" level): a contract test on a recorded claude session and a fake-CLI integration test run in `npm test`; the owner's live run on the demo task is pasted in a comment on the last PR.

**Not in the alpha:** the post office as a listening server, the secret and the lease (rest of M1), the mod and panes, messaging between soldiers, the meter and the 200k handoff, the codex, grok and agy channels, parallel soldiers, and removing v1 code. For the alpha, the session lives as long as one `sa task` command and listens on no port, so ADR-0012's port rules are not yet in play.

### B1. claude stream-json parser with a recorded session

- **Goal:** turn a recorded claude stream into turn-end, usage, cost and error events.
- **Files:** `src/v2/channel.ts` (the channel interface), `src/v2/claudeParse.ts`, `src/v2/claudeParse.test.ts`, one recorded fixture under `test/fixtures/`.
- **Source:** carve the parsing half of #75's `src/v2/claude.ts` and `channel.ts`, if the owner agrees (see Q1), instead of writing it again.
- **Acceptance:** two turns parse from one stream; a rate limit, a context overflow and a refusal come out as three kinds; an unparseable line is an error, not a crash (M1-AC3, in part).
- **Verify locally:** `npx vitest run src/v2/claudeParse.test.ts`.

### B2. The claude channel process

- **Goal:** start one claude process, send a message, await the turn end, close it cleanly.
- **Files:** `src/v2/claude.ts`, `src/v2/claude.test.ts`, `test/fakes/claude.mjs` (from #75).
- **Acceptance:** against the fake CLI: a brief goes in and a reply comes back; two turns share one process; closing ends the process and any child it left; the vendor's system prompt is appended to, never replaced (M1-AC4 and CH-7, in part).
- **Verify locally:** the tests, then check the process list after the suite for stray `node` children.

### B3. Standing instructions

- **Goal:** build the appended instructions from the roster, `rules.md` and the soldier's `agent.md` section.
- **Files:** `src/v2/instructions.ts` and its test (from #75), reusing `src/core/rules.ts` and `src/core/roster.ts`.
- **Acceptance:** every SI-1 part is present, and the text stays under 1,500 tokens (M1-AC5).
- **Verify locally:** the test, and print the instructions for `claude-sonnet` once to read them.

### B4. The task runner

- **Goal:** worktree, claims, channel, brief, result, audit, guard and report, as one function.
- **Files:** `src/v2/task.ts`, `src/v2/task.test.ts`, using `src/workspace/` (worktree, claims, audit, guard) and `src/core/brief.ts` as they are.
- **Acceptance:** with the fake CLI in a temp repo: the worktree and branch exist, an edit inside the claims is kept, an edit outside is reported and rejected, a change outside `shadow/*` fails the task, and the report lands in `.shadow/runs/<id>/`.
- **Verify locally:** the test on Windows and on one POSIX system.

### B5. `sa task` on the command line

- **Goal:** the Monarch's entry point and the printed report.
- **Files:** `src/v2/cli.ts` (just `task`), `src/cli.ts` (register it), a plain-text renderer and their tests.
- **Acceptance:** `sa task --help` documents it; each failure in alpha item 7 has its own message and exit code; the output fits in five summary lines plus the file list.
- **Verify locally:** `npm run build`, then `node dist/cli.js task claude-sonnet "..."` with `PATH` pointed at the fake CLI.

### B6. Demo task, runbook and the live run

- **Goal:** a repeatable real task and the alpha evidence.
- **Files:** `scripts/alpha-demo.mjs` (creates a throwaway repo with one failing test), `docs/alpha.md` (the runbook), `README.md` (a short "v2 alpha" section).
- **Acceptance:** the owner runs `sa task claude-sonnet "make the failing test pass"` in the demo repo from a Claude Code session; the test passes on the soldier's branch; the report matches alpha items 6 and 7. Codex merges, and the owner tags `v2.0.0-alpha.1`.
- **Verify locally:** follow `docs/alpha.md` from a fresh clone.

## Risks and open questions

- **Q1. #75 versus fresh slices.** B1 to B4 overlap #75. Carving its parts into small PRs keeps the work; rewriting wastes it. Which does the owner want, and does #75 then close as superseded or stay as the reference?
- **Q2. Is a one-command session acceptable for the alpha?** The spec's post office holds sessions across messages. The alpha holds one for one task. The owner should confirm this is a step towards M1, not a fork from it.
- **Q3. Or is v1 enough?** `sa summon claude-sonnet --write --claim ...` on `main` already does worktree, one-shot run, audit and apply. If the alpha only needs "one task end to end", a live check of v1 plus a tag is the cheapest path. It would not move v2 forward.
- **Q4. The commit format (A6)** changes every agent's habit and the PR check. It needs the owner's yes on the template's ADR-0004, and a moment when few drafts are open.
- **Risk: stale migration note.** BEST-OF-AI-DEV's `docs/migrations/shadow-army.md` says to merge `rules.md` and `agent.md` into `AGENTS.md`. They are runtime brief inputs, so A1 keeps them. The note should be corrected there.
- **Risk: CI is off until 2026-11-01** and macOS runs bill 10x. A7 waits for #79, and Part B's PRs report CI as `blocked` until then.
- **Risk: coverage.** If #76's 85% coverage rule lands first, every B PR must meet it.
- **Risk: live runs.** A Claude Code session refuses `full` mode launches, so the live run uses `supervised` or `auto`. Live runs cost real tokens; B6 runs one task, once.
