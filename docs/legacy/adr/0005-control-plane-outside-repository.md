# Keep the army's control plane outside the repository, and its token only in the Monarch's environment

Chats, reports, logs, pidfiles, the Monarch's settings and hook, the apply journal and the chat lock all live in a per-user runtime directory outside the repository (`%LOCALAPPDATA%\shadow-army\<repoId>` on Windows).

The army MCP endpoint's bearer token is never written to disk. It reaches the Monarch only as `${SA_ARMY_SESSION}` (a name that is not credential-like, so the CLI expands it) in its environment, and soldiers are started with an allowlisted environment that does not contain it.

Soldiers at `full` autonomy run as the owner's OS user, in worktrees under `.shadow/` inside the repository. A token file inside the repository would let any prompt-injected soldier wake other soldiers or start lead tasks.

## Considered options

- **Keep the runtime state in `.shadow/` with a user-only file mode.** Rejected: soldiers run as the same user.

## Consequences

`.shadow/` keeps only worktrees, army memory, and v1's vault and locks. Against a determined `full` soldier, only OS isolation is a real boundary. `sa doctor` says so.
