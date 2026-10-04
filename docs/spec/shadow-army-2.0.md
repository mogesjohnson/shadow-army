# Shadow Army 2.0: Chat Harness Specification

| | |
|---|---|
| **Status** | Draft for review |
| **Version** | 0.9, 2026-10-04 |
| **Owner** | @mogesjohnson |
| **Tracking** | Design issue #38 |
| **Reference design** | Claude Code v2.1.88 source (March 2026, from the owner's collection zip), corrected by the current docs and the installed CLI (2.1.288). See §5. |
| **Decisions** | Interview decisions Q1–Q26 (§20), and the owner's review decisions D1–D18 of 2026-10-04 (§0.2) |
| **Review** | Seven rounds. Appendix A records every disposition, and Appendix B defines traceability. |

**Conventions.**
- MUST, SHOULD and MAY follow RFC 2119.
- **[Sn]** marks a fact that spike Sn confirms. Every requirement tagged [Sn] states a **Fallback**.
- Each requirement ID belongs to exactly one milestone and has exactly one evidence class (§18).
- A requirement that cites a later milestone's requirement marks the citation `(→Mx)`.
- **QU** means quota units (LEDGER-3). All four CLIs run on subscriptions, never API credits.
- A **context window** is how much a model can hold. A **quota window** is a plan's 5-hour or weekly limit.

---

## 0. For the owner

### 0.1 What changes for you

- **One chat.** You type `sa` in a repository and get a chat with Claude Opus, the Monarch. Your soldiers are listed on the left, asleep.
- **Waking soldiers.** The Monarch wakes soldiers when needed, and you can call one with `@name`. A woken soldier gets a short brief, never the whole chat.
- **What you can see.** Every soldier's context meter, and plan usage where the vendor reports it: Claude and codex now, grok and agy only if spike S4 finds a source. A live tree shows who is working and which subagents they started. You can open any soldier's chat and talk to it.
- **Approving writes.** Shadow Army applies a soldier's work to your folder only after you approve that wake (or while `/auto-approve writes` is on), and only if the wake ended cleanly. It lands as uncommitted edits, and `/undo <task>` takes it back.
- **One honest limit.** A soldier at `full` autonomy runs as you and can change files by itself. Shadow Army **detects** that and asks you about it, but cannot **prevent** it.
- **The Monarch never runs commands.** It reads, plans, reviews and makes tiny edits. Tests and builds go to soldiers (D12).
- **Tell the army once.** Facts are remembered once, in `.shadow/memory/`. Each soldier gets them once per session.
- **Quota is spent on purpose.** A sleeping soldier costs nothing. The Monarch runs at high effort and compacts at 200k. At 90% of its meter, a soldier either gets more room from the Monarch (up to 200k) or writes a short "what I did" summary and continues fresh. The Monarch checks in on long-running soldiers. Only a high safety ceiling stops a runaway, and the Monarch can raise it.

### 0.2 Owner decisions (decided 2026-10-04)

The owner answered every question on 2026-10-04 (`mogesanswers.md`). The tables keep the questions as asked. The **Owner's answers** list after them is binding wherever it differs from a recommendation.

**A. Changes to answers you gave**

| # | Change | If no | Affects | Rec |
|---|---|---|---|---|
| D1 | **Smart sessions.** A soldier's meter tops out at 100k tokens instead of its full window. The Q9 warnings (30/50/70%) and the summary at 90% happen within that ceiling. A soldier left idle for over an hour simply starts fresh, so Q13's "ask before a cold wake" question never comes up. | The meter uses the full window: claude ~967k, codex ~232k. Cold resumes re-read up to 880k tokens, and Q13's question appears. | SESS-1, CTX-1, CTX-3, CMP-3, LIM-3 | yes |
| D2 | **When the Monarch is unsure, a separate Opus session (`claude-opus-build`) takes the fix.** The Monarch edits only tiny fixes itself: one file, ≤40 lines. | The Monarch fixes inside its own long context, at about 2–3× the quota, and its history grows. | LEAD-3, CFG-9 | yes |
| D3 | **Memory goes through a `remember` tool** instead of Claude's built-in auto memory. It stamps provenance, blocks poisoning, and holds soldier-learned facts for your OK. | Built-in auto memory: no provenance; soldiers could forge entries. | MEM-1, MEM-3, MEM-5 | yes |
| D4 | **The Monarch runs at medium effort** (your default is `xhigh`) **and auto-compacts at 200k**. `/effort` changes it. | `xhigh`, and compaction near 967k: the largest quota cost. | LEADRT-1, LEAD-6 | yes |
| D5 | **The 80% quota card suggests "compact, then continue" first.** | Sonnet first, which frees no 5-hour quota (it shares the window). | LIM-2 | yes |
| D12 | **The Monarch has no shell or web tools.** Tests and commands go to soldiers. This narrows Q18's "can do everything". | A Monarch shell: Claude Code has no sandbox on native Windows (F41), so it would be unconfined. | CONF-1, LEAD-2 | yes |
| D13 | **A non-Claude Monarch is read-only.** | The codex Monarch would need its own confinement design before it could edit. | LEAD-7 | yes |
| D14 | **`/auto-approve writes` lasts only for this run of `sa`.** It needs consent first, and never covers lead tasks or execution-bearing files. | It persists across `--resume` and covers lead tasks. | SAFE-3 | yes |
| D17 | **`/switch codex-astra` and the quota card can hand the lead to codex.** Then you're talking to codex, not Claude. This relaxes "Claude is always the one you talk to". | Only Claude models can lead; when Claude is out of quota, the chat pauses. | LEAD-7, LIM-2, LEADRT-10 | yes |
| D18 | **The Monarch reviews diffs up to 6k tokens itself.** Bigger diffs go to a reviewer soldier, whose report it reads. This narrows Q18's "the lead is the reviewer". | The Monarch reads every diff in full, at a large quota cost. | LEAD-5 | yes |

**B. Defaults for things you didn't decide**

| # | Default | If no | Affects | Rec |
|---|---|---|---|---|
| D6 | **The mouse is on.** Clicks fold rows, and Shift+drag still selects text. | Keyboard only. | UX-5 | yes |
| D7a | **Direct turns (`@name` or a view) are read-only.** Use `@name --write --claim` to have a soldier write. | Every direct message could write, so each would need a card. | VIEW-3 | yes |
| D7b | **One turn at a time per soldier, with a queue.** For parallel work, add a second config entry (`claude-sonnet-2`). | Two turns in one session corrupt each other, so parallel work always needs a second entry. | WAKE-6 | yes |
| D7c | **Chat memory is separate from the v1 Vault**, with a one-time import. | v1 commands and chat share one store. | MEM-11 | yes |
| D7d | **A cold soldier at 90% is summarized from its reports**, with no model call. | It pays a full re-read just to write a summary. | CMP-3 | yes |
| D7e | **The guard asks about changes made while a soldier ran.** Diffs are shown, and the default is No. | Any change during a turn fails it, including your own edits. | GUARD-4 | yes |
| D7f | **Soldiers start from your working state**, uncommitted edits included, in their own workspace. | Soldiers start from HEAD and can't see your edits or their own applied work. | WS-1, WS-5, SESS-8 | yes |
| D8 | **Subagent branches are open while running and fold when done**, and a manual toggle wins. This answers Q20b. | Always folded, or always open. | TREE-4 | yes |
| D9 | **A repository's own policy files need a one-time trust card.** | A cloned repository can silently raise its soldiers' autonomy. | POL-1, POL-2, POL-3 | yes |
| D10 | **A `full` soldier needs a consent card** on its first wake in each chat. | It wakes without a prompt. | SAFE-3 | yes |
| D11 | **One chat per repository.** v1 write commands refuse while a chat is open. | Concurrent runs raise false guard cards. | GUARD-5 | yes |
| D15 | **Resuming a chat whose Monarch is cold and over 100k** starts it from a handoff. | It re-reads up to 200k at full price. | LEAD-9 | yes |
| D16 | **A wake stops after 30 calls, 400k QU or 15 minutes**, keeping its partial result. | Only time limits apply, so a looping soldier can burn a window. | WAKE-9 | yes |

**Owner's answers (binding)**

- **Recommended option taken:** D2, D3, D5, D6, D7b–D7f, D8, D9, D12, D13, D17, D18.
- **D1 (updated A):** smart sessions with a 100k base ceiling. At 90%, the Monarch may extend a soldier's ceiling up to 200k while the work continues (CTX-5).
- **D4 (B):** the Monarch runs at **high** effort, compacting at 200k.
- **D7a (B):** direct turns can write. Each direct message to a soldier that can write shows a write card first, unless auto-approve is on (VIEW-3).
- **D10 (A, modified):** a `full` soldier's first wake shows a **notice**, not a question (SAFE-3).
- **D11 (updated A):** every `sa` (or `shadow`) starts a new chat. `/resume` and `sa --resume` open a picker, and `sa --continue` jumps to the latest chat. Only one chat is open per folder at a time (CHAT-1, CMD-5, GUARD-5).
- **D14 (B):** `/auto-approve writes` stays on until turned off, across resumes, and covers every write, lead tasks and execution-bearing paths included. Hard-denied claims and non-write cards (attribution, policy trust, quota, cold wake, memory, resume) still apply (SAFE-3). One safety exception: an apply that adds or retargets a symlink or gitlink still needs the typed `yes` (WS-8), because a link can point outside the repository.
- **D15 (updated A):** resuming a cold Monarch over 100k asks each time, with "start from handoff" pre-selected and both costs shown (LEAD-9).
- **D16 (C, modified):** a check-in never stops a wake. The Monarch gets check-ins and can steer, stop or give more room. Only a high safety ceiling stops a runaway, and the Monarch can raise it (WAKE-9, WAKE-15, MCP-5).
  - *Why this is safe for heavy work left running:* a check-in never stops work by itself. A soldier's own writes go to its workspace and are applied only after a clean finish, so for most soldiers the worst case is spent quota. A `full` soldier (codex-sol, grok and agy in your config) runs as you and can still edit your folder directly during a long wake. The guard shows you any such change afterwards (GUARD-4), but cannot prevent it (§0.1).
- **O1 (A):** fix v1's junction bug now, in its own issue. Done as #36, with draft PR #37 (milestone M0a).
- **O2 (B):** post to GitHub directly.
- **O3 (A):** run critique round 4 after applying these answers.
- **O4 (A):** the zip was removed from the repo folder. The only copy is `~/Downloads/collection-claude-code-source-code-main.zip`; look there when stuck.
- **O5:** that zip is the reference for ideas and for how the pieces connect. Shadow Army is the same idea, more ambitious. The other Downloads files are ignored.

### 0.3 Work already in flight

Three draft PRs from other sessions, opened on 2026-10-02, are waiting for Codex review. 2.0 builds on them rather than redoing them:

- **#30 / PR #31, the v1.5 chat.** `sa` opens a Claude Code-style chat (`src/chat/`): a prompt box, history, a slash menu, and ask/auto/plan modes on Shift+Tab, where every message is a goal for v1's Monarch pipeline. M3 and M4 rework that chat into 2.0's layout. They keep its prompt, history, slash menu and modes (KEY-7), and replace "every message is a goal" with the conversational Monarch.
- **#32 / PR #35, runs from the folder as it is, plus `sa undo`.** It adds a private-index snapshot (`src/workspace/snapshot.ts`), an apply ledger (`.shadow/applied.jsonl`) and `sa undo` (`undo.ts`). M5 builds on these:
  - WS-5 extends the snapshot with the exclusions and the `refs/shadow-army` refs.
  - WS-8 keeps #32's clash rule.
  - WS-9 extends `sa undo` to per-hunk reversal.
  - GUARD-3 moves the ledger to the runtime directory, out of soldiers' reach.
- **#33 / PR #34, agy's error reason.** Independent. LEADRT-8's error mapping reuses it.

If any of these PRs changes before merge, the milestone that builds on it re-checks its assumptions.

---

## 1. Summary

Shadow Army 2.0 turns `sa` into a chat you stay in. You talk to one lead, the **Monarch** (Claude Opus by default). The other AI CLIs are **soldiers**: dormant until the Monarch or you wake them, briefed rather than shown the chat, and kept to one linked session per chat. A roster, a live tree and soldier views show who is doing what, how full each context is, and how much plan quota is used.

The design matches Claude Code's harness where that serves the goal (§5), and goes beyond it in three ways:
- one army across four vendors
- dormant soldiers with no process
- quota-aware orchestration

## 2. Goals, non-goals and threat model

**Goals**

- **G1** A persistent terminal chat with a Claude lead, drawn with Shadow Army's own Ink UI.
- **G2** Soldiers that stay dormant until invoked: no process, no quota.
- **G3** Visibility of every soldier's state, activity, subagents, context and quota.
- **G4** Quota spent deliberately, with budgets and meters (§13).
- **G5** v1's safety model kept and hardened (§15).

**Non-goals for 2.0**

- **N1** Copying the leaked source (ADR-0001).
- **N2** The Agent SDK or API credits (ADR-0002).
- **N3** A desktop or web UI.
- **N4** Soldiers waking other soldiers.
- **N5** Running as a Claude Code plugin.
- **N6** Sharing across machines.
- **N7** Containing a `full` soldier: only a container or VM does that.
- **N8** Vim mode, image paste, an in-app selection engine, a status-line command, and theme presets.

**Threat model.**

*Assets:*
- your checkout and its uncommitted work
- your secrets
- your vendor accounts and quota
- the army's control plane
- army memory

*Adversaries:*
- repository content that prompt-injects a soldier or the Monarch
- a sandboxed soldier (supervised or `auto`) trying to make the harness act outside its sandbox, as a confused deputy. On native Windows, claude has no OS sandbox (F41): a claude soldier's commands there are gated by Claude Code's permission checks, not confined.
- a `full` soldier running with your OS rights

*Prevented:*
- confused-deputy escapes through the harness: links (SAFE-8, SAFE-9), git metadata and config (GIT-1…GIT-3)
- the Monarch acting outside its confinement (CONF)
- soldiers reaching the control plane through Shadow Army's interfaces (ARCH)
- un-approved work being applied by Shadow Army (WAKE-8, WS-7)
- policy files changing silently (POL)

*Detected, not prevented:* anything a `full` soldier does directly as you. That includes editing files, reading other processes' environments or memory, and using the network. The guard (GUARD) and the sentinel set show it to you. `sa doctor` warns when a `full` soldier runs outside a container or VM.

*Also detected, not prevented:* a git config change that a running soldier without an OS sandbox makes between GIT-3's check and the git command that reads it. GIT-1's overrides and GIT-2's pinned settings still stop the hook, monitor, pager, signing and diff programs and your existing filters, and GIT-3's re-check reports the change afterwards.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Monarch** | The lead, from the soldier entry `monarch.default`. |
| **Soldier** | Any other entry in `shadow.config.json`. |
| **Autonomy** | A soldier's vendor permission level: `supervised`, `auto` or `full` (v1). |
| **Claims** | The path globs a write wake may change. Edits outside them are reverted by the claim audit (v1). |
| **Model** | The model the CLI reports (`system/init` or equivalent), else the configured one. |
| **Shadow name** | A soldier's display name, always shown as `<Shadow> · <id> · <model>`. |
| **Main chat** | One conversation with the Monarch, identified by a chat id. |
| **Soldier session** | A vendor session id linked to one soldier in one chat. |
| **Wake** | One turn of a soldier, for one task. |
| **Brief** | What a wake sends. **Priming** is the part sent only at session start and after rollover. |
| **Digest** | A ≤2 KB summary of a soldier's reports, built by the harness with no model call. |
| **Summary** | A ≤1,500-character "what I did" text written by the soldier itself. |
| **Handoff** | A ≤8k-token restart package for the Monarch, built by the harness from `events.jsonl` with no model call: your recent messages and the Monarch's text, open and applied tasks, notices, and the memory index. |
| **Report** | v1's `shadow-report` block, plus a `verdict` for reviews and tests. |
| **Army update** | One message to the Monarch carrying reports, direct-chat notes and notices. |
| **Warm / cold** | Whether the vendor cache still holds the session, judged by a learned TTL. |
| **Usable window** | Context a soldier can hold before its CLI compacts it. |
| **Ceiling** | The meter's 100%: the usable window, or under `smart` sessions the lower of the usable window and `resumeMaxTokens`. |
| **Rollover** | A fresh session seeded from a digest. **Shadow compaction** is a rollover at 90% of the ceiling, or on `compact`, seeded with a summary. |
| **Runtime directory** | Per-user state outside the repository (ARCH-1). |
| **Working-state base** | A commit of your checkout as it is, made without touching your index or files (WS-5). |
| **Workspace** | A soldier's own git worktree for one chat. The Monarch's is in the runtime directory (LEAD-4). |
| **Tracked path** | Any path in the base tree, the workspace's index, or the HEAD tree. |
| **Card** | A request for your decision (CARD-8). |
| **Sentinel set** | Files the guard hashes even when git ignores them (GUARD-2). |
| **Lean launch** | Per-CLI flags that keep your personal configuration out of soldier processes. |
| **QU** | Quota units (LEDGER-3). |

## 4. Facts this design relies on

| # | Fact | Source | Status |
|---|---|---|---|
| F1 | Installed CLIs: claude 2.1.288, codex 0.160.0, grok 1.0.46, agy 1.2.15 | `--version` | Confirmed |
| F2 | Logins: Claude Pro, a ChatGPT plan, grok.com, and a Google account for agy. No API credits. | Status commands; the owner | Confirmed |
| F3 | All four resume a session by id headless. codex `exec resume` has no `-s`/`-C` of its own; the parent `exec` options may apply. | Help | [S5, S6] |
| F4 | v1 turns persistence off, and drops the session ids it parses. | `src/adapters/*.ts`, `summon.ts` | Confirmed |
| F5 | The Agent SDK requires API-key authentication for third-party products. | Agent SDK overview | Confirmed |
| F6 | Claude's context % uses input tokens only (input, cache creation and cache read). | Status-line docs | Confirmed |
| F7 | Auto memory loads the first 200 lines or 25 KB of `MEMORY.md`. `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` turns it off. Worktrees share your everyday memory directory. | Memory docs | Confirmed |
| F8 | Instruction files: codex reads `AGENTS.md`; grok reads `AGENTS.md` and `Claude.md` in a trusted repository; agy reads `AGENTS.md`, `GEMINI.md` and `.agents/rules`; claude reads `CLAUDE.md`, and `AGENTS.md` without a `CLAUDE.md` or through an import. | Docs | [S7] |
| F9 | Vendor compaction points: codex at about 90% of `model_context_window` (258,400); grok at 85% of 256k; agy at about 140–150k; claude at its autocompact threshold (the window minus 33k). | Local files, `/context` | [S5] |
| F10 | All four have subagents. claude's tool is `Agent`; grok's is `task`. | Help, `~/.grok/README.md` | [S5] |
| F11 | Subagent controls: claude `--disallowedTools Agent`; codex `--disable multi_agent` and `agents.max_concurrent_threads_per_session`; grok `--no-subagents`; agy has none. | Help | [S5] |
| F12 | Transcript locations: claude `~/.claude/projects/<cwd-slug>/<id>.jsonl`; codex `~/.codex/sessions/…`; grok `~/.grok/sessions/<cwd>/<id>/`; agy `~/.gemini/antigravity-cli/brain/<id>/`. | Local files | Confirmed |
| F13 | claude resumes by id from any directory (2.1.223+). grok files sessions by directory. `--mcp-config`, `--settings` and `--add-dir` are not restored on resume. | Headless docs | grok [S5] |
| F14 | v1 caps briefs at 24,000 characters, because of agy's argument. agy's stream-json input forbids `-p`. | `brief.ts`, agy help | Confirmed |
| F15 | Each model has its own prompt cache. | Headless docs | Confirmed |
| F16 | v1 runs supervised read-only tasks in your folder, and others in `.shadow/worktrees/`. | `summon.ts` | Confirmed |
| F17 | `rules.md` rule 1 keeps soldiers in their working directory. | `rules.md` | Confirmed |
| F18 | These claude 2.1.288 flags exist: `--restricted`, `--tools`, `dontAsk`, `--permission-prompts`, `--strict-mcp-config`, `--setting-sources`, `--safe-mode`, `--disable-slash-commands`, `--exclude-dynamic-system-prompt-sections`, `--autocompact`, `--effort`, `--session-id`, `--include-partial-messages`, `--replay-user-messages`, `--append-system-prompt-file`, `--add-dir`. | `claude --help` | Confirmed |
| F19 | `--restricted` removes the tools that run commands or code, and WebFetch, unless named. It ignores user, project and local settings files, confines file tools to the working directories, and refuses `bypassPermissions`. `--setting-sources ""` parses. | Help, docs, critic E3 | Confirmed |
| F20 | Stream-json: user messages take a `uuid` and a `priority`. Control requests include `interrupt`, `set_model`, `get_context_usage`, `mcp_status` and `apply_flag_settings`. Output includes `system/init` (once per turn), `session_state_changed` (with an env flag), `rate_limit_event`, `api_retry`, `compact_boundary`, `task_*` and `result`. In `result`, `usage` covers the turn, while `total_cost_usd` and `modelUsage` are cumulative. | Source v2.1.88, docs | [S1] |
| F21 | Hooks fail open, except exit 2. | Hooks docs | Confirmed |
| F22 | `acceptEdits` auto-approves `rm`, `mv`, `cp` and `sed`. `dontAsk` still allows reads in the working directories. A Read deny rule also blocks Edit and Write on that path. | Permission docs | Confirmed |
| F23 | MCP configs expand `${VAR}` in headers; variables with credential-like names expand empty. | Source, docs | [S2] |
| F24 | Your logs: Claude cache writes use a 1 h TTL; codex stayed warm for up to 64 min; grok was cold once at 58 min. | Critic B | Measured |
| F25 | codex rollouts carry `rate_limits` (5-hour and weekly; weekly was 91% on 2026-10-02). Headless Claude emits `rate_limit_event`. grok and agy expose nothing locally. | Logs, source | [S4] |
| F26 | One Claude Pro 5-hour window is about 14M QU, from a single measurement. | Critic B | Estimate |
| F27 | Your global Claude settings set Opus effort to `xhigh`, and spawned processes inherit it. | `~/.claude/settings.json` | Confirmed |
| F28 | Usage semantics differ: claude input excludes cache; codex includes cached; agy excludes cache reads and is cumulative; grok excludes cached. | Logs | [S5] |
| F29 | `--bare` (no OAuth) "will become the default for `-p`". | Headless docs | Risk |
| F30 | git runs hooks, `core.fsmonitor` and `filter.*` commands from the configuration it reads. | git docs | Confirmed |
| F31 | A repository's `shadow.config.json` overrides the bundled one, and its schema strips unknown keys. | `config.ts` | Confirmed |
| F32 | Ink 7 has no mouse API. Windows Terminal keeps Shift+drag selection while an app captures the mouse. | Ink, terminal | [S8] |
| F33 | Claude Code now renders fullscreen, selects agent rows with plain arrows, and uses shift+arrows for text selection. | Docs | Confirmed |
| F34 | grok runs a shared leader daemon. codex's Windows sandbox runs as a service outside codex.exe's process tree. | Help, process list | [S12] |
| F35 | `push --all`/`--branches` push `refs/heads/*`; `--mirror` pushes every ref. | git docs | Confirmed |
| F36 | Git for Windows sets `core.autocrlf=true` in system config. This repository has 100 files stored LF and checked out CRLF. | git | Confirmed |
| F37 | `git reset --hard` writes through a junction that replaces a tracked directory, even with `--git-dir`/`--work-tree`, and it deletes outside paths listed only in the workspace index. `git clean -ffdx` and Node `fs.rm` do not follow junctions. | Critic E3, scratch tests t1, t2, t5, t8 | Confirmed |
| F38 | The guard ignores only `refs/heads/shadow/` refs. | `guard.ts:21` | Confirmed |
| F39 | v1 audits and reverts before it commits, applies only on status `ok`, all-or-nothing, and the lease heartbeat stops at `finish()`. | `session.ts`, `apply.ts`, `cli.ts:193` | Confirmed |
| F40 | codex's `[windows] sandbox` lives in the user config that `--ignore-user-config` drops. | `~/.codex/config.toml` | Confirmed |
| F41 | Claude Code's sandbox covers macOS, Linux and WSL2. Native Windows is unsandboxed. | Sandbox docs | Confirmed |
| F42 | **v1 today:** `git worktree remove --force` empties a junction's target (`worktree.ts:60,105`, `session.ts:172`, `integration.ts:64`), and the audit's revert `rm` follows links (`audit.ts:60`). | Critic E3 tests t5, t10 | Confirmed |
| F43 | `TodoWrite` is unavailable on Opus and Sonnet 5.x, unless `CLAUDE_CODE_ENABLE_TASKS=0`. | Tools reference | Confirmed |
| F44 | In `-p`, `ANTHROPIC_API_KEY` in the environment takes precedence over the subscription login. | Authentication docs | Confirmed |
| F45 | A tampered `.git/worktrees/<n>/commondir` redirects configuration. A `filter.*.clean` planted in config runs on `git add`. A planted `gpg.program` with `commit.gpgSign` runs on `git commit --no-verify`, and with `log.showSignature` on `git log`. | Critic E3 tests t7, t9; round-6 gate E | Confirmed |
| F46 | `git apply` removes the old copy of every modified file before writing any new one. If a write fails after `--check` passed, later files stay deleted and added files are missing. v1's apply then reports "Your folder is unchanged" (#53). | Round-6 gate E; reproduced with Git 2.52 on Windows | Confirmed |

## 5. Reference design: Claude Code parity

Per the owner's direction, the leaked v2.1.88 source is the reference design, corrected by the current docs. The code is original (ADR-0001), and clawspring (Apache-2.0) contributes ideas only.

| Area | Claude Code | 2.0 | Requirements |
|---|---|---|---|
| Rendering | Fullscreen, virtual scroll, sticky follow, pill, inline fallback | Match | UX |
| Selection | In-app mouse selection | Shift+drag and `/copy` now; the rest later | UX-5 |
| Prompt | Multiline, history, ctrl+r, paste collapse, editor, stash | Match; vim skipped | PROMPT |
| Queue | Priority queue; ↑ takes back | Match, using `priority` | CHAT-3, LEADRT-4 |
| Typeahead | `/` and `@`, fuzzy | Advance: soldiers show state and quota | PROMPT-7, PROMPT-9 |
| Tool rows and spinner | Grouped rows; timer and tokens | Advance: per soldier | CHAT-2, TREE-3 |
| Notices and dialogs | Priority queue; no stolen keystrokes | Advance: cards show who, why and scope | ATTN, CARD |
| Interrupts | Esc and ctrl+c ladders | Match; Esc never stops a soldier | KEY |
| Agent rows | Arrows, Enter, `x`, folding | Match, plus the roster | KEY-1, ROS, TREE, VIEW |
| Coordinator | Self-contained briefs, continue or fresh, a fresh verifier | Match as Monarch rules | ORCH |
| Mailbox | Polling inboxes | Skip: dormant means no process | ARCH |
| Task list | `blockedBy` | Advance: harness ledger | ORCH-7 |
| Stream-json, permissions, hooks | Consumer; `dontAsk`; hooks fail open | Match | LEADRT, CONF |
| Compaction | Autocompact | Advance: summary and rollover | CMP, LEAD-10 |
| Sessions, memory, usage, doctor | Resume anywhere; `MEMORY.md`; per-call usage; checks | Match, plus links, provenance, QU and per-vendor checks | SESS, MEM, LEDGER, DOC-1 |
| Teams | Claude only | Advance: four vendors | All |

## 6. User experience

### 6.1 Screen

At 140 columns or wider:

```
┌ ARMY ───────────────────────────────────┐ [m3] you › add a settings page and get it reviewed
│ ◆ Monarch  Kaisel · claude-opus · opus  │
│   ▓▓▓░░░░░░░ 31%  summoning             │ Monarch › Beru builds it; Bellion reviews.
│   claude 5h ~41%                        │ ↳ wake Beru · grok · grok-4.7 · build · write · t7
│ ! Beru     grok · grok-4.7              │
│   ▓▓░░░░░░░░ 18%  awaiting you          │
│ ○ Igris    codex-sol · gpt-6.1-sol      │
│   ▓░░░░░░░░░  9%  in the shadows        │
│ ○ Tusk ❄   agy · gemini-3.1-pro-high    │
│   ▓▓░░░░░░░░ 22%  in the shadows        │
│ · Bellion  codex-astra · gpt-6-astra    │
│ · Iron     claude-sonnet · sonnet       │
└─────────────────────────────────────────┘
 ◆ Monarch  Kaisel · claude-opus · opus   waiting on your approval          12.4k   0:42
 └─ ⚑ Beru  grok · grok-4.7               awaiting approval
 ┌ write · Beru · grok · grok-4.7 · full autonomy ─────────────────────────────────┐
 │ build the settings page                                  task t7 · from Monarch  │
 │ claims src/ui/Settings.tsx src/ui/nav.ts       base b3 = HEAD + your 2 edits     │
 │ y approve   n reject   e edit claims   v view brief   Esc later                  │
 └──────────────────────────────────────────────────────────────────────────────────┘
 › _                                         c-1003-ab12 · writes: ask · mouse on
```

### 6.2 Rendering (UX)

- **UX-1** `sa` MUST render fullscreen on the alternate screen, with a virtual-scrolled transcript. `sa --inline` renders inline with native scrollback.
- **UX-2** The transcript follows new output while you are at the bottom. Scrolling up stops following and shows a `↓ N new` pill. PgUp/PgDn, ctrl+Home/End and the wheel scroll. ctrl+End or a click on the pill follows again.
- **UX-3** A resize re-lays out synchronously and keeps your draft, cards and focus.
- **UX-4** Breakpoints. Every layout keeps the model visible, truncated if needed (UX-9):

  | Width | Roster | Tree rows |
  |---|---|---|
  | ≥140 | Left pane, 42 columns | Full |
  | 110–139 | Left pane, 32 columns | Full |
  | 80–109 | One-line strip | Tokens and time |
  | 60–79 | Strip: shadow name, truncated model and % | No tokens or time |
  | <60 | Hidden; `/army` lists it | The Monarch plus a count |

  The strip lists the Monarch, then every awake or waiting soldier as `<glyph><Shadow> <model> <%>`, then `+N` for the dormant ones; `/army` lists them all. The minimum height is 24 rows. Below 30 rows, the tree shows at most 3 rows.
- **UX-5** The mouse is on where the terminal reports it (D6). A click toggles a tree row, selects a roster row, or follows again from the pill, and the wheel scrolls. Shift+drag keeps the terminal's own selection [S8]. **Fallback:** the mouse is off by default. `/mouse off` turns capture off. `/copy [n]` copies a message to the clipboard: `Set-Clipboard` on Windows, `pbcopy` on macOS, `wl-copy` or `xclip` on Linux, otherwise OSC 52.
- **UX-6** On exit, the normal screen shows the chat id and `sa --resume <id>`.
- **UX-7** An ASCII profile applies in legacy consoles or with `SA_ASCII=1`. `SA_REDUCED_MOTION=1` freezes animation.
- **UX-8** All UI text, glyphs and word lists are original. Status words are checked against Claude Code's verb list before release.
- **UX-9** A soldier always appears with its shadow name and model (Q8): as `<Shadow> · <id> · <model>` in the roster pane, the tree and views, as `<Shadow> <model>` in the strip (UX-4), and as PLAIN-1 writes it in plain mode. The model may be truncated, but never dropped.

### 6.3 Keys (KEY)

- **KEY-1** Pressing `↓` on an empty prompt focuses the army panel. In it:
  - `↑`/`↓` move between rows, including tree rows (→M8).
  - `→` opens a folded `+N agents` row and `←` folds it (TREE-4).
  - `Enter` opens a soldier view (→M8).
  - `x` stops that soldier's turn, after a stop-confirm card for a write.
  - `Esc` returns focus to the prompt.
- **KEY-2** The full Esc ladder acts on the topmost layer:
  1. close typeahead
  2. set aside the focused card
  3. close a view
  4. leave the panel
  5. interrupt the Monarch
  6. take the last queued message back into the prompt
  7. a double Esc within 800 ms clears the draft and saves it to history

  Esc never stops a soldier.
- **KEY-3** The ctrl+c ladder:
  1. interrupt the Monarch
  2. clear the draft
  3. a second ctrl+c within 800 ms on an empty prompt quits

  ctrl+d pressed twice on an empty prompt also quits.
- **KEY-4** S8 MUST verify on Windows Terminal: ctrl+j, Alt+Enter, Shift+Enter, `↓` on an empty prompt, panel keys, PgUp/PgDn, ctrl+Home/End and Shift+drag. **Fallback:** an alternative key for each one that fails, listed in `/help`.
- **KEY-5** A keybindings file, `~/.shadow-army/keybindings.json`, supports contexts, chords, `null` to unbind, and hot reload.
- **KEY-6** Before M8's full ladder, Esc interrupts the Monarch, and a double Esc clears the draft.
- **KEY-7** Shift+Tab cycles the write mode, as #30's chat does (§0.3):
  - **ask** (the default): write wakes show write cards.
  - **auto**: the same as `/auto-approve writes on` (SAFE-3, →M6). Entering it posts a notice that writes now apply without cards.
  - **plan**: the Monarch plans and reads, and write wakes and lead tasks are refused.

  The footer shows the mode, and it persists across `--resume` (D14).

### 6.4 Prompt (PROMPT)

- **PROMPT-1** `Enter` sends. A newline is ctrl+j, Alt+Enter, Shift+Enter where the terminal tells it apart, or `\` followed by Enter.
- **PROMPT-2** History is kept per repository. `↑` on the first line walks it, and ctrl+r searches it.
- **PROMPT-3** A bracketed paste over 800 characters or 3 lines collapses to `[paste #n · L lines]`. The full text is still sent.
- **PROMPT-4** ctrl+g opens `$EDITOR` (on Windows, `%EDITOR%`, or Notepad) on the draft.
- **PROMPT-5** ctrl+s stashes the draft, and ctrl+s on an empty prompt restores it.
- **PROMPT-6** `↑` on an empty prompt takes back the last queued message.
- **PROMPT-7** `@` typeahead lists soldiers (as UX-9, with state, context % and quota %) and files. Matching is fuzzy, with ≤15 items.
- **PROMPT-8** Each message you send gets an id (`[m12]`). It is shown in the transcript and in plain mode, and is sent with the message, so `wake(attach)` can name it.
- **PROMPT-9** `/` typeahead lists commands.

### 6.5 Cards and attention (CARD, ATTN)

- **CARD-1** A card MUST NOT take focus while the draft is non-empty or within 700 ms of a keystroke. The footer shows `N waiting · send or clear your message to review`, and `/cards` lists them.
- **CARD-2** The keys on a focused card:
  - `y` approves and `n` rejects. `Enter` alone never approves.
  - A card with more than two outcomes numbers them: `1`–`9` picks one, and `↑`/`↓` move a highlight that `y` picks. The suggested option starts highlighted. `Enter` alone never picks, and `n` picks the cancel option where there is one.
  - `v` shows everything.
  - `e` edits claims, where the card has them.
  - `Esc` sets the card aside.
- **CARD-3** Cards queue first in, first out, with a count. Time waiting on a card is excluded from worked-for timers.
- **CARD-4** A card names who asked, the task and its id, and what it allows: claims, autonomy, base and size.
- **CARD-5** Policy-trust, attribution, memory, apply-review and stop-confirm cards default to No. The resume card defaults to the handoff.
- **CARD-6** A card whose scope includes an execution-bearing path (POL-3, →M5) needs `yes` typed out.
- **CARD-7** In plain mode, cards are numbered choices (PLAIN-3).
- **CARD-8** These are the card kinds. Each is defined by its own requirement:

  | Kind | Requirement |
  |---|---|
  | write | WAKE-8 (→M5) |
  | apply-review | WS-8 (→M5) |
  | lead task | LEAD-4 (→M10) |
  | policy trust | POL-1 (→M5) |
  | resume | LEAD-9 (→M9) |
  | cold wake | LIM-3 |
  | quota | LIM-2 (→M9) |
  | quota gate | LIM-5 (→M6) |
  | attribution | GUARD-4 (→M5) |
  | memory | MEM-3 (→M7) |
  | plan approval | WAKE-12 (→M8) |
  | stop confirm | KEY-1, CMD-7 |
  | quit with work | CHAT-4 |
  | Monarch restart | LEADRT-7 |
  | git metadata | GIT-3 |

  Kinds whose requirement is in a later milestone appear when that milestone lands.
- **ATTN-1** Notices go into a priority queue: they show above the prompt for 8 s, and as dim lines in the transcript. A compaction summary is a notice that can be expanded: a click, or the transcript screen (`ctrl+o`, CHAT-2), shows it in full.
- **ATTN-2** When a card has waited and you have been idle for 6 s, `sa` rings the bell, plus OSC 9 where supported. `/notify off` turns both off.
- **ATTN-3** The terminal title shows the chat's state.

### 6.6 Roster (ROS)

- **ROS-1** Order:
  1. the Monarch
  2. soldiers waiting on you
  3. awake soldiers
  4. dormant soldiers

  Within each group, config order.
- **ROS-2** Each row shows:
  - a state glyph: `●` awake, `○` dormant with a session, `·` no session, `❄` cold, `⏸` limited, `!` waiting on you
  - the name, as UX-9
  - a meter (CTX-1)
  - the quota % when known
  - a status word
- **ROS-3** State is never shown by color alone.
- **ROS-4** The meter's color steps at 30%, 50%, 70% and 90%.
- **ROS-5** Status words (Q5): dormant phrases rotate every 30 s; working rows show a role verb (`marching`, `inspecting`, `scouting`, `probing`) until the first activity, then the activity. The lists are configurable.
- **ROS-6** The Monarch's row shows its context, and from M6 its Claude quota (LIM-1, →M6).
- **ROS-7** Each soldier has a stable color from an 8-color palette. A second config entry for the same CLI and model is named `<id>-2`.

### 6.7 Live tree (TREE)

- **TREE-1** The tree appears above the prompt while anyone is busy, or a card is waiting.
- **TREE-2** Its root is the Monarch, then soldiers that are running, queued, waiting, or finished within 30 s, then their subagents.
- **TREE-3** Each row shows:
  - a spinner or a status glyph
  - the name, as UX-9 (subagents show their type)
  - activity text from the CLI's own events
  - tokens
  - worked-for time, excluding card waits
  - `stalled` after 120 s without an event
- **TREE-4** Branches are open while any subagent runs, and fold to `▸ +N agents (r running · d done)` when all have finished. A manual toggle persists (Q20, D8).
- **TREE-5** At most 8 rows (3 below 30 terminal rows), then `+N more`.
- **TREE-6** Where a CLI doesn't stream subagent detail, the branch shows what is known and fills tokens from the child's transcript.
- **TREE-7** A soldier over the subagent cap shows `⚠ 4/3`.
- **TREE-8** The root glyph is `◆`.

### 6.8 Soldier view and direct chat (VIEW)

- **VIEW-1** A view opens with `Enter` on a row, `/view <name>`, or a click. `Esc` closes it and never stops work.
- **VIEW-2** A view renders the soldier session's vendor transcript, with tool calls collapsed, followed by that soldier's reports. Subagents get read-only views where the CLI stores them. A view loads on open, is released on close, and its text passes SAFE-7.
- **VIEW-3** Text typed in a view, or `@name <text>`, is a direct turn (D7a). For a soldier that can write, each direct message opens a write card first, unless `/auto-approve writes` is on (SAFE-3). The claims default to the soldier's last claims, and `e` edits them. A soldier that never writes (agy) gets read-only turns with no card. `@name --write --claim <globs> <task>` pre-fills the claims. An unknown `@name` goes to the Monarch.
- **VIEW-4** Each direct exchange adds one line of ≤200 characters to the next update, built with no model call (Q21).
- **VIEW-5** Subagents cannot be messaged; the vendors give no way to address them.
- **VIEW-6** The views of the Monarch and of Claude soldiers show a `get_context_usage` breakdown. Others show the total and the ceiling.

### 6.9 Commands (CMD)

| Input | Effect | Monarch tokens | Defined by |
|---|---|---|---|
| plain text | Message to the Monarch | yes | CHAT |
| `@name …` | Direct turn | no | VIEW-3 |
| `compact <name> [--deep]` | Shadow compaction | no | CMP-2 |
| `/compact` | Compact the Monarch | yes | LEAD-10 |
| `/switch` · `/effort` | Change the lead, or its effort | yes / no | LEAD-7, LEAD-6 |
| `/auto-approve writes on\|off` | Write cards off until turned back on (persists across `--resume`) | no | SAFE-3 |
| `/undo <task>` · `/cancel <name\|task>` | Undo; stop | no | WS-9, CMD-7 |
| `/view` · `/army` · `/cards` | Navigation | no | VIEW-1, UX-4, CARD-1 |
| `/memory …` · `/usage` · `/report <task>` | Memory, ledger, full report | no | MEM-12, LEDGER-6, CMD-6 |
| `/copy` · `/mouse` · `/notify` | Terminal settings | no | UX-5, ATTN-2 |
| `/new` · `/chats` · `/resume <id>` · `/doctor` · `/help` | Chats and help | no | CMD-4, CMD-5, CMD-8 |

- **CMD-1** Local commands never send anything to the Monarch.
- **CMD-2** `compact` matches `^/?compact\s+(<id>|<shadow name>)(\s+--deep)?$`, case-insensitively.
- **CMD-3** An unknown `/command` produces a local error.
- **CMD-4** `/new` starts a new chat, and every soldier starts fresh in it (Q7).
- **CMD-5** `/resume` opens a picker of this folder's chats (first message, start time, last activity, branch), and `/resume <id>` switches directly; `/chats` is an alias. Switching closes the current chat first (CHAT-4, →M4).
- **CMD-6** `/report <task>` prints that task's full report.
- **CMD-7** `/cancel <name|task>` stops a turn (SOLD-4). A write turn needs a stop-confirm card first.
- **CMD-8** `/help` lists commands and keys. `/doctor` runs the checks available so far: LEADRT-10, then DOC-1 (→M6).

### 6.10 Plain mode (PLAIN)

- **PLAIN-1** Plain mode runs with `--plain`, or when stdout is not a TTY. It is ASCII lines in this grammar:

  ```
  HH:MM:SS <who>: <text>
  who = you | monarch | <shadow>(<id>/<model>) | sa
  ```

- **PLAIN-2** Each input line is one message. A trailing `\` continues it.
- **PLAIN-3** Cards are numbered options with no default. EOF or `q` rejects.
- **PLAIN-4** `sa --plain --once "<message>"` runs one exchange and exits. Exit codes:

  | Code | Meaning |
  |---|---|
  | 0 | OK |
  | 1 | Runtime error |
  | 2 | Config error |
  | 3 | A card was unresolved |
  | 4 | Quota-limited |

### 6.11 Chat shell (CHAT)

- **CHAT-1** On a TTY in a git repository, `sa` (or `shadow`) always starts a **new** chat (D11).
  - `sa --resume [id]` reopens one, with a picker when no id is given.
  - `sa --continue` (`-c`) reopens the most recent, as `claude -r` and `claude -c` do.
  - Without a TTY, `sa` runs in plain mode.
  - Outside a repository, `sa` explains and lists the v1 commands.
  - If another chat is open in the same folder, `sa` says so and exits (GUARD-5, →M5).
- **CHAT-2** The transcript shows your messages with their ids, the Monarch's streamed text, its tool calls grouped and collapsed (ctrl+o opens the transcript screen), one line per wake, a collapsed entry per report, and notices.
- **CHAT-3** Input sent while the Monarch is busy is queued, shown as queued, and delivered after its current tool batch.
- **CHAT-4** Quitting while soldiers work opens a card with three choices: wait, stop all, or cancel the quit.

## 7. Architecture

```
┌──────────────────────────────── sa (one Node process, owns all state) ─────────────────────────┐
│ Ink UI ⇄ Chat controller ──stdin/stdout stream-json──▶ claude -p … (Monarch, long-lived)       │
│              │   ▲                                            │ HTTP MCP (127.0.0.1)           │
│              │   └──── Army MCP endpoint ◀────────────────────┘ token only in Monarch's env    │
│              ▼                                                                                  │
│   authorize() ─▶ Wake scheduler ─▶ Brief builder ─▶ Soldier runtime (Job Object per turn)      │
│        ▼                                                ▼                                       │
│   Task ledger · Session registry · Usage ledger · Event normalizer ─▶ roster / tree / views     │
│   Repo mutex: capture · base · apply · undo · refs     Workspaces · audit · guard · journal     │
│   Runtime dir (outside repo): chats, reports, logs, pids, Monarch settings and workspace, lock   │
│   In repo .shadow/: soldier worktrees, memory, v1 vault and locks                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Control plane (ARCH)

- **ARCH-1** Runtime state MUST live outside the repository:

  | OS | Path |
  |---|---|
  | Windows | `%LOCALAPPDATA%\shadow-army\<repoId>\` |
  | macOS | `~/Library/Application Support/shadow-army/<repoId>/` |
  | Linux | `$XDG_STATE_HOME/shadow-army/<repoId>/` |

  `<repoId>` is a hash of the canonical root. The runtime directory also holds the Monarch's workspace and patch files.
- **ARCH-2** The army MCP token never touches disk:
  - A new token is made for every Monarch launch.
  - The MCP config sends `Authorization: Bearer ${SA_ARMY_SESSION}`, a name that is not credential-like [S2].
  - The variable is set only in the Monarch's environment.

  **Fallback:** an MCP stdio server reached through an inherited pipe, with no network listener.
- **ARCH-3** The endpoint MUST:
  - bind to `127.0.0.1` on a random port
  - reject requests without the token, or with a foreign `Host` or `Origin`
  - treat an `initialize` carrying the current token as replacing the previous session
  - serve only while the chat is open
- **ARCH-4** Every process Shadow Army starts gets an allowlisted environment.
  - **Windows:** `SystemRoot`, `windir`, `PATH`, `PATHEXT`, `COMSPEC`, `TEMP`, `TMP`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `PROGRAMDATA`, `ProgramFiles*`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `OS`, `USERNAME`, `LANG`, `LC_*`.
  - **POSIX:** `PATH`, `HOME`, `USER`, `SHELL`, `TMPDIR`, `LANG`, `LC_*`, `TERM`.
  - **Vendor homes:** `CODEX_HOME`, `GROK_HOME`, `CLAUDE_CONFIG_DIR`.
  - **The harness's own variables** for that process.
  - **Excluded everywhere:** `*_API_KEY`, `*TOKEN*`, `*SECRET*`, `ANTHROPIC_*` and other `SA_*` variables. That guarantees subscription auth for Claude processes (F44). Only CI tests may set `ANTHROPIC_BASE_URL` and an `ANTHROPIC_API_KEY` placeholder for the fake Messages server.

### 7.2 Monarch runtime (LEADRT)

- **LEADRT-1** The Monarch is launched with these flags (F18). The env flags are tagged [S1]:

  ```
  claude -p --input-format stream-json --output-format stream-json --verbose
    --include-partial-messages --replay-user-messages
    --model <monarch model> --effort <lead.effort=high> --autocompact <lead.autoCompactAt=200000>
    (--session-id <uuid> | --resume <id>)
    --restricted --tools "Read,Grep,Glob" --disable-slash-commands --exclude-dynamic-system-prompt-sections
    --permission-mode dontAsk --permission-prompts none
    --strict-mcp-config --mcp-config <runtime>/chats/<id>/mcp.json
    --settings <runtime>/chats/<id>/lead-settings.json
    --append-system-prompt-file <runtime>/chats/<id>/lead-prompt.md
    --add-dir <runtime>/reports
  env (allowlisted, ARCH-4): SA_ARMY_SESSION, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1,
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1, ENABLE_TOOL_SEARCH=false, MCP_DISCOVERY_CACHE=0,
    CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1 (on resume)
  cwd: repository root
  ```

  Every flag is passed again on every launch. `Edit` and the lead workspace are added by CONF-7 (→M10). **Fallback:** ToolSearch joins `--tools`, and the controller re-sends an interrupted turn.
- **LEADRT-2** **Readiness.** Nothing is sent to the Monarch until the army endpoint has seen an `initialize` and a `tools/list` carrying the current token, and `mcp_status` (where available [S1]) reports `army` connected. The wait times out after 30 s; input typed meanwhile is queued. On timeout, the chat shows the error and offers `/doctor`.
- **LEADRT-3** Each input carries a `uuid`. Only those not acknowledged through `--replay-user-messages` are re-sent after a restart [S1]. **Fallback:** messages are sent at most once, and unacknowledged ones are marked.
- **LEADRT-4** Your messages and `notify: now` updates use `priority: next`. Other updates use `later` [S1]. **Fallback:** the controller holds input until the Monarch is idle.
- **LEADRT-5** Busy and idle come from `session_state_changed` [S1]. **Fallback:** a `result` with no running tools.
- **LEADRT-6** An interrupt uses the `interrupt` control request, with a receipt when `capabilities` includes `interrupt_receipt_v1` [S1]. **Fallback:** stop the process and `--resume`.
- **LEADRT-7** After an unexpected exit, the Monarch restarts with `--resume`, at most 3 times in 60 s. It never restarts after `authentication_failed`, `billing_error` or a quota rejection; a Monarch-restart card appears instead.
- **LEADRT-8** `assistant.error` and `api_retry` map to roster states and notices.
- **LEADRT-9** The Monarch's meter uses `get_context_usage` after each turn [S1]. **Fallback:** the last main-thread `assistant.message.usage`.
- **LEADRT-10** Before every chat, `claude auth status` must report a claude.ai login, and the CLI version must be in the tested range. Otherwise the chat refuses to start. From M9, it also offers codex-astra (D17, LEAD-7 →M9).
- **LEADRT-11** After `lead.maxCallsPerTurn` (40) model calls in one turn, the controller interrupts the Monarch and posts a notice.
- **LEADRT-12** **Registry.** `<runtime>/chats/<id>/` holds `chat.json`, `events.jsonl` and `briefs/`. Writes are atomic, and `--resume` rebuilds the screen from `events.jsonl`.

### 7.3 Army updates (UPD)

- **UPD-1** An update is one JSON document inside nonce tags, `<army-update-7f3a…>…</army-update-7f3a…>`. All soldier text is JSON-string encoded and passes SAFE-7.
- **UPD-2** A report item carries `taskId`, `soldier`, `shadow`, `status`, `summary`, `filesTouched`, `openQuestions`, `notes`, `verdict`, `qu`, `toolCount`, `durationSec`, and the kept ref with partial text. `status` is one of ok, failed, cancelled, timeout, ceiling, limit, refused, read-violation, link-escape, guard or unreviewed. The item is capped at `chat.reportMaxChars` (1,500), cut in this order:
  1. `notes`, to names only
  2. `openQuestions`, to 3 × 150 characters
  3. `filesTouched`, to paths plus `+N more`
  4. `summary`, to 600 characters

  The full report goes to `<runtime>/reports/<taskId>.md`.
- **UPD-3** Delivery follows `notify`:

  | `notify` | Delivered | Priority |
  |---|---|---|
  | `batch` (default) | When every wake started in the same Monarch turn has finished, or 60 s after the first one finishes | `later` |
  | `now` | Immediately | `next` |
  | `silent` | With your next message | — |

- **UPD-4** Items are ordered: stops, your direct exchanges, reports, then notices. The queue holds at most 100; the oldest notices are dropped first and counted.

### 7.4 Army MCP tools (MCP)

| Tool | Input | Returns |
|---|---|---|
| `wake` | `soldier`, `task`, `role`, `mode` (`read`/`write`/`plan`), `session` (`auto`/`continue`/`fresh`), `claims?`, `difficulty?` (`routine`/`hard`), `effort?`, `attach?`, `after?`, `continueFrom?`, `notify?`, `label?`, `requestId` | `{taskId, status, reason?, army}` |
| `control` | `taskId`, `action` (`cancel`/`steer`/`extend`), `note?` | `{ok}` |
| `git_read` | `cmd` (status, diff, log or show), validated arguments | text |
| `remember` | `type`, `name`, `description`, `body`, `soldier?`, `fromTask?` | `{saved \| pending, reason?}` |
| `context` | `soldier`, `action` (`compact`/`extend`), `deep?`, `ceiling?` | `{scheduled}` |
| `lead_task` | `begin(claims, summary)` or `end` | as LEAD-4 |

- **MCP-1** Every call passes `authorize()` (SAFE-5).
- **MCP-2** There are at most 6 tools, with schemas totalling at most 1,500 tokens.
- **MCP-3** `git_read` builds git's argument list itself and runs under GIT-1 and GIT-2. It accepts only `--stat`, `--name-only`, `--name-status`, `--oneline`, `--short`, `-p`, `-U<n>`, `-n <N>`, `--cached` and `--no-patch`, plus revision and path operands, and refuses any other option. `show` takes a commit or `<rev>:<path>`, never a bare blob or tree id. `SECRET_GLOBS` match case-insensitively: a matching path is refused, also in `show <rev>:<path>` after `./` and `..` are resolved, and each `diff`, `log` and `show` gets `:(top,exclude,glob,icase)<glob>` for every entry. So a secret file's content never appears, even from history. A diff returns `--stat` plus hunks up to 6k tokens, else a summary.
- **MCP-4** `wake` is idempotent per `requestId`. Fields whose milestone hasn't landed yet are refused with a reason: `mode: write`, `claims` and `continueFrom` (→M5), and `mode: plan` and `after` (→M8).
- **MCP-5** `control` acts on a queued or running task:
  - `cancel` stops it (SOLD-4).
  - `steer` delivers a note to the soldier: mid-turn for claude, through stream-json input [S5]; for the other CLIs, by interrupting the turn and running a continuation turn with the note.
  - `extend` raises that task's safety ceiling once, to at most twice the default (WAKE-15).

  A continuation turn is part of the same task. It keeps the workspace, the lease and the session, and it skips WAKE-4's priming, SESS-1, SESS-8 (→M5) and WS-2's steps 3–5 (→M5). Audit and apply (WS-7, →M5) run once, at the end of the task. **Fallback:** steer always interrupts and continues.
- **MCP-6** `remember` follows MEM-1 and MEM-7.
- **MCP-7** `context` follows CMP-2 for `compact` and CTX-5 for `extend`.
- **MCP-8** `lead_task` follows LEAD-4.

### 7.5 Soldier runtime (SOLD)

- **SOLD-1** Adapters gain a streaming, session-aware turn:

  ```ts
  interface TurnRequest extends RunRequest { sessionId?: string; newSessionId?: string; subagentCap: number;
    toolsProfile: "build" | "review" | "research" | "test" | "plan"; env: Record<string, string> }
  interface SoldierTurn { events: AsyncIterable<SoldierEvent>; result: Promise<RunResult & { sessionId: string }>;
    stop(reason: string): Promise<{ partialText?: string }> }
  type SoldierEvent = { t: "session"; sessionId: string } | { t: "activity"; text: string; kind?: string }
    | { t: "text"; delta: string } | { t: "usage"; call: NormalizedUsage }
    | { t: "subagent"; id: string; label: string; state: "started" | "running" | "done" | "error"; usage?: NormalizedUsage }
    | { t: "compacted" } | { t: "limit"; resetsAt?: string } | { t: "error"; kind: string; message: string };
  ```

- **SOLD-2** **Claude lean launch:**

  ```
  -p --input-format stream-json --output-format stream-json --verbose --strict-mcp-config
  --disable-slash-commands --exclude-dynamic-system-prompt-sections --tools <SOLD-8 list>
  ```

  It adds `--session-id` or `--resume`, with env `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
  - **Supervised and `auto`** add `--restricted`.
  - **`full`** adds `--setting-sources ""` instead (F19) [S5].
  - **Check:** after `system/init`, the wake fails as `failed (profile)` if the tools or MCP servers differ from the profile.
  - **Fallback:** v1 flags plus `--strict-mcp-config`, with the extra prefix recorded.
- **SOLD-3** `sa doctor --tokens` measures each CLI's first-call prefix. It costs one tiny call per CLI, which you are asked about first.
- **SOLD-4** **Stop** happens in two stages:
  1. the vendor's interrupt, then a 5 s grace period
  2. kill the turn's Job Object (SAFE-11)

  Partial text is kept. Pidfiles live in the runtime directory, and at startup `sa` kills leftover processes after matching their command lines [S12]. **Fallback:** walk descendants by parent pid, run `taskkill /T /F`, then check for survivors.
- **SOLD-5** `sa doctor` lists vendor daemons (grok's leader, codex's sandbox service). "Dormant" means no Shadow Army process.
- **SOLD-6** Unknown events and fields are logged and ignored. Ten unparseable lines in a row fail the turn as `failed (protocol)`.
- **SOLD-7** codex, grok and agy implement SOLD-1, SOLD-4, SOLD-6 and WAKE-11, with these lean launches [S5]:

  | CLI | Launch |
  |---|---|
  | codex | `exec --json --ignore-user-config -m <model> -c model_reasoning_effort=<e> -c windows.sandbox=<your value> -s <mode> -C <ws>`, then `exec resume <id>` (SESS-6) |
  | grok | `--output-format streaming-messages-json --tools <SOLD-8 list>`; `--no-subagents` when the cap is 0; `--session-id` or `--resume`; env `GROK_MEMORY=0` |
  | agy | `--output-format stream-json --input-format stream-json`, prompt on stdin; `--conversation <id>` |

  **Fallback:** v1 flags, with the extra prefix recorded.
- **SOLD-8** Tool lists per profile. `Agent` and `task` are added only when `subagentCap > 0`. Final lists per OS come from S5's `init` fixtures.

  | Profile | claude | grok |
  |---|---|---|
  | build, test | `Bash,PowerShell,Read,Edit,Write,Grep,Glob` | `run_terminal_cmd,search_replace,read_file,grep,list_dir` |
  | review, plan | `Read,Grep,Glob` | `read_file,grep,list_dir` |
  | research | `Read,Grep,Glob,WebFetch,WebSearch` | `read_file,grep,list_dir,web_search,web_fetch` |

  codex and agy use their sandbox and plan modes instead of tool lists.

### 7.6 Usage ledger (LEDGER)

- **LEDGER-1** Every model call is normalized to `{uncachedIn, cacheRead, cacheWrite1h, cacheWrite5m, out, reasoning}`. For claude (the Monarch), that is `input_tokens`, `cache_read_input_tokens` and `cache_creation` split into 1h and 5m.
- **LEDGER-2** `contextTokens` = `uncachedIn + cacheRead + cacheWrite` of the latest main-thread call.
- **LEDGER-3** QU = 1.5 × (uncachedIn + cacheWrite) + 0.1 × cacheRead + 5 × (out + reasoning). QU is an estimate; vendor quota % is the ground truth.
- **LEDGER-4** Claude soldiers: calls are deduplicated by `message.id`, final output is taken from `result`, and subagent usage (`parent_tool_use_id` set) counts to the subagent and to its soldier.
- **LEDGER-5** Other CLIs [S5]:
  - **codex:** uncached = `input_tokens − cached_input_tokens`.
  - **agy:** cumulative values are differenced.
  - **grok:** per S5.

  **Fallback:** totals only.
- **LEDGER-6** `/usage` shows, for the Monarch and each soldier: calls, raw counts, QU, wakes (fresh, resumed, cold), primings, rollovers, ceiling stops, and each vendor's quota change. `total_cost_usd` appears only as "API-equivalent".

## 8. Waking and orchestration

### 8.1 Wakes (WAKE)

- **WAKE-1** Only the Monarch (`wake`) and you (`@name`, or a view) wake soldiers. Soldiers ask for help in `openQuestions` (Q3).
- **WAKE-2** Every entry point passes `authorize()`.
- **WAKE-3** A brief contains:
  - the task, its purpose and done-criteria
  - constraints
  - claims, for a write
  - attachments, named by id
  - the memory delta (MEM-6, →M7)
  - **only when priming**: `rules.md`, the agent section, the memory index (→M7), `AGENTS.md` when the CLI won't load it, and the report format

  Never the transcript (Q4).
- **WAKE-4** Priming happens at session start, and when the hash of `rules.md` or the agent section changes.
- **WAKE-5** Reports keep v1's shape. Reviews and tests add `verdict: pass | fail | partial`, with evidence for each check.
- **WAKE-6** One turn at a time per soldier session; further wakes queue in order (D7b).
- **WAKE-7** The entry currently leading is never woken or assigned work by the router.
- **WAKE-8** Write wakes need a write card unless auto-approve applies (SAFE-3, →M6). The card's approval is what lets Shadow Army apply the result (WS-7).
- **WAKE-9** **Check-ins** (D16). A check-in never stops a wake; only the safety ceiling does (WAKE-15). The harness sends the Monarch a check-in item when any of these triggers fires (`chat.checkIn`: `{everyMinutes: 15, everyCalls: 30, everyQU: 400000, stallSeconds: 120}`):
  - every 15 minutes of work
  - every 30 model calls
  - every 400k QU
  - three identical tool calls in a row (a loop)
  - an edit outside the brief's files and claims
  - 120 s with no events (`stalled`)
  - 80% of any ceiling dimension, so the Monarch can `extend`

  The item carries the task line, elapsed time, calls, QU, ceiling headroom, files touched, the last five activities and the trigger. Check-ins bypass UPD-3's batching:
  - loop, off-brief and stalled items go at once with `priority: next`
  - the others go with `priority: later` as soon as the Monarch is idle

  A check-in is answered when the Monarch turn that received it ends, whatever the Monarch did. A task has at most one unanswered check-in, and at most one per 5 minutes; the 80% check-in skips both limits, once per ceiling dimension. The Monarch may do nothing (the default), steer the soldier, stop it, or extend its ceiling (MCP-5).
- **WAKE-10** At most `chat.maxConcurrentWakes` soldiers (3) are awake at once.
- **WAKE-11** The subagent cap is `chat.subagentCap` (3 per task, Q22). Where the CLI has a flag, the flag enforces it; otherwise the harness counts subagent starts in the stream and stops the turn when one exceeds the cap. The cap is stated in priming.
- **WAKE-12** `mode: plan` returns a plan. Approving its plan card starts the write wake with that plan attached.
- **WAKE-13** For a second opinion (Q3), a plan wake to codex-astra (orchestrate role) returns a plan report. `assign.ts` allows read wakes in the orchestrate role.
- **WAKE-14** Priming also happens after a rollover, a Shadow compaction, or an observed vendor compaction.
- **WAKE-15** **Safety ceiling** (D16). A wake stops at `chat.wakeCeiling` (`{maxCalls: 150, maxQU: 3000000, maxMinutes: 60}`) with status `ceiling`, keeping its partial result. Partial work stays on its ref and is never applied on its own. `wake(continueFrom: <taskId>)` (WS-6, →M5) starts a new wake from that tip, so heavy work can carry on and lands as one change. The Monarch can raise one task's ceiling once, up to twice the default (MCP-5).

### 8.2 Orchestration rules (ORCH)

These are part of the Monarch's static prompt.

- **ORCH-1** Understand the problem before delegating.
- **ORCH-2** Briefs are self-contained: purpose, exact files and lines, done-criteria, and read or write.
- **ORCH-3** Reads run in parallel. Writes run one at a time per claim set.
- **ORCH-4** After starting wakes, end the turn. Never predict a result.
- **ORCH-5** `continue` for follow-ups on the same files; `fresh` after a wrong approach or for unrelated work. Reviews always run `fresh`, never by the author.
- **ORCH-6** Every write task is followed by a review or test. The harness posts a notice after 3 write tasks without one.
- **ORCH-7** The harness owns a task ledger: id, label, owner, state and `after`. `wake(after)` waits for its predecessors, and a cancellation cascades to dependents.

## 9. Sessions and workspaces

### 9.1 Sessions (SESS)

- **SESS-1** A chat links at most one live session per soldier (Q7). A wake resumes or starts fresh according to this table:

  | Policy | Warm and below the ceiling | Warm and at or above the ceiling | Cold |
  |---|---|---|---|
  | `smart` (default, D1) | Resume | Shadow compaction (CMP-3, →M9), else fresh plus digest | Fresh plus digest |
  | `keep` | Resume | Resume | Resume, after a cold-wake card if ≥ `coldWakeGuardTokens` (LIM-3) |
  | `session: continue` | Resume | Resume | As `keep` |
  | `session: fresh` | Fresh plus digest | Fresh plus digest | Fresh plus digest |

  A resume also needs continue validity:
  - **Before M5:** HEAD's oid and a hash of `git status` must match the previous wake's.
  - **From M5:** SESS-8 (→M5).

  CMP-3's own summary turn is exempt from this table.
- **SESS-2** A digest is built by the harness from the soldier's reports, in at most 2 KB.
- **SESS-3** The TTL is learned per vendor. Defaults: claude 3,600 s, codex 3,600 s, grok 1,800 s, agy 1,800 s. Evidence of 1h versus 5m cache writes and cache misses updates them.
- **SESS-4** A failed resume starts fresh with a digest, and the roster shows `new session`.
- **SESS-5** Chat wakes drop the flags that disable persistence. v1 commands keep them.
- **SESS-6** codex: first try `codex exec -s <mode> -C <ws> resume <id>` [S6]. If a read-only resume can still write, the soldier keeps two sessions, one for read and one for write. **Fallback:** two sessions.
- **SESS-7** Resuming a chat resumes the Monarch. Soldiers resume or roll over on their next wake. A Claude session older than `cleanupPeriodDays` falls under SESS-4.
- **SESS-8** **Continue validity, from M5.** A resume is valid only when all three hold:
  - the soldier's last tip was applied or it was a read wake
  - no file it read or touched differs between the tree it produced (its tip, or the base for a read) and the new base
  - no undo or refused apply has happened since

  Otherwise the wake starts fresh. The brief announces any undo or refused apply. For a `continueFrom` wake (WS-6), the continued tip counts as applied and stands in for the new base, so the soldier that produced it can keep its session.

### 9.2 Workspaces, base, apply and undo (WS)

- **WS-1** Each soldier has one workspace per chat: `.shadow/worktrees/<chatId>-<soldier>`, a detached worktree. Every wake runs in it (D7f). Before M5, read wakes run in v1-style snapshots at HEAD.
- **WS-2** Before every wake, the harness runs these steps under the repository mutex (GUARD-3):
  1. SAFE-9
  2. GIT-3
  3. `reset --hard <base>`
  4. `clean -ffdx -e <keep>`, where keep is `chat.keepIgnored`: `node_modules/`, `.venv/`, `target/`, `.gradle/`. Every gitlink path is then emptied link-safely (SAFE-8): workspaces never check submodules out, and `reset` and `clean` leave a nested repository there alone.
  5. `status --porcelain --ignored` must list only keep paths; otherwise the wake fails as `dirty workspace`
- **WS-3** A non-ignored change after a read wake is a `read-violation`, and it is discarded.
- **WS-4** Dependencies live in the kept folders, and soldiers install them there.
- **WS-5** The **working-state base** extends #32's `snapshot.ts` (§0.3):
  1. Copy the real index into a temporary index.
  2. Run `git add -A`, excluding `.shadow/`, untracked files over `chat.baseMaxUntrackedBytes` (1 MB), and `SECRET_GLOBS`, matched case-insensitively (`:(top,exclude,glob,icase)`).
  3. `write-tree`.
  4. `commit-tree -p HEAD` with the harness identity.
  5. Check that `.shadow/` is absent.

  It runs under GIT-1…3 and the mutex. The excluded files are listed on the chat's first write card. The base is refused during a merge, rebase, cherry-pick, revert or bisect, and in sparse checkouts. Submodules are carried as gitlinks and LFS files as pointers.
- **WS-6** Bases and task tips live under `refs/shadow-army/<chatId>/`. Their oids are written to `chat.json` first, then `update-ref` runs, under the mutex.

  **Continuing** (WAKE-15). `wake(continueFrom: <taskId>)` accepts only a write task that ended `ceiling`, `timeout` or `limit` and was never applied; a task you or the Monarch cancelled cannot be continued. The new task keeps that task's base, and its claims must include that task's claims. WS-2's step 3 resets the workspace to that task's tip instead of the base. At the end, WS-7 audits and WS-8 applies `base..newTip`, so the work of both tasks lands as one change or not at all. The `session` field works as usual (SESS-8).
- **WS-7** A write wake ends in this order:
  1. the claim audit, with reverts (F39)
  2. commit
  3. record the tip (WS-6)
  4. **apply, only if** the status is `ok`, the lease is intact, and there was no guard finding, `link-escape` or `read-violation`

  Otherwise the work stays on its ref and the Monarch is told. Every step runs only while GIT-3 passes: a GIT-3 finding ends the task with status `guard`, commits and applies nothing, and shows the git-metadata card. The lease heartbeat runs until the apply finishes (F39).
- **WS-8** **Apply** is all-or-nothing:
  - Every file in `base..tip` must match its base blob in your checkout (`git hash-object --path`, GIT-2). Otherwise nothing is applied.
  - Changes to symlinks, gitlinks, modes, `.gitmodules` or `.gitattributes` need an apply-review card with typed `yes`. Auto-approve covers mode, `.gitmodules` and `.gitattributes` changes, but never a symlink or gitlink that is added or retargeted (SAFE-3, →M6).
  - The patch is written to the runtime directory and re-hashed between `--check` and apply.
  - **If an apply or an undo fails** after `--check` passed (a file is held open, the disk is full), `git apply` can leave some files changed and others deleted (F46). So before either one writes anything, the harness copies the current bytes of every path the patch touches to `<runtime>/journal/<task>/pre/`, noting the paths that don't exist. On failure, it restores each path from that copy, never from a blob, deletes files the patch created, marks the journal entry failed, and names the files. If that restore fails too, it prints where the copy is. Your edits in other hunks (WS-9) survive either way.
- **WS-9** **Undo**, extending #32's `sa undo` (§0.3). `/undo <task>` checks every hunk with `git apply -R --check`. If all of them still reverse cleanly, it reverses them and runs `git rm --cached` on the intent-to-add paths it created; otherwise it refuses and shows which hunks changed. Your edits in other hunks survive. This replaces #32's per-file refusal. It runs under the mutex, is journaled, and is announced in the soldier's next brief.
- **WS-10** `sa chats prune [--older-than]` removes the workspaces (SAFE-8) and refs of ended chats. Refs of tasks that were never applied are kept unless `--force` is given.
- **WS-11** Building a base takes at most 1 s for 10,000 files with 100 changed [S11]. **Fallback:** an incremental base.
- **WS-12** The exit screen also lists every applied-but-uncommitted task with its `/undo` command.

## 10. The Monarch (LEAD, CONF)

- **LEAD-1** The Monarch is `monarch.default` (claude-opus), with codex-astra as fallback. `sa run` uses the same setting (Q12, Q23).
- **LEAD-2** The Monarch's powers are its entry's roles, without a shell or web tools (D12).
- **LEAD-3** **Fix policy** (Q18, D2):
  - The Monarch judges each fix by router difficulty, and delegates when a cheaper qualified soldier exists.
  - When unsure, it wakes `claude-opus-build`.
  - It does tiny fixes itself. `lead_task end` fails as `too-large` above one file or 40 lines.
- **LEAD-4** A **lead task** runs in this order:
  1. `lead_task begin(claims)` shows a lead-task card.
  2. The lead workspace, `<runtime>/lead/<chatId>` (a worktree created at chat start), is set to a fresh base.
  3. The Monarch edits there.
  4. `lead_task end` runs WS-7 and WS-8.
  5. A review wake goes to a soldier with the review role that is neither the Monarch nor the author (default codex-astra).

  If no reviewer is eligible, the task is applied with status `unreviewed` and a notice says so.
- **LEAD-5** The Monarch reviews through `git_read diff`. Diffs over 6k tokens go to a reviewer soldier, whose report of at most 1,200 characters the Monarch reads (D18).
- **LEAD-6** `/effort <level>` changes the Monarch's effort, with a `--resume` restart (D4).
- **LEAD-7** `/switch <name>` accepts only soldiers with the orchestrate role.
  - **Claude to Claude:** through `set_model` [S1]. **Fallback:** a handoff.
  - **To codex-astra** (D17): a new session from a handoff. It is read-only (D13) [S10]. **Fallback:** Claude models only.
- **LEAD-8** `lead-prompt.md` is byte-identical for the life of a session. Dynamic state arrives as messages.
- **LEAD-9** If you resume a chat while the Monarch is cold and its context is at least `resumeMaxTokens`, a resume card asks how to continue and shows both estimated costs (D15): start from a handoff (pre-selected), or re-read the whole conversation. This matches Claude Code's resume-from-summary prompt.
- **LEAD-10** **Monarch compaction.** At 90% of its autocompact threshold, while idle, `sa` sends `/compact` with instructions to keep open tasks and decisions [S9]. After `compact_boundary`, it re-sends the memory index. `/compact` triggers this by hand. **Fallback:** a handoff restart.
- **LEAD-11** A lead task still open when the Monarch restarts is aborted, and its lease is released.
- **CONF-1** The Monarch's tools are `Read`, `Grep` and `Glob`, plus `Edit` from M10 (CONF-7, →M10), plus the army MCP tools. It has no shell, web or Agent tool (D12).
- **CONF-2** The Monarch runs in `dontAsk` with `--permission-prompts none`. The allow rules are the exact MCP tool names (`mcp__army__wake`, `mcp__army__control`, `mcp__army__git_read`, plus each later tool when its milestone lands) and reads of `<runtime>/reports/**` through `--add-dir`. Anything else that would ask is denied.
- **CONF-3** Deny rules, each written as `Read(<glob>)`, from one `SECRET_GLOBS` list shared with WS-5 (→M5) and MCP-3:
  - `**/.env*`, `**/*.pem`, `**/*.key`, `**/id_*`, `**/*.pfx`, `**/*.p12`
  - `**/.npmrc`, `**/.netrc`, `**/.pypirc`, `**/credentials*`
  - `.git/**` and `.shadow/**`

  The lead workspace is in the runtime directory, so these rules never block it. The rules must match case-insensitively, as the file system does on Windows and macOS: the CONF-6 suite reads `.ENV` and `Credentials.json` through `Read`, `Grep` and `Glob`, and each read must be denied [S3].
- **CONF-4** User, project and local settings, hooks and MCP servers do not load. S3 records which instruction files load, and POL-1 pins them (→M5) [S3]. **Fallback:** pinned CLAUDE.md content is sent as the first message.
- **CONF-5** A PreToolUse hook is a second layer. Its script lives in the runtime directory and is hash-checked. It denies edits outside the lead workspace, and any `Read`, `Grep` or `Glob` whose path matches `SECRET_GLOBS` case-insensitively, and exits 2 on any error.
- **CONF-6** **The permission suite** runs in CI against the pinned real `claude` binary, with a placeholder API key and a fake Messages server (ARCH-4) issuing scripted tool calls, and asserts `permission_denials` [S3]. It covers:
  - the shell is absent
  - secret and `.git` reads are denied
  - path tricks: `..`, junctions, 8.3 names, case variants, `\\?\`, alternate data streams, trailing dots and spaces
  - deleting the hook opens nothing
  - a **positive control**: reads in the repository succeed

  **Fallback:** a live run, recorded.
- **CONF-7** From M10, the Monarch gets `Edit` (in `--tools`), `--add-dir <runtime>/lead/<chatId>`, and the allow rule `Edit(//c/…/lead/<chatId>/**)`. The path comes from `canonicalPath()` in Claude's Windows form, with glob characters escaped. CONF-6 gains a positive control for editing there.
- **CONF-8** With the real login, the Monarch's `init` tool and server list contains no claude.ai connectors. This is checked with control requests only, and run by the owner.

## 11. Army memory (MEM)

```
.shadow/memory/               army memory (machine-local, never committed)
├── MEMORY.md                 index: one line per entry, ≤200 lines and ≤25 KB
├── project_*.md  user_*.md  feedback_*.md  reference_*.md
├── soldiers/<soldier>.md     learned notes for one soldier
├── .pending/                 learned from soldiers; waits for your OK
└── .quarantine/              changed outside `remember`, or failed a scan
```

- **MEM-1** Only the Monarch writes, through `remember` (D3). The harness writes each file, stamps its provenance (`source: monarch | user | soldier:<name>:<task>`, `createdAt`) and records its hash.
- **MEM-2** No process Shadow Army starts may touch your everyday memory directories. The switches are in LEADRT-1, SOLD-2 and SOLD-7, and this is the cross-CLI check [S5]. **Fallback:** that CLI's memory directory joins the sentinel set.
- **MEM-3** An entry derived from a soldier goes to `.pending/`. The Monarch sees it marked "unverified", and no soldier is primed with it until you approve it.
- **MEM-4** Hashes are checked at chat start and before every read. A file changed outside `remember` is quarantined.
- **MEM-5** The Monarch gets the index as the first message of each session and after each compaction. Soldiers get the filtered index (≤4 KB) at priming, and topic files inline when a brief names them. Soldiers never read the folder.
- **MEM-6** A wake's memory delta holds the entries saved or changed since that soldier session's last brief. So each fact reaches a session once, in its priming index or in one delta, and again only when a rollover or compaction primes it afresh (WAKE-14, →M9). The delta is at most 1.5 KB; larger changes are listed by name.
- **MEM-7** `remember` rejects secrets before writing.
- **MEM-8** `remember` rejects facts already in `AGENTS.md` or `CLAUDE.md`.
- **MEM-9** The index is capped at 200 lines and 25 KB, with a soft target of 8 KB.
- **MEM-10** `AGENTS.md` is yours, and the harness never writes it. `sa doctor` checks that each CLI loads it [S7]. **Fallback:** it is inlined in priming.
- **MEM-11** The v1 Vault's accepted notes are imported once (D7c).
- **MEM-12** `/memory` lists entries and lets you open, approve or delete them.
- **MEM-13** Entries carry clawspring-style fields, as ideas only: `confidence`, `lastUsedAt`, `conflictGroup`.

## 12. Context, rollover and compaction (CTX, CMP)

- **CTX-1** The meter shows `contextTokens / ceiling` (D1).
- **CTX-2** The usable window per CLI [S5]:

  | CLI | Usable window |
  |---|---|
  | claude | `autoCompactThreshold`, else the window minus 33k |
  | codex | 0.9 × `model_context_window` |
  | grok | 0.85 × the measured window |
  | agy | 120k |

  **Fallback:** these defaults.
- **CTX-3** Crossing 30%, 50% and 70% of the ceiling posts a notice (Q9). At 90%, CMP-2 applies.
- **CTX-4** Cold rows show `❄`, judged by the learned TTL.
- **CTX-5** **Dynamic ceiling** (D1). When a soldier crosses 90% of its ceiling at the end of a turn, the harness marks a pending compaction, and the next update tells the Monarch.
  - If the Monarch calls `context(extend)` before its next turn ends, the soldier's ceiling rises to at most `chat.maxCeiling` (200k), and never above its usable window.
  - Otherwise the pending compaction runs when that turn ends, or after 60 s if the Monarch stays busy (CMP-2).

  The extension holds while the soldier stays warm and on the same task line: wakes that share a `label`, or are linked by `after` or `session: continue`. A fresh session or an unrelated task returns the ceiling to `resumeMaxTokens`.
- **CMP-1** Shadow compaction applies to soldiers. The Monarch follows LEAD-10.
- **CMP-2** At 90% of the ceiling at the end of a turn, compaction runs as CTX-5 schedules it: after the Monarch's next turn ends without an extension, or after 60 s. On `compact <name>`, it runs after that task's report is delivered. It never runs mid-task (Q9).
- **CMP-3** **Procedure** (Q9, Q16):
  1. A warm soldier writes a summary of at most 1,500 characters ("what I did, files, decisions, open problems") in one explicit-continue turn. A cold soldier, or a failed turn, gets the digest instead (D7d).
  2. A new primed session starts with the summary.
  3. The link moves to it.
  4. A notice shows the summary.

  `--deep` forces the summary turn when cold, after a cold-wake card.
- **CMP-4** Ceilings sit below the vendors' compaction points, so Shadow compaction comes first and your rules re-apply (Q16).
- **CMP-5** A `compact_boundary` event, or a context drop of more than 40%, means the vendor compacted; WAKE-14 applies.

## 13. Token and quota efficiency (EFF)

**13.1 Quota model.**

| Driver | Budget | Controls |
|---|---|---|
| Army updates | ≤1 injected update per message you send, on average | UPD-3 |
| Monarch calls | ≤2.0 per message you send (live) | UPD-3, LEADRT-11 |
| Monarch context growth | ≤1.5k tokens per message you send | UPD-2, LEAD-5 |
| Monarch prefix | ≤20k tokens | CONF-1, CONF-4 |
| Soldier prefix, first call | claude ≤15k, codex ≤20k, grok ≤17k, agy ≤20k | SOLD-2, SOLD-7 |
| Cold re-reads | None without a card | SESS-1, LIM-3 |
| Long wakes | Check-ins at 15 min, 30 calls and 400k QU; ceiling at 60 min, 150 calls and 3M QU | WAKE-9, WAKE-15 |
| Priming | ≤1.5k tokens of rules, plus ≤4 KB of memory | WAKE-3 |
| Subagents | ≤3 per task | WAKE-11 |

**13.2 Requirements.**

- **EFF-1** A dormant soldier has no Shadow Army process.
- **EFF-2** No brief contains the transcript.
- **EFF-3** On the reference chat, the Monarch receives at most 1 injected army update per message you send, on average.
- **EFF-4** A warm resumed wake reads at least 90% of its prior context from cache (live).
- **EFF-5** First-call prefixes stay within §13.1, measured by `sa doctor --tokens`.
- **EFF-6** The army MCP stays within MCP-2.
- **EFF-7** Activity labels, direct notes, digests and local commands make no model calls.
- **EFF-8** **CI gate.** The reference chat, `test/fixtures/reference-chat.json` (20 messages, 6 wakes, 2 writes, 1 compaction), runs fake CLIs that count 4 bytes as 1 token. They charge `uncachedIn` for bytes a session hasn't seen within the TTL, and `cacheRead` for repeated prefixes, on a fake clock. CI fails above an absolute **0.9M QU**, or more than 10% above the committed baseline.
- **EFF-9** On the reference chat, the Monarch's context grows by at most 1.5k tokens per message you send.
- **EFF-10** Every brief and update is logged, redacted.
- **EFF-11** **Live:** on a recorded real chat of at least 20 messages, the Monarch makes at most 2.0 calls per message you send.
- **EFF-12** **Live:** the Monarch's first-turn prefix (`get_context_usage`) is at most 20k tokens.

**13.3 Expected effect.** This is critic B's model of the reference chat, an estimate until calibration (LIM-1):
- **Total:** 1.29M QU → about 0.77M QU.
- **Monarch's share:** 48% → 26% at medium effort. The owner chose high effort (D4), so expect more until EFF-11 measures it.
- **Claude only:** 0.87M → 0.41M QU, about 6% → 3% of one Pro 5-hour window (F26).

## 14. Plan limits (LIM)

- **LIM-1** The roster shows each vendor's quota: codex `rate_limits`; Claude `rate_limit_event` plus a QU estimate marked `~`; grok and agy only per S4 [S4]. Whenever a vendor reports a rejection or utilization, `sa` records the QU since that window started and updates its window estimate. **Fallback:** estimates only.
- **LIM-2** At 80% of a Claude window, a quota card offers (Q17, D5, D17):
  1. compact the Monarch and continue (suggested)
  2. hand the lead to codex-astra
  3. Sonnet, which shares the 5-hour window
  4. pause until the reset
- **LIM-3** The cold-wake card appears in the cases SESS-1 lists, and before `compact --deep` on a cold soldier. It shows the estimated re-read size (Q13). The options are: resume, fresh plus digest (suggested), or cancel. Before M4 it appears as a plain card.
- **LIM-4** A vendor limit error sets the task's status to `limit` and shows `⏸` until the reset. Nothing retries in a loop.
- **LIM-5** **Quota gate** in `authorize()`: a soldier whose vendor is at or above 90% of a window is skipped for routine work. Hard work needs a quota-gate card.

## 15. Safety (SAFE, GIT, GUARD, POL)

- **SAFE-1** v1's invariants hold under chat: claims, the audit, leases, the hard rules, and delegate entries that only restrict.
- **SAFE-2** `lead-prompt.md` states that soldier text is data, never your authority.
- **SAFE-3** **Full-autonomy notice and auto-approve** (D10, D14).
  - A `full` soldier's first wake in a chat posts a notice, not a card: it runs with your account's rights and no vendor prompts, and Shadow Army detects changes outside its workspace but cannot prevent them.
  - `/auto-approve writes on`, or the `auto` mode (KEY-7), stays on until you turn it off, including across `--resume`. The footer shows it, and turning it on posts a notice.
  - It covers every write approval: soldier writes, direct writes (→M8), lead tasks (→M10) and execution-bearing paths, including the apply-review card for mode, `.gitmodules` and `.gitattributes` changes.
  - It never covers:
    - hard-denied claims (POL-3)
    - an apply that adds or retargets a symlink or gitlink, which still needs the typed `yes` (WS-8)
    - any card that is not a write approval: attribution, policy trust, quota, quota gate, cold wake, memory, resume and git metadata
  - Only the typed command or the Shift+Tab mode key toggles it; pasted text never does.
- **SAFE-4** The source zip stays out of the repository folder. It was removed on 2026-10-04, and the reference copy is in `~/Downloads`. From M6, `sa doctor` warns if one reappears (DOC-1, →M6).
- **SAFE-5** A single `authorize(principal, soldier, role, mode, claims, autonomy, quota)` serves every entry point.
- **SAFE-6** A single `redact()` runs on every write to logs, events, briefs, reports and fixtures. Logs are pruned after 30 days.
- **SAFE-7** Every model, vendor and config string shown in the UI is stripped of C0 and C1 controls (except newline and tab) and of ESC, CSI and OSC sequences.
- **SAFE-8** **Link-safe deletion, everywhere, v1 included** (F42). To delete a workspace or snapshot, the harness:
  1. walks it with `lstat` and unlinks every symlink and junction without following it
  2. deletes it with Node `fs.rm`
  3. deletes its own record, `worktrees/<name>` in the git common dir, after checking that the record's `gitdir` file names this workspace

  It never uses `git worktree remove --force` on a populated tree, and never runs `git worktree prune`, which would also drop the records of your other worktrees whose folders are missing. The v1 call sites (`worktree.ts`, `session.ts`, `integration.ts`) are fixed by #36 (draft PR #37, milestone M0a).
- **SAFE-9** **Link walk before every harness git command** (F37). Before any harness git command in a workspace or snapshot (reset, checkout, add, commit, rm, status, diff, apply):
  - Every symlink and junction outside the keep folders is unlinked, except base entries of mode 120000 whose target is unchanged.
  - A link used as a folder on the path to a tracked path fails the wake as `link-escape`, and you are told.
  - Before any harness write, delete or revert by path, each component of the path is checked with `lstat`, keep folders included, and a link component refuses the operation. Node's `fs.rm` follows a link that is a folder on the path, so the check always comes first.
- **SAFE-10** Autonomy only chooses each vendor's flags. Shadow Army never removes a vendor safeguard, and may add restrictions.
- **SAFE-11** **No soldier code runs during harness git.** On Windows, each soldier turn runs in a kill-on-close Job Object; on POSIX, in its own process group. The whole group is killed at the end of the turn, before any harness git touches that workspace. Vendor daemons outside the group (F34) are a stated residual risk [S12]. **Fallback:** SOLD-4's tree walk plus a survivor check that blocks harness git while any survivor is alive.
- **SAFE-12** **v1's claim audit never writes or deletes through a link** (F42). Before the audit, the write session unlinks the links the soldier left, keeping links the base tracks. `revertPaths` refuses any path that passes through a link, and the report names the links removed. This is implemented by #36 (draft PR #37).
- **GIT-1** Every harness git command includes `-c core.hooksPath=<empty runtime dir> -c core.fsmonitor=false -c core.pager=cat -c diff.external= -c diff.ignoreSubmodules=dirty -c format.pretty=medium -c commit.gpgSign=false -c tag.gpgSign=false -c log.showSignature=false --no-optional-locks`, with `GIT_TERMINAL_PROMPT=0`, so no hook, monitor, pager, signing or verification program runs. `diff.ignoreSubmodules=dirty` also keeps `status`, `diff` and `commit` from starting git inside a nested repository, whose config a soldier controls; a changed gitlink is still reported. Diffs add `--no-ext-diff --no-textconv`. At chat start, the harness records `<gitdir>` and `<common>` from `git rev-parse --path-format=absolute --git-dir --git-common-dir`; in a linked worktree or a submodule, `<repo>/.git` is a file, not a folder. After that, harness git never discovers its repository. It passes `--git-dir=<gitdir> --work-tree=<repo>` in your checkout, and `--git-dir=<common>/worktrees/<name> --work-tree=<workspace>` in a workspace or snapshot, where `<name>` is recorded when the workspace is created. A rewritten `.git` file therefore cannot redirect it. Each workspace's `gitdir:` line is checked before every command, and a mismatch blocks harness git (GIT-3, →M2). In GIT-3 and GUARD-2 (→M5), `.git/` means `<common>/`.
- **GIT-2** **Pinned config.** At chat start, the harness reads your effective `core.autocrlf`, `core.eol`, `core.safecrlf`, `core.symlinks`, `core.ignorecase` and `filter.*` settings and passes them explicitly with `-c`.
- **GIT-3** **Metadata check.** Before every harness git command, the harness compares the config and metadata git will read with a baseline, taken at chat start or when the workspace is created:
  - the effective config for that git dir, from `git config --list --show-scope`: every scope except the command line, with includes followed. This covers system config (with `%PROGRAMDATA%\Git\config` on Windows), global config, `.git/config` and any `config.worktree`. Changes to `branch.*` and `remote.*`, such as `git push -u` makes, don't count.
  - `.git/info/**`
  - `.git/worktrees/<n>/{gitdir,commondir,config.worktree}`
  - each workspace's `.git` file

  A workspace's `HEAD` is checked against the commit the harness expects, not hashed. Any other change blocks harness git (F45). The check runs again after each command, so a change made while the command ran is reported too. Before M5, a plain git-metadata card asks you to attribute it; from M5, the git-metadata card works as GUARD-4 does (→M5).
- **GIT-4** Harness commits use `--no-verify` and v1's identity flags.
- **GUARD-1** Hashes are batched (`git hash-object --stdin-paths`), with no 500-file cap. Over `guard.maxDirty` (20,000) dirty files, wakes are refused.
- **GUARD-2** The **sentinel set**, hashed even when ignored:
  - `.git/config`, `.git/hooks/**`, `.git/info/**` and `.git/worktrees/**` metadata, where `.git/` is `<common>/` (GIT-1), and your checkout's `.git` when it is a file
  - `.githooks/**`, `.claude/**`, `.mcp.json` and `.env*`
  - `AGENTS.md`, `CLAUDE.md` and the policy files
  - `.github/workflows/**`
  - global git config and vendor home configs
  - MEM-2 fallback directories (→M7)
- **GUARD-3** **The repository mutex** is cross-process. It lives in `<runtime>/repo.lock`, with a fencing token, and is never stolen while its holder is alive (pid plus process start time). It serializes state capture, base builds, applies, undos and ref updates. Applies and undos are journaled with path, post-hash and index entry. The journal extends #32's ledger: it adds each file's post-apply hash, is written before the apply (write-ahead), and moves from `.shadow/applied.jsonl` to the runtime directory. It is subtracted hash-exactly before attribution, in v1's `summon` and `run` as well.
- **GUARD-4** **Attribution card** (D7e). Changes outside the workspaces during a turn appear with:
  - for each path: the change, line counts, a diff on `v`, and the time
  - for each ref: old → new

  The card defaults to No. Sentinel and execution-bearing paths need `yes` typed out. Overlapping turns share one card. `y` re-baselines only the hashes shown, and `n` fails the turns with revert commands. Without a TTY, the turn fails.
- **GUARD-5** **One open chat per folder** (D11), through `<runtime>/chat.lock`, which holds a pid and a heartbeat and goes stale after 30 s. A second `sa` in the same folder exits with a message naming the open chat. While the lock is held, v1 write commands refuse.
- **GUARD-6** The guard exempts `refs/shadow-army/**` refs whose oids match `chat.json` (F38). Any other change to them is a finding.
- **POL-1** **Policy pinning** (D9). `shadow.config.json`, `orchestratorDelegate.md`, `rules.md`, `agent.md`, `CLAUDE.md` and `AGENTS.md` are hashed at chat start. A repository-local file that differs from the last trusted hash shows a policy-trust card. A change during the chat shows the card and pauses wakes.
- **POL-2** A repository-local config raises autonomy above supervised only through that card.
- **POL-3** Claims on `.git/**` and `.shadow/**` are hard-denied. Execution-bearing paths need typed confirmation: `.githooks/**`, `.github/workflows/**`, `.claude/**`, `.mcp.json`, the policy files, and `package.json`.
- **TRACE-1** `scripts/check-spec-trace.mjs` runs in CI and checks the spec as Appendix B describes.

## 16. Configuration and compatibility (CFG)

```yaml
monarch: { default: claude-opus, fallback: codex-astra }               # CFG-2, M1b
soldiers:
  claude-sonnet:     { roles: [orchestrate, build], cost: 1 }           # CFG-8, M9
  codex-astra:       { roles: [orchestrate, review], cost: 3 }          # CFG-9, M10
  claude-opus-build: { roles: [build], buildFor: [hard], cost: 3 }      # CFG-9, M10
```

- **CFG-1** The `shadow.config.json` schema becomes strict. It defines every 2.0 key, with defaults, from M1b.
- **CFG-2** The Monarch changes to claude-opus, with codex-astra as fallback.
- **CFG-3** New optional keys:
  - `chat`: `maxConcurrentWakes`, `subagentCap`, `coldWakeGuardTokens`, `reportMaxChars`, `checkIn`, `wakeCeiling`, `keepIgnored`, `baseMaxUntrackedBytes`, `sessionPolicy`, `resumeMaxTokens`, `maxCeiling` (defaults: `sessionPolicy` `smart`, `resumeMaxTokens` 100000, `coldWakeGuardTokens` 100000, `maxCeiling` 200000)
  - `lead`: `effort`, `autoCompactAt`, `maxCallsPerTurn`
  - `guard`: `maxDirty`
  - per soldier: `shadowName`, `contextWindow`, `usableWindow`, `cacheTtlSeconds`, `color`
  - top level: `statusWords`
- **CFG-4** Default shadow names:

  | Soldier | Shadow name |
  |---|---|
  | codex-astra | Bellion |
  | codex-sol | Igris |
  | claude-opus | Kaisel |
  | claude-opus-build | Tank |
  | claude-sonnet | Iron |
  | grok | Beru |
  | agy | Tusk |

- **CFG-5** v1 commands keep their flags and behavior, except:
  - `sa run` plans with the configured Monarch
  - write commands refuse under the chat lock
  - plain `sa` opens the chat
  - the schema is strict
  - git is hardened
  - deletions are link-safe
  - applies are journaled
  - Node ≥22 is required
- **CFG-7** `engines.node` becomes `>=22`.
- **CFG-8** claude-sonnet gains the orchestrate role.
- **CFG-9** A new `claude-opus-build` soldier, and codex-astra gains the review role.

## 17. Non-functional requirements (NFR, DOC)

- **NFR-1** **Keystroke echo**: p95 under 50 ms over 500 keystrokes, while the Monarch and 3 soldiers stream 30 events/s, measured on windows-latest. Input renders bypass the frame throttle, and stream renders are capped at 30 fps.
- **NFR-2** The transcript keeps at most 200 rendered messages. Views are released when closed. Each soldier's buffer holds at most 50 messages.
- **NFR-3** From process start to the first prompt frame takes at most 2 s, measured by a PTY test.
- **NFR-5** No state is shown by color alone, and reduced motion is supported.
- **DOC-1** `sa doctor` reports:
  - for each CLI: its version against the fixture range, its login mode, `AGENTS.md` loading, prefix tokens with `--tokens`, and vendor daemons
  - an OS-isolation warning for `full` soldiers
  - mouse support, the Node version, and the zip still being in the repository

## 18. Milestones

**Build order:** M0 → M0a → M1a → M1b → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11.
- M0a is the v1 junction fix (#36, draft PR #37).
- M3 needs PR #31 merged first, and M5 needs PR #35 merged first (§0.3).
- Issues carry the Implements and Evidence lists as well as the ACs.
- Each milestone is one issue and one PR, based on the previous milestone's branch (M0 on `main`).
- Each maps to the feature template: Goal, ACs, Out of scope, then the handoff block.
- M1a–M4 are Q24's thin slice: a usable Ink chat with the Opus Monarch and claude-sonnet. M5 adds writes.

**Evidence classes:**

| Class | Meaning |
|---|---|
| `unit` | vitest |
| `fixture` | vitest against recorded CLI output |
| `pty` | PTY harness in CI on windows-latest |
| `integration` | CI with real git, fake CLIs and, where named, the pinned real `claude` binary against a fake Messages server (placeholder key, no vendor login) |
| `live` | Run by the owner with real CLIs and logins; costs quota; results recorded in the PR |
| `walkthrough` | The owner by hand on Windows Terminal, recorded in the PR |

**Acceptance.** An issue is accepted when every ID in its Implements line passes its evidence check (the PR maps each ID to its test or record), every AC passes, and the definition of done holds. §20 maps each owner decision to the AC that proves it.

**Definition of done (every milestone):**
- `npm run build`, `npx tsc --noEmit` and `npm test` pass.
- CI passes on ubuntu, macos and windows.
- A Windows walkthrough is recorded.
- The README, `CLAUDE.md`, delegate prose and ADR statuses are updated for any rule the milestone changes.
- TRACE-1 passes, from M1a, which adds it. For M0 and M0a, its rules are checked by hand.
- POSIX is reported as unverified by hand unless tested.

### M0: Spikes (Q25)

**Goal:** confirm every unverified fact before the code that depends on it.

**Out of scope:** product code.

M0 runs in a scratch repository. Every command is shown before it runs, and it takes about 30 tiny calls. Results become redacted fixtures. Checks that need `full` autonomy (S5's claude `full` launch, S12) are run by the owner, as `CLAUDE.md` requires.

| ID | Question | Pass means | On fail | Gates |
|---|---|---|---|---|
| S1 | The Monarch's protocol: multi-turn stdin; uuid and replay; priority; state events; the interrupt receipt; `get_context_usage`; `mcp_status`; `set_model` keeping history; `--append-system-prompt-file`; the env flags in LEADRT-1 | Behaves as F20 describes | Each requirement's fallback | M1a |
| S2 | HTTP MCP with the `${SA_ARMY_SESSION}` header and session replacement | Works, and the token is never on disk | The stdio fallback | M1a |
| S3 | The CONF-6 suite with the pinned binary and a fake server, and which instruction files load | All denials hold, and the positive control passes | Block M1a | M1a |
| S9 | `--effort`, `--autocompact` and `/compact <instructions>`, headless | Take effect | A handoff restart | M1a |
| S12 | Job Object kill-on-close from Node (native helper), the codex sandbox service, and the grok leader | No survivors | The SOLD-4 fallback and a survivor block | M2 |
| S5 | Each CLI as a soldier: auth under lean launch (claude `full` with `--setting-sources ""`; codex with `windows.sandbox`); tool names per OS; usage semantics; subagent and compaction events; resume; memory switches; windows | A table and fixtures per CLI | The SOLD-2 and SOLD-7 fallbacks | M2 (claude), M6 (others) |
| S8 | Windows Terminal: KEY-4, the mouse, Shift+drag, glyphs, render cost | All work | The KEY-4 and UX-5 fallbacks | M3 |
| S11 | Base timing, and CRLF fidelity under GIT-2 | WS-11 met; blobs equal the index blobs | The incremental base | M5 |
| S4 | Quota signals per vendor | Found, or confirmed absent | Estimates only | M6 |
| S6 | codex resume with the parent `-s`/`-C` options | A read-only resume cannot write | Two sessions | M6 |
| S7 | Instruction-file loading in a worktree | A table | `AGENTS.md` inlined | M6 |
| S10 | codex as the Monarch, read-only | Works | Claude models only | M9 |

- **M0-AC1** Every spike has a recorded result and evidence, and §4 and every dependent requirement are updated (covers spikes S1–S12; evidence: findings note).
- **M0-AC2** Fixtures pass the redaction scan (covers fixture redaction; evidence: CI).

### M0a: v1 link-safety fix (#36)

**Goal:** v1 never follows a link when it removes a worktree or reverts out-of-claim edits (O1). This is tracked as issue #36, with draft PR #37.

**Out of scope:** 2.0's link walk before every harness git command (SAFE-9) and the per-turn Job Object (SAFE-11).

**Implements:** SAFE-8, SAFE-12

**Evidence:**
- **integration:** SAFE-8, SAFE-12

**ACs:**
- **M0a-AC1** Removing a snapshot or soldier worktree whose tracked folder was replaced by a junction leaves the target intact. It also leaves the records of your other worktrees alone, even one whose folder is missing (covers SAFE-8).
- **M0a-AC2** The claim audit's revert refuses a path through a link, and the report names the removed links (covers SAFE-12).

### M1a: Monarch runtime, confinement and safe git

**Goal:** a confined Monarch process, the control plane, and hardened git.

**Out of scope:** the chat UI and soldiers.

**Implements:** ARCH-1, ARCH-2, ARCH-3, ARCH-4, LEADRT-1, LEADRT-2, LEADRT-3, LEADRT-4, LEADRT-5, LEADRT-6, LEADRT-7, LEADRT-8, LEADRT-9, LEADRT-10, LEADRT-11, LEADRT-12, CONF-1, CONF-2, CONF-3, CONF-4, CONF-5, CONF-6, CONF-8, MCP-1, MCP-2, MCP-3, GIT-1, GIT-2, SAFE-2, SAFE-5, SAFE-6, SAFE-7, TRACE-1

**Evidence:**
- **unit:** ARCH-1, ARCH-4, LEADRT-3, LEADRT-4, LEADRT-5, LEADRT-7, LEADRT-8, LEADRT-11, LEADRT-12, MCP-1, MCP-2, MCP-3, GIT-1, GIT-2, SAFE-2, SAFE-5, SAFE-6, SAFE-7, TRACE-1
- **fixture:** LEADRT-1, LEADRT-2, LEADRT-6, LEADRT-9, ARCH-2, ARCH-3
- **integration:** CONF-1, CONF-2, CONF-3, CONF-5, CONF-6
- **live:** CONF-4, CONF-8, LEADRT-10

**ACs:**
- **M1a-AC1** The CONF-6 suite passes in CI, including the positive control, and `git_read` refuses `--output`, `--full-diff` and secret paths. It never shows a `.env` that was committed and later deleted, nor an upper-case `.ENV` (covers CONF-1, CONF-2, CONF-3, CONF-6, MCP-3).
- **M1a-AC2** The Monarch is launched with `--effort high` and `--autocompact 200000` (D4) (covers LEADRT-1).
- **M1a-AC3** No file holds the token, and a token-less request is rejected (covers ARCH-2, ARCH-3).
- **M1a-AC4** With `ANTHROPIC_API_KEY` set in your shell, the Monarch still starts on your subscription, and `claude auth status` gating refuses an API-key-only login (covers ARCH-4, LEADRT-10).
- **M1a-AC5** A crash mid-turn restarts the Monarch and re-sends unacknowledged input once; a 4th crash in 60 s shows the restart card (covers LEADRT-3, LEADRT-7).

### M1b: Plain chat, commands, config and ledger

**Goal:** a usable plain-mode chat with the Opus Monarch.

**Out of scope:** soldiers and the Ink UI.

**Implements:** PLAIN-1, PLAIN-2, PLAIN-3, PLAIN-4, CMD-1, CMD-2, CMD-3, CMD-4, CMD-5, CMD-6, CMD-8, PROMPT-8, CFG-1, CFG-2, CFG-3, CFG-4, CFG-5, CFG-7, LEDGER-1, LEDGER-2, LEDGER-3, ORCH-1, ORCH-2, ORCH-3, ORCH-4, ORCH-5, ORCH-6, LEAD-1, LEAD-8, EFF-6, EFF-7, EFF-10, EFF-12

**Evidence:**
- **unit:** PLAIN-2, PLAIN-3, CMD-1, CMD-2, CMD-3, CMD-4, CMD-5, CMD-6, CMD-8, PROMPT-8, CFG-1, CFG-2, CFG-3, CFG-4, CFG-5, CFG-7, LEDGER-1, LEDGER-2, LEDGER-3, ORCH-1, ORCH-2, ORCH-3, ORCH-4, ORCH-5, ORCH-6, LEAD-1, LEAD-8, EFF-6, EFF-7, EFF-10
- **fixture:** PLAIN-1, PLAIN-4
- **live:** EFF-12

**ACs:**
- **M1b-AC1** `sa --plain --once "hello"` answers after readiness (covers PLAIN-4).
- **M1b-AC2** A config with an unknown key is rejected, and every CFG-3 key has a default (covers CFG-1, CFG-3).
- **M1b-AC3** The Monarch's first-turn prefix is at most 20k tokens (covers EFF-12).

### M2: Soldier runtime (claude) and wakes

**Goal:** the Monarch wakes claude-sonnet for read tasks, with sessions, check-ins and ceiling stops, updates, the ledger and process control.

**Out of scope:** writes, other CLIs, the Ink UI and memory. Read wakes run in snapshots at HEAD.

**Implements:** SOLD-1, SOLD-2, SOLD-4, SOLD-6, SOLD-8, WAKE-1, WAKE-2, WAKE-3, WAKE-4, WAKE-5, WAKE-6, WAKE-7, WAKE-9, WAKE-10, WAKE-11, WAKE-15, UPD-1, UPD-2, UPD-3, UPD-4, MCP-4, MCP-5, CMD-7, LEDGER-4, LEDGER-6, SESS-1, SESS-2, SESS-4, SESS-5, SESS-7, LIM-3, GIT-3, SAFE-9, SAFE-10, SAFE-11, EFF-1, EFF-2

**Evidence:**
- **unit:** WAKE-1, WAKE-2, WAKE-3, WAKE-4, WAKE-5, WAKE-6, WAKE-7, WAKE-10, UPD-1, UPD-2, UPD-3, UPD-4, MCP-4, MCP-5, CMD-7, LEDGER-6, SESS-1, SESS-2, SESS-4, SESS-5, SESS-7, LIM-3, SAFE-10, EFF-1, EFF-2
- **fixture:** SOLD-1, SOLD-6, SOLD-8, WAKE-9, WAKE-11, WAKE-15, LEDGER-4
- **integration:** SOLD-4, GIT-3, SAFE-9, SAFE-11
- **live:** SOLD-2

**ACs:**
- **M2-AC1** One read wake produces one update, and its logged brief has no chat text (covers WAKE-3, UPD-1, EFF-2).
- **M2-AC2** SESS-1's table holds under a fake clock. In `keep`, a cold session at or above 100k shows the cold-wake card (Q13) (covers SESS-1, LIM-3).
- **M2-AC3** A report containing `</army-update` and ANSI escapes arrives inert (covers UPD-1, UPD-2).
- **M2-AC4** Check-ins and the ceiling behave as specified (covers WAKE-9, WAKE-15, WAKE-11, MCP-5):
  - three identical calls send a `next`-priority check-in
  - a long run sends check-ins at 30 calls and 15 minutes without being stopped, while the Monarch does nothing
  - the 80% check-in arrives even within 5 minutes of the last one, and after `extend` the run passes the old ceiling
  - the safety ceiling stops it with status `ceiling`, and nothing is applied
  - a 4th subagent start stops the turn
- **M2-AC5** At the end of a turn, no soldier process survives. A changed `.git/config` stops harness git, including a planted `gpg.program` with `commit.gpgSign`, which never runs. Neither does the `filter.*.clean` of a nested repository a soldier creates at a gitlink path. A rewritten `.git` file does not redirect harness git, also when your checkout is a linked worktree (covers SAFE-11, GIT-1, GIT-3).

### M3: Ink shell

**Goal:** the screen you live in, reworked from #30's chat (§0.3).

**Out of scope:** cards and the roster (M4), the tree and views (M8).

**Prerequisite:** PR #31 (#30's chat) merged.

**Implements:** UX-1, UX-2, UX-3, UX-4, UX-5, UX-6, UX-7, UX-8, UX-9, KEY-3, KEY-4, KEY-6, PROMPT-1, PROMPT-2, PROMPT-3, PROMPT-4, PROMPT-5, PROMPT-6, CHAT-1, CHAT-2, CHAT-3, NFR-1, NFR-2, NFR-3, NFR-5

**Evidence:**
- **unit:** UX-8, UX-9
- **pty:** UX-1, UX-2, UX-3, UX-4, UX-6, UX-7, KEY-3, KEY-6, PROMPT-1, PROMPT-2, PROMPT-3, PROMPT-5, PROMPT-6, CHAT-1, CHAT-2, CHAT-3, NFR-1, NFR-2, NFR-3, NFR-5
- **walkthrough:** UX-5, KEY-4, PROMPT-4

**ACs:**
- **M3-AC1** Golden frames at 60, 80, 110 and 160 columns show the transcript, prompt and footer at each width, and every soldier mention shows its model (Q8) (covers UX-4, UX-9).
- **M3-AC2** The NFR-1 p95 and NFR-3 are met (covers NFR-1, NFR-3).
- **M3-AC3** Esc interrupts the Monarch, a double Esc clears the draft, and the ctrl+c ladder works (covers KEY-3, KEY-6).

### M4: Cards, attention and roster

**Goal:** decisions that never steal keystrokes, and a roster of the whole army.

**Out of scope:** card kinds owned by later milestones.

**Implements:** CARD-1, CARD-2, CARD-3, CARD-4, CARD-5, CARD-6, CARD-7, CARD-8, ATTN-1, ATTN-2, ATTN-3, ROS-1, ROS-2, ROS-3, ROS-4, ROS-5, ROS-6, ROS-7, CTX-1, KEY-1, KEY-7, CHAT-4

**Evidence:**
- **unit:** CARD-3, CARD-4, CARD-5, CARD-6, CARD-7, CARD-8, ROS-1, ROS-5, ROS-7, CTX-1
- **pty:** CARD-1, CARD-2, ATTN-1, ATTN-2, ATTN-3, ROS-2, ROS-3, ROS-4, ROS-6, KEY-1, KEY-7, CHAT-4

**ACs:**
- **M4-AC1** A card never takes keystrokes while you type, and `Enter` never approves. A three-option card, such as the quit card (CHAT-4), is answered with `2` (covers CARD-1, CARD-2).
- **M4-AC2** Glyph-only golden frames at 60, 80, 110 and 160 columns show the roster as UX-4 sets out: at 110 and 160 every soldier's state is distinct, and at 60 and 80 the strip shows the Monarch and every awake or waiting soldier. Status words rotate (Q5) (covers ROS-2, ROS-3, ROS-5).

### M5: Workspaces, base, apply, undo and guard

**Goal:** write wakes that are safe and undoable, and that see your working state. Builds on #32 (§0.3).

**Out of scope:** CLIs other than claude.

**Prerequisite:** PR #35 (#32's snapshot, ledger and undo) merged.

**Implements:** WS-1, WS-2, WS-3, WS-4, WS-5, WS-6, WS-7, WS-8, WS-9, WS-10, WS-11, WS-12, SESS-8, GIT-4, GUARD-1, GUARD-2, GUARD-3, GUARD-4, GUARD-5, GUARD-6, POL-1, POL-2, POL-3, SAFE-1, SAFE-4, WAKE-8

**Evidence:**
- **unit:** WS-4, WS-10, SESS-8, POL-2, POL-3, SAFE-1, WAKE-8
- **integration:** WS-1, WS-2, WS-3, WS-5, WS-6, WS-7, WS-8, WS-9, WS-12, GIT-4, GUARD-1, GUARD-2, GUARD-3, GUARD-4, GUARD-5, GUARD-6, POL-1
- **fixture:** WS-11
- **walkthrough:** SAFE-4

**ACs:**
- **M5-AC1** The base excludes `.shadow/`, a 37 MB file and `.env`, and `push --all` sends no `refs/shadow-army` refs (covers WS-5, WS-6).
- **M5-AC2** A fix wake sees the soldier's applied, uncommitted work, and a CRLF file round-trips unchanged (covers WS-5, WS-7).
- **M5-AC3** A cancelled or ceiling-stopped write is not applied on its own. Continued with `continueFrom`, a ceiling-stopped write and its continuation apply as one change from the original base, and `continueFrom` on a cancelled or applied task is refused. Apply refuses everything when any file changed since the base, and `/undo` keeps your edit in another hunk (covers WS-6, WS-7, WS-8, WS-9, SESS-8).
- **M5-AC4** A write card approval (Q19) gates the apply (covers WAKE-8).
- **M5-AC5** Your edit during a turn raises one shared attribution card, while our refs, our undo and our applies raise none (covers GUARD-3, GUARD-4, GUARD-6).
- **M5-AC6** `sa summon --write` refuses under the chat lock, and a second `sa` in the folder exits naming the open chat (D11) (covers GUARD-5).
- **M5-AC7** Changing `rules.md` mid-chat pauses wakes and shows the policy-trust card (D9) (covers POL-1, POL-2).
- **M5-AC8** An apply that fails partway (on Windows, a file held open by another process) leaves your checkout byte-identical to before and names the files. So does an undo that fails partway, keeping your edits in other hunks (covers WS-8, WS-9).

### M6: The whole army

**Goal:** codex, grok and agy as soldiers, with quota visibility and the full-autonomy notice.

**Out of scope:** memory.

**Implements:** SOLD-3, SOLD-5, SOLD-7, LEDGER-5, SESS-6, CTX-2, LIM-1, LIM-4, LIM-5, SAFE-3, DOC-1, EFF-5

**Evidence:**
- **fixture:** LEDGER-5, CTX-2, LIM-1, LIM-4
- **unit:** LIM-5, SAFE-3
- **live:** SOLD-3, SOLD-5, SOLD-7, SESS-6, DOC-1, EFF-5

**ACs:**
- **M6-AC1** Each CLI completes a read wake and a second wake, and a 30,000-character brief reaches agy (covers SOLD-7).
- **M6-AC2** Full autonomy and auto-approve behave as decided (covers SAFE-3):
  - a `full` soldier's first wake shows the full-autonomy notice without blocking (D10)
  - with auto-approve on, a soldier write to `package.json` applies without a card, and the setting persists across `--resume` (D14). Direct writes are checked in M8-AC2.
  - a hard-denied claim is still refused, and an added symlink still asks for a typed `yes`
- **M6-AC3** The roster shows codex's quota, and the 90% gate skips codex for routine work (covers LIM-1, LIM-5).

### M7: Army memory

**Goal:** tell the army once (Q6, Q10, Q14, Q15).

**Out of scope:** writing `AGENTS.md`.

**Implements:** MEM-1, MEM-2, MEM-3, MEM-4, MEM-5, MEM-6, MEM-7, MEM-8, MEM-9, MEM-10, MEM-11, MEM-12, MEM-13, MCP-6

**Evidence:**
- **unit:** MEM-1, MEM-3, MEM-4, MEM-6, MEM-7, MEM-8, MEM-9, MEM-11, MEM-12, MEM-13, MCP-6
- **integration:** MEM-5
- **live:** MEM-2, MEM-10

**ACs:**
- **M7-AC1** `remember` stores an entry with provenance and announces it (covers MEM-1).
- **M7-AC2** A soldier-derived entry is never primed before approval (covers MEM-3).
- **M7-AC3** A file edited outside `remember` is quarantined (covers MEM-4).
- **M7-AC4** Live: no CLI process touches your everyday memory directories (covers MEM-2).
- **M7-AC5** One fact saved with `remember` reaches claude, codex, grok and agy once each: it is in each one's next brief, and in none of its later briefs in that session (covers MEM-5, MEM-6).

### M8: Live tree, soldier views and direct chat

**Goal:** see the army work, open any soldier, and talk to it.

**Out of scope:** messaging subagents (VIEW-5).

**Implements:** TREE-1, TREE-2, TREE-3, TREE-4, TREE-5, TREE-6, TREE-7, TREE-8, VIEW-1, VIEW-2, VIEW-3, VIEW-4, VIEW-5, VIEW-6, PROMPT-7, KEY-2, ORCH-7, WAKE-12, WAKE-13

**Evidence:**
- **pty:** TREE-1, TREE-3, TREE-4, TREE-5, TREE-7, TREE-8, VIEW-1, VIEW-2, PROMPT-7, KEY-2
- **unit:** TREE-2, VIEW-3, VIEW-4, VIEW-5, ORCH-7, WAKE-12, WAKE-13
- **fixture:** TREE-6, VIEW-6

**ACs:**
- **M8-AC1** Soldiers animate with live tokens, two subagents show as branches that fold when done, and a click or `→`/`←` toggles them (covers TREE-3, TREE-4).
- **M8-AC2** A view shows the soldier's chat. Typing there sends a direct turn: a write-capable soldier shows a write card first, and with auto-approve on, a direct write to `package.json` applies without one (D14). agy runs read-only. Its VIEW-4 line reaches the Monarch with no model call (covers VIEW-2, VIEW-3, VIEW-4, SAFE-3).
- **M8-AC3** The full Esc ladder never stops a soldier (covers KEY-2).
- **M8-AC4** `wake(after)` waits for its predecessor and cancels with it (covers ORCH-7).

### M9: Sessions, compaction and quota

**Goal:** Q9, Q16 and Q17 as decided, plus measured efficiency.

**Out of scope:** lead tasks.

**Implements:** SESS-3, CTX-3, CTX-4, CTX-5, CMP-1, CMP-2, CMP-3, CMP-4, CMP-5, LIM-2, LEAD-6, LEAD-7, LEAD-9, LEAD-10, WAKE-14, MCP-7, CFG-8, EFF-3, EFF-4, EFF-8, EFF-9, EFF-11

**Evidence:**
- **unit:** SESS-3, CTX-3, CTX-4, CTX-5, CMP-1, CMP-2, CMP-4, LIM-2, LEAD-6, LEAD-9, MCP-7, CFG-8
- **fixture:** CMP-3, CMP-5, LEAD-7, LEAD-10, WAKE-14
- **integration:** EFF-3, EFF-8, EFF-9
- **live:** EFF-4, EFF-11

**ACs:**
- **M9-AC1** Notices appear at 30, 50 and 70% of the ceiling. At 90%, either the Monarch extends the ceiling (up to 200k, D1), or a warm soldier writes a summary after its task and continues primed in a new session; a cold one gets a digest (Q9). `compact <shadow name>` compacts that soldier by hand (covers CTX-3, CTX-5, CMP-2, CMP-3, CMD-2).
- **M9-AC2** In a fixture with vendor compaction at 85%, Shadow compaction runs first (Q16) (covers CMP-4).
- **M9-AC3** The 80% card offers the four options in order (Q17), and `/switch` works. `/switch codex-astra` starts a codex lead from a handoff, launched with codex's read-only sandbox (D13, D17) (covers LIM-2, LEAD-7).
- **M9-AC4** The reference chat passes the EFF-8 gate (covers EFF-3, EFF-8, EFF-9).
- **M9-AC5** Resuming a chat whose Monarch is cold, at 100k or more, shows the resume card with both costs and the handoff pre-selected (D15) (covers LEAD-9).

### M10: Lead tasks and reviews

**Goal:** the Monarch as reviewer and tiny-fix editor (Q18, Q18b).

**Out of scope:** a shell for the Monarch (D12).

**Implements:** LEAD-2, LEAD-3, LEAD-4, LEAD-5, LEAD-11, CONF-7, MCP-8, CFG-9

**Evidence:**
- **integration:** CONF-7, LEAD-4, LEAD-11
- **unit:** LEAD-2, LEAD-3, LEAD-5, MCP-8, CFG-9

**ACs:**
- **M10-AC1** A lead task edits only `<runtime>/lead/<chatId>`, and the CONF-6 edit cases are denied (covers CONF-7, LEAD-4).
- **M10-AC2** A 2-file lead change fails `too-large`, and the fix goes to claude-opus-build (covers LEAD-3).
- **M10-AC3** The Monarch's applied work is reviewed by codex-astra with a verdict; a large diff goes to a reviewer (covers LEAD-4, LEAD-5).
- **M10-AC4** The Monarch has no shell (Q18 as narrowed by D12) (covers LEAD-2).
- **M10-AC5** With auto-approve on, a lead task starts without a lead-task card (D14) (covers LEAD-4, SAFE-3).

### M11: Polish

**Goal:** custom keys and slash typeahead.

**Out of scope:** theme presets (N8).

**Implements:** KEY-5, PROMPT-9

**Evidence:**
- **pty:** KEY-5, PROMPT-9

**ACs:**
- **M11-AC1** The keybindings file rebinds and unbinds keys with hot reload, and `/` typeahead lists commands (covers KEY-5, PROMPT-9).

## 19. Risks and open questions

| Risk | Mitigation |
|---|---|
| `-p` becomes bare by default (F29) | LEADRT-10, ADR-0002, D17 |
| Vendor formats change | Fixtures, SOLD-6, DOC-1 |
| Pro quota pressure | D4, LIM, EFF |
| Headless behavior differs from the docs | M0 gates, plus fallbacks |
| A `full` soldier acts directly | Detected only (GUARD); a container is recommended |
| Vendor daemons outside the Job Object | SAFE-11 residual risk; doctor lists them |
| Memory poisoning | MEM-1, MEM-3, MEM-4, MEM-7 |
| Windows terminal quirks | S8, the keyboard path, ASCII |

**Open questions**

- **OQ2** grok's and agy's quota fields and windows (S4, S5).
- **OQ3** Whether Claude's 5-hour % is available headlessly (S4).

## 20. Decision log

| Q | Decision | Where | Proven by |
|---|---|---|---|
| Q1 | Own Ink chat; the zip is the reference design | ADR-0001, §5 | UX-8 (M3 unit) |
| Q2 | Terminal | UX | M3-AC1 |
| Q3 | The Monarch and you wake soldiers; codex-astra gives a second opinion | WAKE-1, WAKE-13 | M2 unit WAKE-1; M8 unit WAKE-13 |
| Q4 | Briefs only, with attachments | WAKE-3, PROMPT-8 | M2-AC1 |
| Q5 | Status words and shadow names | ROS-5, CFG-4 | M4-AC2 |
| Q6 | `AGENTS.md` plus memory | MEM-10 | M7 live MEM-10 |
| Q7 | Chat-linked sessions; fresh in a new chat; meters (D1) | SESS-1, CMD-4, CTX-1 | M2-AC2 |
| Q8 | Name and model always shown | UX-9 | M3-AC1 |
| Q9 | 30/50/70 warnings; summary at 90% after the task; `compact` | CTX-3, CMP | M9-AC1 |
| Q10, Q14, Q15 | Monarch-written memory in `.shadow/memory/`, hybrid layout (D3) | MEM | M7-AC1…AC4 |
| Q11 | The `claude` CLI on Pro, subscriptions only | ADR-0002, ARCH-4 | M1a-AC4 |
| Q12 | Opus leads | LEAD-1 | M1b unit LEAD-1 |
| Q13 | A card before a cold wake (D1 notes when) | LIM-3 | M2-AC2 |
| Q16 | Shadow compaction before the vendor's | CMP-4 | M9-AC2 |
| Q17, Q17b | 80% card; `/switch` (D5, D17) | LIM-2, LEAD-7 | M9-AC3 |
| Q18, Q18b | Orchestrator, reviewer and tiny fixes; codex-astra reviews (D2, D12, D18) | LEAD | M10-AC1…AC4 |
| Q19 | Write cards; `/auto-approve` (D14) | WAKE-8, SAFE-3 | M5-AC4, M6-AC2 |
| Q20, Q20b | Clickable collapsible tree (D6, D8) | TREE-4, UX-5 | M8-AC1 |
| Q21 | A one-line note for direct chats | VIEW-4 | M8-AC2 |
| Q22 | Subagents ≤3 | WAKE-11 | M2-AC4 |
| Q23 | `sa` opens the chat; v1 stays | CHAT-1, CFG-5 | M3 pty CHAT-1 |
| Q24 | Thin slice first | §18 | M1a–M4 |
| Q25 | Spikes first | M0 | M0-AC1 |
| Q26 | Issues and ADRs | §18 | definition of done |
| Also | Agent animations with tokens; zoom and chat; a tree of subagents | TREE, VIEW | M8-AC1, M8-AC2 |
| Also | Token efficiency | EFF | M9-AC4, EFF-11 |
| D1 | Smart sessions with a 100k base; the Monarch may extend to 200k | SESS-1, CTX-5 | M2-AC2, M9-AC1 |
| D2 | `claude-opus-build` takes the fixes the Monarch is unsure of | LEAD-3 | M10-AC2 |
| D3 | Memory through `remember`; soldier-learned facts wait for approval | MEM | M7-AC1…AC3 |
| D4 | The Monarch at high effort, compacting at 200k | LEADRT-1 | M1a-AC2 |
| D5 | The quota card suggests compacting first | LIM-2 | M9-AC3 |
| D6 | Mouse on | UX-5 | M3 walkthrough UX-5 |
| D7a | Direct turns can write, with a card | VIEW-3 | M8-AC2 |
| D7b | One turn at a time per soldier | WAKE-6 | M2 unit WAKE-6 |
| D7c | Chat memory separate from the Vault | MEM-11 | M7 unit MEM-11 |
| D7d | A digest when the soldier is cold | CMP-3 | M9-AC1 |
| D7e | The guard asks you | GUARD-4 | M5-AC5 |
| D7f | Start from your working state | WS-5 | M5-AC2 |
| D8 | Branches open while running | TREE-4 | M8-AC1 |
| D9 | Policy-trust card | POL-1 | M5-AC7 |
| D10 | A notice for `full` soldiers | SAFE-3 | M6-AC2 |
| D11 | A new chat per `sa`; `/resume`; one open chat per folder | CHAT-1, GUARD-5 | M3 pty CHAT-1, M5-AC6 |
| D12 | No shell for the Monarch | CONF-1 | M10-AC4 |
| D13 | A codex Monarch is read-only | LEAD-7 | M9-AC3 |
| D14 | Auto-approve persists and covers every write | SAFE-3 | M6-AC2, M8-AC2, M10-AC5 |
| D15 | A resume card for a cold Monarch | LEAD-9 | M9-AC5 |
| D16 | Check-ins and a safety ceiling | WAKE-9, WAKE-15 | M2-AC4 |
| D17 | The lead can be handed to codex | LEAD-7 | M9-AC3 |
| D18 | The Monarch reviews diffs up to 6k itself | LEAD-5 | M10-AC3 |
| O1 | The v1 link fix | SAFE-8, SAFE-12 | M0a-AC1, M0a-AC2 |
| O2 | Post to GitHub directly | §18 | #38, #40–#53 and PR #39 exist |
| O3 | Critique round 4 after the answers | Appendix A | Appendix A, round 4 |
| O4 | No zip in the repository; look in Downloads when stuck | SAFE-4, DOC-1 | M5 walkthrough SAFE-4; M6 live DOC-1 |
| O5 | The zip is the reference design | §5, ADR-0001 | The §5 parity table |

## 21. References

- Claude Code docs: headless, CLI reference, permissions, hooks, MCP, memory, status line, agent teams, fullscreen, keybindings, sandbox, authentication, tools reference, Agent SDK overview (code.claude.com/docs). codex, Antigravity and grok docs. Local `~/.grok/README.md`.
- The reference source zip (Claude Code v2.1.88; reference only). It is kept only at `~/Downloads/collection-claude-code-source-code-main.zip`; the repo copy was removed (O4). When stuck on how something should work or connect, look there first (O5). Shadow Army is the same idea, more ambitious.
- clawspring (Apache-2.0): a source of ideas.
- Repository: `src/core`, `src/workspace`, `src/adapters`, `src/vault`, `rules.md`, `agent.md`, `orchestratorDelegate.md`, `shadow.config.json`.
- ADRs 0001–0007.

---

## Appendix A. Review log

Critic findings are labelled `R<round>·<critic><n>` to avoid clashing with owner decisions D1–D18.

**Round 1** (critics A, B, C and D, plus parity maps P1–P3, about 70 findings): every finding was accepted, rejected with a reason, or put to the owner. These rejections still stand:
- `R1·B9`: a subagent cap of 0 (Q22 says 3)
- `R1·B6`: `--safe-mode` for soldiers (it breaks Q6)
- `R1·D1`: the mouse off by default (Q20)
- `R1·P2-1`: interactive Monarch approvals (`dontAsk` is the floor)

**Round 2** (gates E and Q, 1 critical and 17 high): fixed in v0.3, including traceability, the restored Q9/Q16 summary, junction and CRLF hardening, all-or-nothing apply, and the Monarch's allow and deny rules.

**Round 3**

| Finding | Disposition in v0.4 |
|---|---|
| R3·E1, Critical: junction defense incomplete; `worktree remove` follows links; survivors | SAFE-8 and SAFE-9 in M1a, covering v1's call sites; SAFE-11 Job Object per turn; GIT-3 metadata check; F37, F42, F45 |
| R3·E2, R3·Q8: lead workspace under the `.shadow/**` deny | LEAD-4 moves it to `<runtime>/lead/<chatId>`; CONF-3, CONF-7 |
| R3·E3: `TodoWrite` | Removed; per-OS lists come from S5 (SOLD-8, F43) |
| R3·E4: apply after a failed wake | WS-7 applies only after a clean `ok` |
| R3·E5: mutex gaps | GUARD-3 covers capture, base, apply, undo and refs; no stealing |
| R3·E6: readiness; connectors need a login | LEADRT-2 endpoint-observed readiness; CONF-6 in CI, CONF-8 live |
| R3·E7, R3·Q4: sessions before M5; smart policy cancelling Q9 | The SESS-1 table with a ceiling and the pre-M5 rule; SESS-8 compares against the tip; CTX-1 ceiling; D1 rewritten |
| R3·E8, R3·Q3: forward dependencies | Explicit `(→Mx)` marks; KEY-6 in M3; KEY-1, CHAT-4 in M4; KEY-2 in M8; WS-12 in M5; MCP-4 field gating; consent moved out of WAKE-8 |
| R3·E9, R3·Q10: overstated containment; ADR token name | Threat model "detected, not prevented"; §0.1; ADR-0005 fixed |
| R3·Q1: missing fields; M1 size; trace owner; ID clash | Every milestone has Goal and Out of scope; M1 split into M1a and M1b; TRACE-1; `R·` labels |
| R3·Q2: owner decisions without ACs | §20 "Proven by"; acceptance rule in §18 |
| R3·Q5: model dropped at 60–79 columns | UX-4, UX-9, and the definition of "model" |
| R3·Q6: Claude-only lead relaxed; review narrowed | D17, D18 |
| R3·Q7: handoff undefined | Glossary |
| R3·Q9: unmeasurable gate | EFF-3, EFF-11 split; EFF-8 absolute 0.9M and 4 bytes per token; EFF-12; LEDGER-6 in M2 |
| R3·Q11: §0.2 clarity | Split into changes and defaults; rewordings; F41 |
| R3·E (verification): `ANTHROPIC_API_KEY` precedence | ARCH-4 strips it; M1a-AC4 |

**Round 4** (gates E and Q, after the owner's decisions; 1 critical and 17 high): all were fixed in v0.6.

| Finding | Disposition |
|---|---|
| R4·E1, Critical: a rewritten workspace `.git` file redirects harness git | GIT-1: explicit `--git-dir`/`--work-tree`, plus the `gitdir:` check; GIT-3 covers the file |
| R4·E2: tracked symlinks; `fs.rm` through a link component | SAFE-9 keeps tracked links and checks every path component |
| R4·E3: GIT-3 false positives | Baseline per workspace, an expected HEAD, section-level config hashing, `%PROGRAMDATA%` |
| R4·E4, R4·Q2: auto-approve versus the mode key and apply-review | SAFE-3, KEY-7, WS-8 |
| R4·E5, R4·Q3: check-in timing; ceiling defaults | WAKE-9 bypasses UPD-3; WAKE-15 raised to 150 calls, 3M QU; `continueFrom` |
| R4·E6, R4·Q4: steering versus resets | MCP-5 continuation turns; agy does not steer mid-turn |
| R4·E7, R4·Q5: CTX-5 race and undefined terms | CTX-5 pending compaction; task line defined; CFG-3 defaults |
| R4·E8: writes before M5; lead tasks before M10 | MCP-4 refusals; M10-AC5 |
| R4·E9: #35's real ledger and undo | WS-9, GUARD-3 extend them (write-ahead, post-hash, runtime directory) |
| R4·Q1: O1 not reflected | M0a (#36, PR #37); SAFE-8 and SAFE-12 |
| R4·Q6: stale terms | M2, M6, LEDGER-6, §6.9, §19 |
| R4·Q7: decisions without ACs | §20 rows D1–D18 and O1; M1a-AC2, M5-AC7, M9-AC5, M10-AC5; M3-AC1 rescoped |
| R4·Q8: prerequisites | M3 needs PR #31; M5 needs PR #35 |
| R4·Q9: stale ADRs | ADR-0003 and ADR-0005 corrected |

**Round 5** (gate E, verifying v0.6; 5 high, no critical, plus one found while fixing): all were fixed in v0.7.

| Finding | Disposition |
|---|---|
| R5·1: `<repo>/.git` is a file in a linked worktree or a submodule, so `<repo>/.git/worktrees/<name>` does not exist | GIT-1 records `<gitdir>` and `<common>` and never discovers the repository; GIT-3 and GUARD-2 read `.git/` as `<common>/`; M2-AC5 |
| R5·2: `continueFrom` had no base, so a continued write dropped or refused its earlier work | WS-6 keeps the original base and applies `base..newTip` as one change; SESS-8; M5-AC3 |
| R5·3: M6-AC2 tested direct writes, which arrive in M8 | The direct-write check moved to M8-AC2; SAFE-3 marks direct writes →M8; §20 D14 |
| R5·4: §13.1 kept the old ceiling | 150 calls and 3M QU, as in WAKE-15 |
| R5·5: "unanswered" undefined, so one ignored check-in blocked every later one | WAKE-9 defines answered and exempts the 80% check-in; M2-AC4 |
| R5·6 (found while fixing R5·2): WAKE-15 said partial work is never applied | "never applied on its own" |

**Round 6** (gates E and Q, on v0.7; 1 critical and 9 high, one of them rejected): the rest were fixed in v0.8.

| Finding | Disposition |
|---|---|
| R6·E1, Critical: a soldier's `git config` in its workspace writes the shared config; GIT-3 hashed five sections, so harness `git commit` ran a planted `gpg.program` (reproduced) | GIT-1 turns signing and verification off; GIT-3 compares the whole effective config and re-checks after each command; WS-7 stops on a GIT-3 finding; the threat model states the remaining race; F45; M2-AC5 |
| R6·E2: a `git apply` that fails partway leaves files deleted, in v1 too (reproduced) | WS-8 restores every path on failure; F46; M5-AC8; v1 fix tracked as #53 |
| R6·E3: `git_read diff`, `log` and `show` returned secret files' content from history | MCP-3 adds exclude pathspecs and refuses `show <rev>:<path>`; M1a-AC1 |
| R6·E4: `git worktree prune` also drops the records of your other worktrees whose folders are missing | SAFE-8 deletes only its own record; M0a-AC1; PR #37 |
| R6·Q1: D15 should also ask before a cold soldier wake | Rejected: D15 is about resuming a chat whose Monarch is cold (`mogesreview.md`, and the updated option as explained on 2026-10-04). Cold soldiers follow D1: they start fresh with a digest (SESS-1). |
| R6·Q2: §0.2's D16 note claimed no half-done edits, which is false for `full` soldiers | Reworded |
| R6·Q3: no AC proved D13 or D17 | M9-AC3 |
| R6·Q4: SAFE-4 needed `sa doctor` before M6; O2–O5 had no §20 rows | SAFE-4 marked →M6; §20 rows O2–O5 |
| R6·Q5: UX-9 contradicted PLAIN-1's ASCII grammar | UX-9 defers to PLAIN-1 in plain mode |
| R6·Q6: the definition of done required TRACE-1 before M1a adds it | It applies from M1a |
| R6·Q (issues): issue text stale against §18, and AC sub-bullets dropped | Issues re-posted from §18 |

**Round 7** (gates E and U, on v0.8; 2 critical and 6 high): all were fixed in v0.9.

| Finding | Disposition |
|---|---|
| R7·E1, Critical: v0.8 restored a failed undo from the tip's blobs, which would erase your later edits in other hunks (reproduced) | WS-8 copies every touched path before an apply or undo and restores from that copy; M5-AC8 |
| R7·E2, Critical: a nested repository a soldier creates at a gitlink path ran its own `filter.*.clean` during harness `status`, and survived `reset` and `clean` (reproduced) | GIT-1 adds `diff.ignoreSubmodules=dirty` (tested: nothing runs, and gitlink changes still show); WS-2 empties gitlink paths; M2-AC5 |
| R7·E3: secret matching was case-sensitive, `--full-diff` bypassed the excludes, and pathspecs were relative to the working directory | MCP-3 allows only listed options and uses `top` and `icase` magic; WS-5; CONF-3 and CONF-5 match case-insensitively; M1a-AC1 |
| R7·E (medium, taken): a planted `format.pretty` with `%G?` still verifies signatures | GIT-1 adds `format.pretty=medium` |
| R7·U1: cards with more than two outcomes had no keys | CARD-2 numbers them; M4-AC1 |
| R7·U2: no key folded a tree row, and expanding a notice had no key | KEY-1 adds `→`/`←`; ATTN-1; M8-AC1 |
| R7·U3: "tell all four once" had no requirement or AC | MEM-6 defines the delta; M7-AC5 |
| R7·U4: the one-line strip could not hold the army, and CARD-1 named a strip that wide layouts lack | UX-4 lists awake soldiers and `+N`; UX-9; CARD-1 uses the footer; M4-AC2 |
| R7·U5: the Monarch's Claude quota has no source before M6 | ROS-6 shows it from M6 |
| R7·U (weak proof): no AC proved `compact <name>` | M9-AC1 |

## Appendix B. Traceability

TRACE-1 (`scripts/check-spec-trace.mjs`, run in CI) checks seven things:
1. **Definitions:** every requirement ID defined in bold.
2. **Ownership:** every defined ID is in exactly one milestone's Implements line.
3. **Evidence:** every implemented ID is in exactly one Evidence line of that milestone, with a known evidence class.
4. **Citations:** every cited requirement, spike (`S…`), fact (`F…`) and decision (`D…`) exists.
5. **ACs:** every milestone AC covers at least one ID implemented in that milestone or an earlier one.
6. **Milestone fields:** every milestone has a Goal and an Out of scope.
7. **Forward references:** a requirement citing a later milestone's requirement must mark it `(→Mx)`.
