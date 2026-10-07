# Soldiers start from the owner's working state, recorded under `refs/shadow-army/`

Each wake starts from a working-state base: a commit of the checkout exactly as it is, built in a temporary index seeded from the real one, so the owner's index and files are never touched. This lets a soldier see the owner's uncommitted work, and its own earlier applied work, which matters in a chat that iterates.

The base excludes `.shadow/`, large untracked files and files with secret-looking names.

Bases and task tips live under `refs/shadow-army/<chat>/`, not `refs/heads/`, so `git push --all` and `--branches` never publish them. Apply compares each file's current content with its blob in the base, so the owner's newer edits are never overwritten. Every apply can be undone on its own.

## Considered options

- **Start from HEAD, as v1 does.** Rejected: a fix wake would not see the soldier's own applied-but-uncommitted work, and a reviewer would not see the owner's changes.
- **`git stash create`.** Rejected: it misses untracked files.
