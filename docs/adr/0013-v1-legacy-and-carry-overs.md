# 0013: v1 is legacy, the 2.0 spec is superseded, and what carries over

- **Status:** accepted by the owner, 2026-10-07

## Context

v1 (the per-message `sa` CLI) shipped as `v1.0.0` and `v1.0.1`. The 2.0 spec designed an Ink shell with per-wake soldiers, and ADR-0008 and ADR-0009 replace that design. Much of v1's workspace safety was hard won and still applies.

## Decision

- **v1 is frozen** at `v1.0.1`, on the `legacy/v1` branch.
- **The 2.0 spec and ADRs 0001 to 0007 stay in `docs/legacy/`, unchanged.** v2 has its own spec, `docs/spec/v2.md`, and these ADRs continue the numbering from 0008.
- **What carries over**, listed in Appendix A of the v2 spec:
  - worktrees, claims and the claim audit;
  - the checkout guard and link safety;
  - all-or-nothing apply, and undo;
  - starting work from the folder as it is;
  - `redact()`;
  - the roster files and the hard rules;
  - shadow names;
  - v1's design foundations.

## Consequences

- v1-only code (the Ink chat, the live dashboard, the Monarch pipeline) leaves `main` in v2's milestone M6. Until then `main` keeps building and passing.
- A requirement carried over cites its source, so its history stays traceable.
