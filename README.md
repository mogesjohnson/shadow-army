<div align="center">

```
 ███████╗██╗  ██╗ █████╗ ██████╗  ██████╗ ██╗    ██╗
 ██╔════╝██║  ██║██╔══██╗██╔══██╗██╔═══██╗██║    ██║
 ███████╗███████║███████║██║  ██║██║   ██║██║ █╗ ██║
 ╚════██║██╔══██║██╔══██║██║  ██║██║   ██║██║███╗██║
 ███████║██║  ██║██║  ██║██████╔╝╚██████╔╝╚███╔███╔╝
 ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝  ╚══╝╚══╝

  █████╗ ██████╗ ███╗   ███╗██╗   ██╗
 ██╔══██╗██╔══██╗████╗ ████║╚██╗ ██╔╝
 ███████║██████╔╝██╔████╔██║ ╚████╔╝
 ██╔══██║██╔══██╗██║╚██╔╝██║  ╚██╔╝
 ██║  ██║██║  ██║██║ ╚═╝ ██║   ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝
```

**One monarch. Many shadows. Zero shared baggage.**

A personal CLI that commands other AI coding CLIs as a disciplined army.

`status: pre-alpha — README first, code feature by feature`

</div>

---

## What is this?

**Shadow Army** is a command-line orchestrator that connects the AI CLIs you already use and makes them work together without sharing their whole conversation history.

It is modeled on how Grok Bots work: a *chief of staff* bot delegates to specialist bots, each specialist gets an **isolated context** containing only what its task needs, and results flow back to the chief in one thread. Shadow Army adopts that pattern, and extends it with a shared **Shadow Vault** and file-level coordination so parallel agents never collide.

| Term | Meaning |
|---|---|
| **Monarch** | The orchestrator: one chosen LLM that plans, delegates, and synthesizes. |
| **Soldier** | Any connected AI CLI, accessed through an adapter. |
| **Brief** | The minimal task package sent to a soldier: task, claimed files, constraints, relevant Vault notes. |
| **Report** | The structured result a soldier returns: summary, files touched, open questions, vault-worthy notes. |
| **Shadow Vault** | `.shadow/`: shared notes curated by the monarch, plus private per-soldier directories. Soldiers never see each other's transcripts. |
| **Formation** | A saved preset of monarch + soldiers for a kind of job (e.g. `review`). |

## The army (v1)

| Soldier | CLI | Role |
|---|---|---|
| Codex (gpt6-astra) | `codex` | Primary orchestrator (Monarch) |
| Codex (gpt6.1-sol) | `codex` | Work-horse: builds features |
| Claude (Opus 5.5) | `claude` | Second orchestrator, reviewer, high-effort work-horse |
| Claude (Sonnet 5.5) | `claude` | Work-horse |
| Grok Build | `grok` | Work-horse: builds features. **Never reviews.** |
| Antigravity | `agy` | Research and testing only. **No coding** for now. |

Routing is driven by [`orchestratorDelegate.md`](./orchestratorDelegate.md), which tells the monarch where each soldier excels and where it falls short. The hard rules (Grok never reviews, `agy` never writes) are enforced in code, not just suggested.

## How the army avoids stepping on itself

v1 uses four layers:

1. **Claims in the brief.** Each soldier is assigned disjoint paths or globs.
2. **Git worktree per soldier.** Parallel edits cannot corrupt each other on disk.
3. **Vault lock registry.** File leases with TTL and heartbeat, taken atomically. Work happens in time slices; waiting soldiers are queued.
4. **Claim audit.** When a soldier reports, files it touched are diffed against its claims. Out-of-scope edits are rejected and flagged to the monarch.

Pre-write hooks (blocking a write at the moment of the attempt) are on the roadmap, per adapter, for CLIs that support them.

## Autonomy and rules

Each soldier's `autonomy` in `shadow.config.json` picks how freely it acts. What it may actually run is decided by the vendor's own controls at that level:

| Level | claude | codex | grok | agy |
|---|---|---|---|---|
| `supervised` (default) | plan / acceptEdits | read-only / workspace-write sandbox | plan / acceptEdits | plan |
| `auto` | its classifier (`auto`) | automatic review | `auto` | plan (no classifier mode) |
| `full` | `bypassPermissions` | full access, never asks | `--always-approve` | `--dangerously-skip-permissions` |

The shipped config runs codex-sol, grok and agy at `full`, and claude-opus and claude-sonnet at `auto`. Around that, Shadow Army keeps its own environment strict:

- **`rules.md`**: rules every soldier must follow, at the top of every brief (and given to the Monarch so it plans within them).
- **`agent.md`**: a `## <soldier>` section of extra rules for each soldier.
- **Checkout guard**: after every task, anything outside the soldier's own worktree that changed in the repository (your files, HEAD, branches, tags, remote-tracking refs) fails the task and is listed.
- **Throwaway copies**: an unrestricted soldier on a read-only task works in a snapshot that is deleted afterwards.

Rules in a brief are instructions; the guard and the claim audit are what is enforced. Actions outside the repository (other folders, the network) are only contained by running Shadow Army in a container or VM, which is what the vendors recommend for their unrestricted modes.

## The chat

In a terminal, `sa` (or `shadow`) on its own clears the screen and its scrollback, like `cls`, and opens a chat session in the style of Claude Code:

- **The screen:** the banner, a welcome box with the folder and the Monarch, a prompt box at the bottom, and a status line with the mode, branch, ready soldiers and the session's cost.
- **A goal:** type it and press Enter. The Monarch plans it, and the plan appears in the chat.
- **Running it:** what happens next depends on the mode. Approve the plan with `y`/Enter, and the live dashboard plays in the session. When the run ends, the dashboard's last frame and the report stay in the transcript, and the changes are in your folder as uncommitted edits (see "Where the work ends up" below).
- **A question:** a goal that is only a question the Monarch can answer by reading the repository gets no soldiers. The Monarch plans zero tasks and its answer appears in the chat, followed by a dim "answered by ...; no soldiers were needed" line. The answer counts as an earlier turn, so a follow-up can build on it.
- **Your changes:** `/diff` shows your folder's uncommitted changes, `git status --short` and then `git diff`, so the files a run applied show up too, new ones included. It runs git itself, so it is instant and free: no Monarch, no soldiers. Long output is cut at about 400 lines, with a line saying how many more there are and to run `git diff` for them all.
- **Follow-ups:** a later goal can build on earlier ones ("now add tests for it"). The Monarch is told this session's earlier goals and how each ended, including which files were applied to your folder: only those reports, never a soldier's transcript.
- **Slash commands:** `/help`, `/plan <goal>`, `/mode`, `/army`, `/summon <soldier> <task>`, `/route <role>`, `/vault`, `/locks`, `/worktrees`, `/diff`, `/clear`, `/exit`. Typing `/` opens a menu; Tab completes.
- **Keys:**
  - Shift+Tab cycles the mode: ask before running, run without asking, plan only.
  - Up/Down recall earlier inputs.
  - Esc clears the input.
  - Ctrl+C clears the input; pressed twice on an empty prompt, it exits. During a run, the soldiers stop with it.

`sa --plain`, or a `sa` whose input or output is not a terminal, prints the banner instead.

## Planned commands

```bash
sa                          # the chat (in a terminal); the banner otherwise
sa army                     # detect soldiers, show health and models
sa summon <soldier> "<task>"  # one-off dispatch (read-only)
sa summon <soldier> --write --claim "src/**" "<task>"
                            # writes, in its own worktree and branch, only inside its claims;
                            # the result is then applied to your folder, uncommitted
sa route --role <role>      # preview who may take a task, ranked, with reasons
sa run "<goal>"             # the Monarch plans, soldiers build in parallel, and the work is
                            # applied to your folder, uncommitted, for you to review and commit;
                            # asks first
sa run --plan-only "<goal>" # just show the plan and who would do what
sa vault                    # inspect shared notes and runs
sa locks                    # which soldier holds which files
sa worktrees                # soldier worktrees and their branches
sa formation <name>         # run a saved formation
sa adapter new <name>       # scaffold a new soldier adapter
```

### Where the work ends up

Soldiers never edit your folder while they work. Each works in its own worktree and branch, and `sa run` merges their branches into one branch, `shadow/run/<id>`. When the run is over, that branch's changes are applied to your folder as ordinary **uncommitted** edits. New files are marked intent-to-add, so `git status` and `git diff` show everything. Nothing is committed for you. The report lists the files and the commands to:

- review them (`git diff`)
- keep them (`git add -- <files> && git commit`)
- undo them (`git restore --source=HEAD --staged --worktree -- <files>`)

The branch stays as a backup.

Your own work is never overwritten. If you have uncommitted changes to a file the run also changed, or your folder has moved on so the changes no longer apply, nothing is applied. The report then says why and shows how to take the branch with `git merge` instead. `--no-apply` leaves the work only on the branch, as before. `sa summon --write` works the same way for its soldier's branch.

### Live screens

In a terminal, `sa run` shows a live dashboard once you approve the plan. It shows every task with its soldier, a status word (waiting, running, done, failed, refused, conflict, skipped), time taken, progress, reported cost, and the latest activity. The final report prints when the run is over. While a soldier works, `sa summon` shows one live line. `sa --plain <command>` (or `<command> --plain`) prints plain lines instead. Plain output is also used automatically when stdout is not a terminal, and with `--json`.

## Tech

TypeScript on Node, with [Ink](https://github.com/vadimdemedes/ink) (Yoga flexbox layout) for the terminal UI, commander for the CLI, execa for subprocesses, and vitest for tests.

## Roadmap

Built one feature at a time, each as its own issue and pull request:

- [ ] **F1** Scaffold and banner
- [ ] **F2** Adapter interface and the four adapters (`sa army`)
- [ ] **F3** `sa summon`: single dispatch with brief and report
- [ ] **F4** Shadow Vault
- [ ] **F5** Delegate parser and router (`orchestratorDelegate.md`)
- [ ] **F6** Worktrees, locks, and claim audit
- [ ] **F7** Monarch: `sa run`
- [ ] **F8** Live dashboard and `--plain`
- [ ] **F9** Formations and the adapter scaffold

**Later:** session replay with cost/time tracking, second-opinion mode (same brief to two soldiers, monarch compares), per-adapter pre-write hooks.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
