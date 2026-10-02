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

## Planned commands

```bash
sa                          # banner + status
sa army                     # detect soldiers, show health and models
sa summon <soldier> "<task>"  # one-off dispatch (read-only)
sa summon <soldier> --write --claim "src/**" "<task>"
                            # starts from your folder as it is, writes in its own worktree and
                            # branch, only inside its claims; the result is then applied to
                            # your folder, uncommitted
sa route --role <role>      # preview who may take a task, ranked, with reasons
sa run "<goal>"             # starts from your folder as it is: the Monarch plans, soldiers build
                            # in parallel, and the work is applied to your folder, uncommitted,
                            # for you to review and commit; asks first
sa run --plan-only "<goal>" # just show the plan and who would do what
sa undo [id]                # take back the work the last run or summon applied (or the one with
                            # this id); refuses if you have changed those files since
sa vault                    # inspect shared notes and runs
sa locks                    # which soldier holds which files
sa worktrees                # soldier worktrees and their branches
sa formation <name>         # run a saved formation
sa adapter new <name>       # scaffold a new soldier adapter
```

### Where the work ends up

**Runs start from your folder as it is.** `sa run` and `sa summon --write` begin from a private snapshot of the folder: the last commit plus your uncommitted edits, deleted files and new files that are not ignored. The Monarch plans from it and the soldiers work from it, so a follow-up such as "now make `bye.txt` say goodbye forever" builds on what an earlier run left in your folder instead of redoing it. Taking the snapshot changes nothing in your folder, your index or HEAD, and a folder with nothing uncommitted just starts from HEAD.

Soldiers never edit your folder while they work. Each works in its own worktree and branch, and `sa run` merges their branches into one branch, `shadow/run/<id>`. When the run is over, that branch's changes are applied to your folder as ordinary **uncommitted** edits. New files are marked intent-to-add, so `git status` and `git diff` show everything. Nothing is committed for you. The report lists the files and the commands to:

- review them (`git diff`)
- keep them (`git add -- <files> && git commit`)
- undo them (`sa undo <id>`)

The branch stays as a backup.

Your own work is never overwritten. A file clashes only if it changed in your folder *since the run started*; the uncommitted work the run started from does not count. If a file the run changed also changed in your folder meanwhile, or your folder has moved on so the changes no longer apply, nothing is applied. The report then says why and shows how to take the branch instead: `git merge` when the run started from HEAD itself, and otherwise a `git diff --binary` plus `git apply` command that takes only the run's own changes, since the branch then descends from a snapshot commit holding your uncommitted work and merging it would commit that too. `--no-apply` leaves the work only on the branch, as before. `sa summon --write` works the same way for its soldier's branch.

### Undoing a run

Every apply is written to a ledger, `.shadow/applied.jsonl`, and so is every undo. `sa undo` takes back the most recent apply that is not undone yet; `sa undo <id>` takes back that one. The id is the run id for `sa run`, and the branch name for `sa summon --write`. An undo puts modified and deleted files back, removes added files (and their intent-to-add entries), and leaves every other file alone; the branch stays. It only reverses what the apply left, so it refuses, and changes nothing, when:

- a file it would touch has changed since the apply, for example you edited it or a later run changed it (undo that run first); the files are listed
- you staged one of those files, or committed it (use `git revert` for that)

Restoring to HEAD instead would also wipe the earlier uncommitted work that later runs built on, which is why undo is its own command.

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
