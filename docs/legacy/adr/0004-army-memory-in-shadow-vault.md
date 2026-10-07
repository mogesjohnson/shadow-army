---
status: accepted (owner decision D3, 2026-10-04)
---

# The army's memory lives in `.shadow/memory/`, in Claude Code's layout, written only through `remember`

The army keeps its own memory, separate from the owner's everyday Claude memory, in `.shadow/memory/`. It is machine-local and never committed. The layout follows Claude Code's: a `MEMORY.md` index, typed topic files, and per-soldier files under `soldiers/`.

Only the Monarch writes it, through a `remember` tool. The harness writes each file, stamps its provenance and records its hash.
- Native memory is off in every process Shadow Army starts: Claude auto memory, grok memory and codex memories. Otherwise soldiers would read and write the owner's everyday memory.
- Entries learned from soldiers' notes wait for the owner's approval before other soldiers are primed with them.
- A file changed outside `remember` is quarantined.

`AGENTS.md` stays human-written, for facts that are always true.

## Considered options

- **Share the owner's everyday Claude project memory.** Rejected by the owner.
- **Claude's built-in auto memory pointed here with `autoMemoryDirectory`.** Rejected: it can't stamp provenance, its file writes clash with the Monarch's confinement, and any soldier could forge entries.
- **Have the harness write `AGENTS.md`.** Rejected: that file is committed and is read outside Shadow Army.
