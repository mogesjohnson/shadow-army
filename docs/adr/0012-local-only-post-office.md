# 0012: A local-only post office with a secret for each start

- **Status:** accepted by the owner, 2026-10-07

## Context

Anything that can reach the post office, or a soldier's port, can make a soldier run commands on the owner's machine. A Claude Code mod can read a long-lived process's output, but writes its input only once. So the sessions must live in a separate process that the mod talks to.

## Decision

The post office and every port a channel opens bind only to the loopback address. Any other address is refused at start. Every connection must present a secret of 32 random bytes, new each time the post office starts. The secret is never printed whole, and a refused connection is reported. The soldiers' `send` tool is served over the same local endpoint, behind the same secret.

## Consequences

- No part of the army is reachable from the network.
- Security tests are a standing part of CI (v2 spec SEC-1 to SEC-4).
