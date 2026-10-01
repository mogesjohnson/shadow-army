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

## Planned commands

```bash
sa                          # banner + status
sa army                     # detect soldiers, show health and models
sa summon <soldier> "<task>"  # one-off dispatch
sa run "<goal>"             # monarch plans, delegates, synthesizes
sa vault                    # inspect shared notes and runs
sa locks                    # show leases and queue
sa formation <name>         # run a saved formation
sa adapter new <name>       # scaffold a new soldier adapter
```

Add `--plain` for log output without the dashboard (also automatic when not attached to a TTY).

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
