# 0010: Vendor harnesses stay whole

- **Status:** accepted by the owner, 2026-10-07: "lets not strip down the harnesses that the corporate companies provide with the models (they have built in safeguards)"

## Context

Trimming a CLI's launch cuts its fixed cost. On 2026-10-07 a claude request fell from 31.5k to 9.5k tokens with MCP servers, skills and most tools removed. But each vendor's system prompt, built-in tools and permission checks carry that vendor's safeguards.

## Decision

Shadow Army never replaces a vendor's system prompt, never removes a built-in tool, and never passes a flag that disables a safeguard. Its standing instructions go in only through each CLI's append slot. Autonomy only chooses each vendor's documented flags.

## Consequences

- Each request costs the CLI's own floor. Savings come from keeping sessions open, from dropping the separate Monarch, and from the meter and handoff (ADR-0011).
- The owner's personal plugins and connectors are not part of the vendor's harness. Soldiers may start without them and attach one on request (v2 spec SET-2).
