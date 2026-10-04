# Run the Monarch on the `claude` CLI under the owner's subscription, not the Agent SDK

The Monarch is a long-lived `claude -p --input-format stream-json --output-format stream-json` process under the owner's Claude Pro login. All four CLIs run on subscriptions; no API credits are used. The Agent SDK offers the same engine, but its documentation requires API-key authentication for third-party products, so every Monarch token would be billed on top of the Pro plan.

## Consequences

- Shadow Army parses the CLI's stream-json protocol itself. It keeps fixtures per CLI version and confirms headless behavior with spikes (spec M0).
- Monarch and soldier processes use a lean launch (`--restricted`, `--strict-mcp-config` and related flags) to keep the owner's personal configuration out of their context and quota.
- **Risk:** the docs say `--bare`, which never reads OAuth credentials, "will become the default for `-p`". `sa` checks the login mode before every chat (LEADRT-10). If headless use stops working on the subscription, codex-astra is the fallback Monarch. If Shadow Army is ever shared with others, this decision must be revisited.
