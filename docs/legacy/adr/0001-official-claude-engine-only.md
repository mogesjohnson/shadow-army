# Build on the official Claude Code CLI only, never the leaked source

On 2026-10-03 the owner chose a leaked copy of the Claude Code source (v2.1.88, March 2026, in `collection-claude-code-source-code-main.zip`) as the reference design for Shadow Army 2.0.

2.0 matches and advances that harness's behavior and UX (spec §5), corrected by the current docs and the installed CLI. Every line of code, text, word list (such as spinner verbs) and visual is original. The source was never licensed, so copying, translating or adapting it would infringe Anthropic's copyright. A fork would also be frozen at March 2026.

The owner confirmed on 2026-10-04 that the zip is the reference for ideas and for how the pieces connect: Shadow Army is the same idea, more ambitious. The only copy is kept at `~/Downloads/collection-claude-code-source-code-main.zip`. Look there when stuck.

## Considered options

- **Fork the leaked source and put Shadow Army's Ink UI on top.** Rejected: there is no license, and the engine would stay frozen.
- **Run inside Claude Code as a plugin (a pane mod plus an MCP server).** Rejected on 2026-10-03, when a plugin could not draw a screen of its own: the agent panel cannot show non-Claude agents, and the screen would belong to Claude Code. Reopened on 2026-10-04: Claude Code mods (v2.1.287) can draw panes, a band above the prompt and commands, so the owner chose to try a mod-drawn screen in spike S13 before choosing between it and the Ink shell (spec O6). Either way the engine stays the official CLI, and every line stays original.
- **Reuse other projects in the same zip.** clawspring is Apache-2.0, so its ideas and code may be reused with its license and NOTICE kept. claw-code is a one-to-one port with no license, so it is a reference only.
