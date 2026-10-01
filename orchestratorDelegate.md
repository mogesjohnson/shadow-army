---
# Machine-readable rules. The router enforces these in code; the prose below guides the monarch's judgment.
monarch:
  default: codex-astra
  fallback: claude-opus
soldiers:
  codex-astra:
    cli: codex
    model: gpt-6-astra
    roles: [orchestrate]
  codex-sol:
    cli: codex
    model: gpt-6.1-sol
    roles: [build]
  claude-opus:
    cli: claude
    model: opus
    roles: [orchestrate, review, build]
    buildFor: [hard]          # high-effort work-horse for hard problems only
  claude-sonnet:
    cli: claude
    model: sonnet
    roles: [build]
  grok:
    cli: grok
    model: grok-4.7
    roles: [build]
    forbidden: [review]       # hard rule
  agy:
    cli: agy
    model: gemini-3.1-pro-high
    roles: [research, test]
    write: false              # hard rule: launched read-only, claim audit rejects any edit
---

# Orchestrator Delegation Guide

The monarch reads this file before every dispatch. Pick the soldier whose strengths match the task, avoid
their weaknesses, and match effort level to difficulty. Model IDs are config values and may need adjusting
to what each CLI actually lists.

## codex (gpt6-astra): primary orchestrator
- **Strong:** planning, decomposition, choosing who does what, synthesizing reports.
- **Weak:** don't spend it on heavy implementation; hand that to a work-horse.

## codex (gpt6.1-sol): work-horse
- **Strong:** building features end to end, sustained implementation.
- **Weak:** not the final reviewer of its own work.

## claude (Opus 5.5): second orchestrator, reviewer, hard-problem work-horse
- **Strong:** code review, subtle bugs, architecture, high-effort work on hard problems.
- **Weak:** expensive and slower; avoid for routine edits.
- **Effort:** high or max for review and hard builds; the monarch role falls here if codex is unavailable.

## claude (Sonnet 5.5): work-horse
- **Strong:** everyday feature work, refactors, tests; good cost/speed balance.
- **Weak:** don't use it as the final reviewer for critical changes.

## grok (Grok Build): work-horse
- **Strong:** creating new features quickly.
- **Weak:** **never assign reviews.** Hard rule.

## agy (Antigravity): research and testing only
- **Strong:** research, investigating, running and analyzing tests.
- **Weak:** **no coding for now, for any model.** Launched read-only. Hard rule.

## Effort guide
| Task | Prefer |
|---|---|
| Routine feature or refactor | claude-sonnet, grok, or codex-sol at low/medium effort |
| Hard or risky feature | claude-opus (high) or codex-sol (high) |
| Review | claude-opus (high); never grok |
| Research / test runs | agy |
| Plan and delegate | codex-astra; fallback claude-opus |

## Tie-breaks
1. Respect hard rules first; never override them.
2. Prefer the cheapest soldier that clears the difficulty bar.
3. Never let the author of a change review it.
