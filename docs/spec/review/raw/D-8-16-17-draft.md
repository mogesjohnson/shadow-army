D-8 (B), D-16 (A) and D-17 (B) drafter, against v0.10 (v2@e7c33b4.md), 2026-10-20

Answers D-8, D-16 and D-17 for v0.11, drafted against C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@e7c33b4.md. I checked by grep that each OLD text occurs exactly once in the snapshot, and no two blocks overlap.

```
D-8, D-16 and D-17 (owner's answers of 2026-10-17), with R-F-33's and R-F-20's budget clause, R-M1-57 and R-M1-67, against v0.10 (e7c33b4).

D-8 (B): section 5.1 L's budget: what a release is, the $2 limit on reported cost, a token cap for each CLI over its runs that report no cost, what is counted for each CLI, and the owner's go.
<<< OLD
  The budget is at most $2 of reported cost per release.
=== NEW
  **The budget.** A release is a version tag, such as `v2.0.0`. Every live check run toward it since the tag before it counts: every milestone's, on every system, repeats included. Shadow Army never estimates a cost (section 1), so the budget has two limits, and each run counts against exactly one of them:
  - **$2 of reported cost**, over the runs whose CLI reports a cost for them: claude's live turns, with the cost CH-2 gives each turn, and a headless run's `total_cost_usd` where its JSON has one, as claude's and grok's do. A headless follow-up's cost is its resumed total less the first run's. claude's cost is its own estimate (CH-2), and it is counted as reported.
  - **1,000,000 tokens for each CLI**, over that CLI's runs that report no cost: every codex and agy run (CH-3, CH-5), and any other run whose cost reads "not reported", such as a claude turn after a crash (CH-2). Their tokens are those of the measure above: input, whether uncached, written to the cache or read from it, plus output, with each turn's share of a running total taken as the measure says.
    - codex: from `thread/tokenUsage/updated`, its input tokens, with its cached input counted once, plus its output tokens, with its reasoning counted once; a headless run's come from `turn.completed`'s `usage` the same way. The contract fixtures (VER-4) show which field holds which.
    - agy: `input_tokens`, which leaves out cached input, plus `cache_read_tokens`, plus `output_tokens`, from its usage (CH-5) and from a headless run's JSON `usage`.
    - A run that reports no tokens counts as reaching its CLI's limit, as when codex sends no usage for an interrupted turn (spike S6).
  - **Why 1,000,000.** On 2026-10-07, one live and one headless run of the task used about 152k tokens on codex and 91k on agy (ADR-0009). A check that fails runs three times both ways, about 455k tokens on codex. The rest leaves room for VER-10's runs and for the two files growing. The figure comes from those token counts, never from a price.
  - **Going past.** Before a check runs, the figures from its last run (VER-8) are added to the release's spend so far. For the parity task's first run, ADR-0009's figures stand in. Three kinds of check wait for the owner's go, given with the spend so far in front of them: a check whose sum passes either limit, a check with no earlier figures, and any check once a limit has been reached. A check that has started is never cut short: one that passes a limit while it runs finishes and is recorded, and the next one waits. Each check's write-up gives each run's cost or tokens as counted here, the release's spend against each limit, and any go the owner gave (VER-8).
>>> END

D-8: VER-8 records what the budget counts.
<<< OLD
Each live check is written up on its milestone's PR: CLI version, tokens, pass or fail.
=== NEW
Each live check is written up on its milestone's PR: CLI version, tokens, the cost where the CLI reports one, the release's spend against section 5.1's budget with any go the owner gave past it, and pass or fail.
>>> END

D-8: VER-9's runs count toward the budget.
<<< OLD
It passes as section 5.1's live checks say.
=== NEW
It passes as section 5.1's live checks say, and its runs count toward their budget.
>>> END

D-16 (A), R-M1-57: CH-2 says exactly what supervised's `plan` lets claude run, from claude's documentation, and what the owner's own `useAutoModeDuringPlan: false` does in M1 and from M2.
<<< OLD
`--permission-mode auto` for auto; and `--permission-mode bypassPermissions` for full.
=== NEW
`--permission-mode auto` for auto; and `--permission-mode bypassPermissions` for full.
    - **What supervised lets claude run** in a turn that doesn't write. This is `plan` in a `-p` session, as claude's permission-mode documentation describes it. claude reads, and runs the shell commands of its built-in read-only set, without asking. It edits no file, because plan mode keeps its blocks wherever claude runs without an interactive terminal. Every other shell command goes one of two ways:
      - Where auto mode is available to the session and `useAutoModeDuringPlan` is on, claude's classifier reviews the command instead of the owner. Auto mode is available on the Anthropic API for the roster's Opus and Sonnet models, 4.6 or later, and `useAutoModeDuringPlan` is on by default. A command the classifier approves runs without the owner, in the soldier's snapshot (WSP-11) or worktree (WSP-1, →M6), where its writes are reported as WSP-11 says. A command it rejects is blocked. A write to a protected path, such as `.git/` or `.claude/`, goes to the classifier too. A removal of a critical path is handled as in auto mode, which denies it in a `-p` session.
      - Where auto mode isn't available, or `useAutoModeDuringPlan` is off, the command asks, through the relay from M2 (CH-6, →M2). In M1, which has no relay, claude denies it by itself, as it does every request that would need an answer (spike S5), and nothing waits.
    - Only the owner turns the classifier off, by setting `useAutoModeDuringPlan` to false in their user settings (`~/.claude/settings.json`) or in managed settings. A repository's `.claude/settings.json` can't turn it off, and a false in any file that may set it wins. No adapter passes or writes this setting (CH-7). So unless the owner has turned the classifier off, a supervised claude soldier's read-only turn runs the commands claude's classifier approves, without the owner.
>>> END

D-16: M1-AC8 checks live what M1 does with such a command (D-15's choice).
<<< OLD
and the run is written up on the PR (HOST-2, PO-7).
=== NEW
and the run is written up on the PR (HOST-2, PO-7). With the owner's `useAutoModeDuringPlan` set to false, a supervised claude soldier is told to run a command outside claude's built-in read-only set, such as `node -e "console.log(1)"`. Its log shows claude's own denial of the command, nothing waits, and the turn ends (CH-2).
>>> END

D-17 (B): section 2's Folder entry says each working tree has its own army.
<<< OLD
- **Folder:** the top level of the git working tree the owner's Claude Code session runs in. One post office serves a folder (PO-1).
=== NEW
- **Folder:** the top level of the git working tree the owner's Claude Code session runs in. One post office serves a folder (PO-1). Each working tree of a repository is a folder of its own, a linked one included, and has its own army.
>>> END

D-17 (B), R-M1-67: PO-1's folder: a linked worktree is a folder of its own, and the armies leave each other alone.
<<< OLD
The folder is the top level of the git working tree the owner's Claude Code session runs in. Outside a git working tree the army doesn't start
=== NEW
The folder is the top level of the git working tree the owner's Claude Code session runs in. A linked worktree of the repository, such as one that `git worktree add` or `claude --worktree` makes, is a folder of its own, so a repository can have an army in each of its working trees. Each army leaves the other armies' snapshots, worktrees and files alone (WSP-10, WSP-11; WSP-1, →M6). Outside a git working tree the army doesn't start
>>> END

D-17 (B): WSP-10 leaves another army's snapshots and worktrees out of its comparison, and says how one army recognises another's.
<<< OLD
A worktree's metadata is its `gitdir`, `commondir` and `config.worktree`.
=== NEW
A worktree's metadata is its `gitdir`, `commondir` and `config.worktree`. Another army's snapshots and worktrees (PO-1) are left out, whether that army is running or gone. Their metadata is neither compared nor trusted, so making or removing one is no change, during Shadow Army's own command or at any other time. A snapshot or worktree is this army's own when it lies in this army's subfolder of `~/.shadow-army/snapshots/` (WSP-11), or when this army's logs name it (PO-5). Any other snapshot or worktree is another army's in two cases: its `gitdir` lies in a subfolder there that carries another army's mark, or its HEAD names a branch under another army's mark (WSP-1, →M6). Only worktree metadata is left out: the config git reads, and the shared `hooks/` and `info/`, are compared whoever changed them.
>>> END

D-17 (B): ARM-6's hashed paths leave out another army's worktree metadata.
<<< OLD
and each worktree's metadata, as WSP-10 defines it;
=== NEW
and each worktree's metadata, as WSP-10 defines it, less another army's (WSP-10);
>>> END

D-17 (B): WSP-11 defines the army's mark, which its snapshot subfolder carries, and keeps the folder's path there.
<<< OLD
in a subfolder for each folder, named for the folder's name and a hash of its path, and there in a folder of its own for each session.
=== NEW
in a subfolder for each folder, named for the folder's name and its army's mark, and there in a folder of its own for each session. The army's mark is the first 12 hexadecimal digits of the SHA-256 of the folder's path, in UTF-8, as `git rev-parse --show-toplevel` prints it, with its letters lower-cased on Windows. So each folder's army has its own mark, and keeps it across restarts. A file in the subfolder holds the folder's path.
>>> END

D-17 (B): WSP-11 says what becomes of another army's snapshot, with that army running, gone, or its folder gone.
<<< OLD
It never runs in the folder itself.
=== NEW
It never runs in the folder itself.
  - **Another army's snapshots.** While another army's folder is still a working tree of the repository, this army never reports, changes or removes that army's snapshots (WSP-10), whether that army is running or not: its own next post office does (PO-1). When a post office starts, it checks each other subfolder that holds snapshots of this repository. If that subfolder's folder is gone, no longer on disk or no longer listed by `git worktree list`, the post office handles each snapshot in it:
    - It writes the snapshot's changed files and its HEAD's commit in its log, and in one line in Claude's transcript. The line names the gone folder, and says that the HEAD can't be checked, since that army's log went with its folder.
    - Then it removes the snapshot, and the subfolder once it is empty. A removal that finds the snapshot already gone is no error.

    A subfolder whose path file can't be read is left as it is, and the log says so.
>>> END

D-17 (B), technical part: WSP-11's guard leaves out another army's snapshots, worktrees and `.shadow/v2/` files.
<<< OLD
so another soldier's snapshot made or removed during the turn is no change. Shadow Army's own snapshots and worktrees, and its files under `.shadow/v2/`, are not the checkout: a change in the soldier's own snapshot is a write there.
=== NEW
so another soldier's snapshot made or removed during the turn is no change, and neither is another army's snapshot or worktree, which WSP-10 leaves out. Shadow Army's own snapshots and worktrees, and its files under `.shadow/v2/`, are not the checkout, and nor are the files under `.shadow/v2/` of another army's folder inside this one, such as its lock and logs (PO-1, PO-5): a change in the soldier's own snapshot is a write there.
>>> END

D-17 (B): M1-AC11 tests two armies on one repository, and a snapshot left by an army whose folder is gone.
<<< OLD
  - a snapshot that can't be made keeps the soldier from starting, and its log and Claude's transcript say why.
=== NEW
  - a snapshot that can't be made keeps the soldier from starting, and its log and Claude's transcript say why;
  - a second post office runs on the same repository, in a linked worktree outside the folder, with a fake soldier at auto of its own. Each one's snapshots open, restart and close during the other's turns. Neither holds the other's harness git or fails the other's turns, and their snapshots lie in subfolders with different marks;
  - that second post office is killed with a snapshot open. The snapshot stays as it is while the linked worktree exists. Once the linked worktree has been removed, the next post office in the folder removes the snapshot, after one transcript line that names the removed worktree and gives the snapshot's changed file and its HEAD's commit.
>>> END

D-17 (B): WSP-1's branch names carry the army's mark, and no army touches another's worktrees.
<<< OLD
- **WSP-1** (M6; I) One worktree per soldier per Claude session (from 2.0 WS-1).
=== NEW
- **WSP-1** (M6; I) One worktree per soldier per Claude session (from 2.0 WS-1). Its branch's name starts `shadow/<mark>/`, with its army's mark (WSP-11), so two armies on one repository never take the same branch name. An army never changes or removes another army's worktree or branch, whether that army is running or gone. At start, the log, and one line in Claude's transcript, name each such worktree whose army's folder is gone. It stays, with its branch, for the owner.
>>> END

D-17 (B): a new M6 AC for two armies' worktrees and branches.
<<< OLD
- **M6-AC8** Live: the owner's runs on Linux and macOS pass, and are written up on the PR with each system's version and terminal (VER-10, VER-8).
=== NEW
- **M6-AC8** Live: the owner's runs on Linux and macOS pass, and are written up on the PR with each system's version and terminal (VER-10, VER-8).
- **NEW-D17-AC1** Two armies on one repository, one in its main working tree and one in a linked worktree outside it, each give a soldier its worktree. The two branches carry different marks. Each army's guard and harness git leave the other's worktree out. Neither army changes or removes the other's worktree or branch, and this still holds once the linked worktree's army has exited and once that worktree has been removed (WSP-1, WSP-4, WSP-10).
>>> END
```

**What I could not place, and choices for you to confirm**

- **R-M1-67's technical part was already done.** v0.10 already has it (PO-1 line 194, M1-AC1 line 688), and §2's Folder entry already exists (line 62). I only extended them for B.
- **"Per release" was undefined.** I defined a release as a version tag, so every check from M1 to M6 shares one $2 and one token cap per CLI. Reading it per milestone would give six budgets. Please confirm.
- **The token cap.** I proposed 1,000,000 tokens per CLI, applied to every run that reports no cost (codex, agy, and claude turns that read "not reported"). The reasoning:
  - ADR-0009's 2026-10-07 table, live plus headless: codex 151.7k, agy 91.0k.
  - A failed check runs three times both ways: codex about 455k, agy about 273k.
  - The rest leaves room for VER-10's runs and for README.md and package.json growing.
  - It is derived from tokens, never from prices.
  - A cap shared by both CLIs is the other reading.
- **The 2026-10-07 measurement is not in docs/spec/review/evidence/.** The only per-CLI numbers are in docs/adr/0009-live-sessions-through-each-cli.md lines 10-15, which I used.
- **"Would go past" needs a prediction.** I made it testable from recorded figures only: the check's last run, or ADR-0009's figures for the parity task's first run. A check with no recorded figures waits for the owner's go. That fits settled.md line 42 (live runs need the owner's go).
- **D-16 says "since claude 2.1.285".** I couldn't find that version in the permission-modes page, so I left the version out of CH-2. CH-2's minimum is 2.1.277, so if the plan-mode classifier came later, versions 2.1.277 to 2.1.284 ask for every such command.
- **D-17 asked how one army recognises another's.** I used a mark per folder (a SHA-256 prefix of the folder's path) rather than the other army's lock. It needs no reading of other folders' locks, and it survives the other army's absence.
- **Possible overlap with D-19.** If D-19 lands in CH-2's permission-mode bullet (line 297), it meets my D-16 block, whose OLD is the end of that line. I didn't touch the §2 Autonomy entry, which decisions.md line 240 gives to D-7, or M1-AC5.

**Findings against v0.10**

```
- severity: P1
  type: decision-needed
  location: ARM-6 (v2@e7c33b4.md:470), WSP-11 (:515), D-17 B
  claim: ARM-6's guard hashes all of `.claude/` even where git ignores it, and `claude --worktree` puts its linked worktree inside the folder, at `.claude/worktrees/<name>/`, so under D-17 B the other working tree's whole checkout is inside this army's guard.
  scenario: The owner runs a Claude session in `.claude/worktrees/feat/` (its own army, per B) and edits files there while the main army's soldier is mid-turn. In M1 every such edit fails the main army's turn (WSP-11: "any other change it finds fails the turn"); from M2 each goes on an attribution card. So B fails in exactly the setup it was chosen for. My blocks leave out only the other army's `.shadow/v2/` files, and my M1-AC11 case puts the linked worktree outside the folder so it stays valid.
  evidence: ARM-6 :470 "`.githooks/`, `.claude/`, `.mcp.json`"; code.claude.com/docs/en/permission-modes, protected paths: "Claude's own git worktrees under `.claude/worktrees/`"; decisions.md D-17 card: "you already run sessions side by side in worktrees of one repository".
  fix: "decision: (a) another working tree of the same repository nested in the folder (from `git worktree list`) is not this army's checkout, and ARM-6's hashes skip it; (b) keep hashing it, and say in D-4 that a nested linked worktree's edits fail or card the outer army's turns; (c) Shadow Army refuses to start an army whose folder lies inside another working tree of the same repository."
- severity: P2
  type: vendor-fact
  location: CH-2 (:296-297), CH-6
  claim: In `plan` a soldier can call claude's ExitPlanMode tool. From M2, with `--permission-prompt-tool stdio`, approving it through the relay may switch the live session out of `plan` for its later turns, while CH-2 passes the mode only "on every start and resume".
  scenario: A supervised Iron in a read-only turn proposes a plan. The owner presses y on the relayed request, and Iron's later read-only turns run in default or acceptEdits mode until a restart. NEEDS-PROBE: what a stream-json `-p` session does when ExitPlanMode is approved through `can_use_tool`.
  evidence: code.claude.com/docs/en/permission-modes: "Approving a plan exits plan mode and switches the session to the permission mode each approve option describes".
  fix: "decision: the relay shows ExitPlanMode as a plan to read and answers it only with the CLI's own deny option for a read-only turn; or each turn checks the mode claude reports and restores the soldier's mode (a probe first)."
- severity: P2
  type: vendor-fact
  location: CH-3 (:312), §5.1 L measure (:634)
  claim: The codex token count rests on `thread/tokenUsage/updated` fields that no official document defines, so whether cached input sits inside input tokens, and reasoning inside output, is unverified.
  scenario: If `cachedInputTokens` is separate from `inputTokens` and an adapter adds only `inputTokens`, codex's parity totals and its budget count fall short by the cached share, roughly most of each request.
  evidence: learn.chatgpt.com/docs/app-server names the event only ("usage updates for the active thread"); spike S6 recorded no tokenUsage for an interrupted codex turn; NEEDS-PROBE (M2's contract fixture).
  fix: "my D-8 block reads the fields from the contract fixtures (VER-4); add to M2-AC1: the codex fixture's turn tokens equal the measure's sum, with no field counted twice."
- severity: P2
  type: vendor-fact
  location: CH-2 D-16 block, M1 (D-15)
  claim: The docs say a command needing approval in `-p` is denied when no permission-prompt tool is set, but that statement is about default mode; spike S5 tested only a default-mode write, so M1's behaviour in `plan` with the classifier off is unprobed.
  scenario: If claude in `plan` with `--permission-prompts host` and no prompt tool waits instead of denying, M1's turn hangs, which D-15 set out to prevent.
  evidence: code.claude.com/docs/en/permission-modes ("Calls needing approval are denied unless you approve them with an allow rule, hook, canUseTool callback, or --permission-prompt-tool"); m0-report.md S5. NEEDS-PROBE.
  fix: "the M1-AC8 sentence in my D-16 block checks it live."
- severity: P2
  type: ambiguity
  location: WSP-11 (:511)
  claim: The snapshot subfolder is "named for the folder's name and a hash of its path" with no hash, length or normalisation, so two starts in one folder (with differing path case on Windows) could name different subfolders, and no other army could recognise them.
  scenario: Reading A hashes `C:\Users\…` and reading B hashes `c:/users/…`: the same folder gets two marks, and its own old snapshots look like another army's.
  evidence: :511.
  fix: "my WSP-11 block: the first 12 hexadecimal digits of SHA-256 over the path as `git rev-parse --show-toplevel` prints it, lower-cased on Windows (NEEDS-PROBE: does rev-parse keep the casing of the path typed?)."
- severity: P3
  type: editorial
  location: VER-8 (:653, M2), M1-AC8 (:717)
  claim: M1 has live checks (M1-AC8, VER-9 in M1), but VER-8, which says how a live check is written up, is M2, so M1's write-up has no defined fields, now including the budget's spend.
  scenario: M1's claude parity check is recorded with no tokens or cost, and M2 starts the release's spend from nothing.
  evidence: :653 "VER-8 (M2; R)"; :685 M1's Implements lacks VER-8.
  fix: "make VER-8 (M1, M2; R) and add it to M1's Implements."
```

**Sources**

- https://code.claude.com/docs/en/permission-modes: plan mode's three cases (read-only set, the classifier when auto mode is available and `useAutoModeDuringPlan` is on, otherwise a prompt), auto mode's model and provider requirements, protected paths and critical-path removals in `plan`, and denials in `-p`.
- https://code.claude.com/docs/en/settings-reference: `useAutoModeDuringPlan`, default true, set in user, local or managed settings; "A repository can't turn it off for you"; "A false in any of these files still turns it off".
- https://learn.chatgpt.com/docs/app-server: names `thread/tokenUsage/updated` without its fields.
- Unofficial, not relied on: https://dev.to/terum/we-got-the-prompt-cache-working-our-pipeline-got-slower-265f and https://codex-sdk.hexdocs.pm/Codex.Events.ThreadTokenUsageUpdated.html.
- Local files in C:\Users\johns\projects\AIConnections-review:
  - docs\spec\review\decisions.md 242-369
  - docs\spec\review\ledger.md rows R-F-20, R-F-33, R-M1-3, R-M1-24, R-M1-57, R-M1-67
  - docs\adr\0009-live-sessions-through-each-cli.md 10-15
  - docs\spec\review\evidence\m0-report.md and s6-results.md
  - src\adapters\claude.ts 12-20
  - src\adapters\runParsers.ts 63-150 (grok's headless `total_cost_usd`; agy's input excludes cache)
  - src\workspace\guard.ts 14 and worktree.ts 38 (v1's `shadow/*` branches)
  - docs\legacy\spec\shadow-army-2.0.md (WS-1, GUARD-5)
  - docs\spec\review\batches\F-V4.md R-F-20
- C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\settled.md lines 41-42.

Coverage: §1 non-goals, §2 Folder, PO-1 (folder and lock), CH-2, CH-3, CH-5, CH-7, ARM-6, WSP-1, WSP-10, WSP-11, §5.1 C and L, VER-1, VER-8, VER-9, VER-10, M1-AC1, M1-AC5, M1-AC8, M1-AC10, M1-AC11, M2-AC1, M2-AC4, M6-AC1 to M6-AC8.
