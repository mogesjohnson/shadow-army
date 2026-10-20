# 0012: A local-only post office with a secret for each start

- **Status:** accepted by the owner, 2026-10-07

## Context

Anything that can reach the post office, or a soldier's port, can make a soldier run commands on the owner's machine. A Claude Code mod can read a long-lived process's output, but writes its input only once. So the sessions must live in a separate process that the mod talks to.

## Decision

The post office and every port a channel opens bind only to the loopback address. Any other address is refused at start.

There are two kinds of credential, and they never mix:
- **The Monarch's.** The mod makes 32 random bytes each time it starts the post office, and passes them on the post office's standard input. They are never written to disk, a command line, an environment variable, the post office's output or a log, because soldiers run as the same user and can read whatever the owner can. The post office shields its own memory where the system allows, and logs which protection it has (v2 spec PO-3). The event stream reaches the mod only on the post office's standard output.
- **Each soldier's.** Every soldier session has its own credential. It is revoked when the session closes or starts fresh, and it works only on the soldiers' MCP endpoint, which serves the `send` tool alone. The sender is always the credential's soldier. A soldier credential cannot issue a Monarch command, read the event stream, or read any session, log or record.

A credential is never printed whole, and a refused connection is reported.

## Consequences

- No part of the army is reachable from the network.
- A soldier's credential lets it do nothing but `send` as itself: it cannot act as the Monarch or read another soldier's work.
- A soldier that runs code as the owner can still read the Monarch's secret where the system doesn't shield memory, and then act as the Monarch (v2 spec PO-3, Appendix D residual 1; decision D-9, accepted by the owner on 2026-10-17).
- Security tests are a standing part of CI (v2 spec SEC-1 to SEC-5).

## Review

Codex's review of PR #66 found that the first draft shared one secret between the mod and the soldiers. This version separates them.

Amended 2026-10-20 (spec v0.12, R-M1-109): the secret also stays out of output and logs, and the second consequence states D-9's residual, which the owner accepted.
