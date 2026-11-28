# Session 1 report: 2026-10-14, session 7ac7daad

What the first review session ran, found and learned. The live state is [`STATE.md`](STATE.md); every finding is in [`ledger.md`](ledger.md).

## What ran

- **At the start, 13 agents at once:**
  - six reviewers: units F and M1, each with an implementer, a red team and a chaos engineer;
  - five drafters: D-2 options A and B; D-3 options A, B and C;
  - two Sonnet prototypes: D-2's lease simulation and D-3's Linux containment test.
- **Then six verifiers** for unit F (packets F-V1 to F-V6).
- **The usage limit cut the agents off three times.** The session resumed them twice. After the third, the owner asked to stop every agent and document everything; none was resumed.

| Work | State |
|---|---|
| Round 1 reviewers (6) | done: `raw/F-r1-*.md`, `raw/M1-r1-*.md` |
| D-2 prototype and drafts A and B | done: `prototypes/D-2/`, `raw/D-2-*.md` |
| D-3 draft A | done: `raw/D-3-option-A.md` |
| D-3 prototype | its runs finished and wrote their results (`prototypes/D-3/results/`); its agent was cut off before writing a report |
| D-3 drafts B and C | cut off: redraft |
| F's six verifiers | cut off: rerun from `batches/F-V1.md` to `F-V6.md` |
| M1's verification | not started: packets `batches/M1-V1.md` to `M1-V8.md` are ready |
| Fixes, round 2, sign-offs, judges | not started |

## Round 1 in numbers

| Unit | Findings | P1 | P2 | P3 | Duplicates | Parked | To verify |
|---|---|---|---|---|---|---|---|
| F | 51 | 16 | 31 | 4 | 7 | 5 | 39 |
| M1 | 56 | 16 | 36 | 4 | 16 | 0 | 40 |

No reviewer found a P0. About one finding in five was a duplicate across lenses or units, so dedupe before verifying.

## The main findings (unverified)

Security:
- **B2 is real on paper** (two reviewers): a soldier running as the owner's user can read the Monarch's secret from process memory on Windows, or on Linux with ptrace unrestricted, and then act as the Monarch. A claude soldier's own credential also sits on its command line (`--mcp-config`), where another soldier can read it. This needs a decision on how far PO-3 goes.
- **Mods also run in `claude -p`**, so an installed Shadow Army mod would load in every claude soldier and give it the Monarch's `send` tool. Another installed mod's `tool.check` could approve a soldier's tool call (R-F-28).
- **A repository's own `shadow.config.json` chooses each soldier's command and autonomy**, with no allowlist, so opening a malicious repository could run its program (R-M1-2).
- **No autonomy level names its permission mode.** Without an explicit flag, `claude -p` may start in `auto` (with telemetry off, from 2.1.285) or in whatever `defaultMode` a committed `.claude/settings.json` sets (R-M1-24).
- **Four safeguards of the 2.0 draft were not carried over:**
  - GIT-1 to GIT-4: hooks, fsmonitor, pager and signing off for harness git. This is H48;
  - SAFE-7: control and escape characters stripped from what the UI shows. This is H25;
  - GUARD-5: a second instance in the same folder is refused;
  - MCP-4: a retried send is idempotent.
- The frame has no threat model, and §5.1's security level lists only four tests.

Lifecycle:
- Nothing says what a start does when a **lock** already exists, or what "folder" means.
- **Shutdown** has no time limit, and loses every open decision.
- **The post office dying**, the mod reloading, and `/clear` or `/resume` all have no defined outcome.
- **A failed log write**, a malformed line, a silent CLI, and a login error followed by an exit have no outcome.

The claude channel:
- **The turn totals in `result` are wrong** in streaming input: `total_cost_usd` and `modelUsage` are running totals, `usage` leaves out subagents, and a crash or stop result reports zeros.
- No field mapping exists for the error kinds.
- A background task's follow-up turn can end the next message's turn.
- `--permission-prompts` needs claude 2.1.259 or later.

The frame and verification:
- "Turn", "Claude session", "folder" and the soldier states are not defined.
- Appendix B lets an AC rely on a later milestone.
- The parity check (5%) is not defined well enough to judge.
- G7 promises verification traced in CI, but nothing links an AC to a test.

## Facts learned, with sources

| Fact | Source |
|---|---|
| Node's `performance.now()` is libuv's `uv_hrtime()`: QueryPerformanceCounter on Windows, which counts sleep and hibernation; `mach_continuous_time` on macOS, which counts sleep; `CLOCK_MONOTONIC` on Linux, which doesn't | learn.microsoft.com "Acquiring high-resolution time stamps"; libuv `src/win/util.c`, `src/unix/darwin.c`, `src/unix/linux.c`; man clock_gettime(2) |
| In streaming input, claude's `total_cost_usd` and `modelUsage` are running totals for the process, plus spend restored on resume; `usage` covers one turn's main loop only; a crash's result may carry zeros; the figures are client-side estimates | code.claude.com/docs/en/agent-sdk/cost-tracking |
| An interrupted claude turn's `result` reports zero usage | spike S6 (`evidence/s6-results.md`) |
| `SessionEnd` hooks share a 1.5 s budget, and fire on `clear`, `resume`, `logout` and exit | code.claude.com/docs/en/hooks |
| After `/clear` or a resume, `$.session.id()` changes and no `session.start` fires; a spawned child blocks on its next write once 1,048,576 characters wait unread; `$.process` is CLI only | Claude Code 2.1.294 mod typings (`evidence/README.md`) |
| Writes to a pipe are synchronous on Windows in Node | nodejs.org/api/process.html, "A note on process I/O" |
| `claude -p` starts in `default` when it fetches feature flags, and in `auto` when it doesn't (telemetry off, 2.1.285+); a settings file's `defaultMode` applies | code.claude.com/docs/en/permission-modes |
| `--permission-prompts` needs claude 2.1.259+; `none` makes claude deny instead of waiting | code.claude.com/docs/en/cli-reference, /headless |
| claude can stay open after its input closes, to wait for background work, then takes one more turn | code.claude.com/docs/en/headless |

## The two prototypes

**D-2, the lease** (`prototypes/D-2/lease-sim.mjs`; rerun with `node lease-sim.mjs`, about 3 s; seeded; 9 self-checks):
- The clock decides the sleep case, not the timing. As built (`lease.ts`), every sleep ends the lease and every soldier session: 216 of 216 runs, for 10 s / 30 s and for 5 s / 20 s alike. A suspend-aware check (count only the post office's own running time, capped per check; a renewal never expires the lease) gives 0 of 216.
- With that check, 10 s / 30 s tolerates a 20 s stall of Claude Code (5 s / 20 s: 15 s), sends 360 renewals an hour (720), and cleans up a dead Monarch in 20–30 s (15–20 s).
- So the owner's 10 s / 30 s holds up. The defect is the measurement in Codex's `lease.ts`.

**D-3, Linux containment** (`prototypes/D-3/run-all.sh`, WSL Ubuntu 24.04, 20 runs per mechanism; a fake CLI starts a child, a nohup child, a setsid double-fork daemon, and a daemon every 5 ms):
- Killing the process group, or polling `/proc` every 50 ms, lets daemons escape every time (2,264 of 2,264 alive).
- A subreaper helper, a `systemd-run --user --scope` cgroup (no root), and a PID namespace (`unshare --kill-child`) each end everything, 0 of about 2,300 left.
- A helper built dynamically on Ubuntu 24.04 needs glibc 2.34, so a prebuilt one would fail on RHEL 8 or Ubuntu 20.04 unless built statically. Compiling at first use took 0.1–0.15 s.
- macOS was not testable here; option C still has to find a public macOS mechanism.

## How the agents behaved

- Each agent returns its report through a hand-back message. Saved word for word in `raw/`.
- A reviewer used 130k–330k tokens, a drafter 240k–320k, and a Sonnet prototype about 290k. Thirteen at once used up a usage window in about ten minutes.
- Reviewers strayed outside their unit when the frame led them there (F's chaos engineer found defects in WSP-5 and the send tool). Those findings are parked for their units.
- The harness flagged one report for "instruction-shaped" text. It quoted vendor flag names (`bypassPermissions`, `--dangerously-skip-permissions`) as evidence; nothing in it was an instruction.
- The verifier and packet steps worked as designed. The packet script copies each finding word for word, so a verifier sees exactly what the reviewer wrote.
