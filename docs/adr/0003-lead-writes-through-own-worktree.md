---
status: accepted (owner decisions D2 and D12, 2026-10-04; confinement pending spike S3)
---

# The Monarch may write code, but only through its own worktree, with no shell

v1 kept the Monarch read-only. In 2.0 the Monarch is both orchestrator and reviewer, and it may edit tiny fixes itself.

Its edits go through a lead workspace with the same machinery as a soldier: claims, the claim audit, the checkout guard and the uncommitted apply. Another soldier with the review role then reviews them.

Confinement is enforced by the permission system, not by instructions:
- `--restricted` and a tool list with no shell
- `--permission-mode dontAsk` and `--permission-prompts none`
- allow rules only for the lead workspace
- a PreToolUse hook as a second layer

Larger fixes that the Monarch is unsure a cheaper soldier can do go to a separate Opus session (`claude-opus-build`), not into the Monarch's own long context.

## Considered options

- **Let the Monarch edit the owner's folder directly, like normal Claude Code.** Rejected: the guard cannot tell a lead edit from a soldier escaping its worktree.
- **`acceptEdits` with a Bash allowlist and a hook.** Rejected: `acceptEdits` auto-approves `rm`, `mv`, `cp` and `sed`; hooks fail open; and allowlisted `git`/`rg` flags write files or run commands.
- **Keep the Monarch read-only.** Rejected by the owner.

## Consequences

This replaces the `CLAUDE.md` design rule "The Monarch's own calls stay read-only whatever a soldier's autonomy" in milestone M10. The Monarch's protocol and control-plane rules change in M1a.
