Verifier ANS-V2 (batches/ANS-V2.md), against v0.10 and the unapplied drafts, 2026-10-20

- id: R-M1-89
  verdict: DECISION
  severity: P1 (unchanged)
  evidence: v2@e7c33b4.md CH-2 294 (`claude -p`), PO-4 223 ("adding to it and never replacing it"), WSP-11 510-511 (a snapshot of HEAD, so a committed `.mcp.json` is in it), SET-2 565-566 (M4, covers only the owner's personal plugins and connectors). Nothing in v0.10 covers a repository's `.mcp.json`.
    Vendor docs: https://code.claude.com/docs/en/permissions, "What runs before you trust a folder". For `claude -p`, servers in `.mcp.json` are "Connected without asking, approved or not". The same page lists `--setting-sources user`, `--bare` and `disabledMcpjsonServers` as mitigations. https://code.claude.com/docs/en/mcp, Project scope: in `-p` runs Claude Code "loads project-scoped servers without asking". It names `--strict-mcp-config` and `disabledMcpjsonServers` as ways to keep a server out.
    Already drafted: drafts/answers/d4.txt:61 (row 11) and :80 (residual 8, "for the owner to accept") take option (c).
  reason: The vendor fact holds. The real gap is narrower than the finding says. The owner has trusted the folder to run the Monarch there, so its settings-file hooks and `env` block already run in the owner's own session. The new exposure is `.mcp.json` servers the owner never approved or declined: those run as the owner, with no prompt, in every claude soldier. Whether to close that or accept it is a trust-boundary choice.
  options: (a) D-10's trust card also covers the folder's `.mcp.json` and `.claude/settings.json`. (b) Pass `--strict-mcp-config` with only the `send` server. This conflicts with PO-4's "never replacing" and needs ADR-0010 weighed. (c) Accept it as residual 8, as d4.txt drafts. (d) Mirror the owner's own approvals: pass every `.mcp.json` server the owner hasn't approved in their own settings as `disabledMcpjsonServers` through `--settings`. That restores the vendor's interactive behavior.
    Side note: on Windows, local settings stay with each worktree (https://code.claude.com/docs/en/settings, "Where Claude Code keeps the local file"), so a decline recorded there doesn't reach a snapshot.
  big or technical: big (a trust boundary, and accepting a residual). New: D-10's answer covers four files only, and D-4's A doesn't pick among (a), (b) and (d). It can go on the same card as D-4's residual acceptance.

- id: R-M1-92
  verdict: DECISION
  severity: P1 (unchanged)
  evidence: v2@e7c33b4.md ARM-6 470 hashes `.claude/` "even where git ignores them". WSP-11 515 applies those paths in M1, and "any other change it finds fails the turn". ARM-6 477: from M2, such changes go to the card.
    Vendor docs: https://code.claude.com/docs/en/worktrees says the worktree "is created under `.claude/worktrees/<name>/` at your repository root". Subagent worktrees (`isolation: worktree`) and background-session worktrees go there too.
    Drafts: drafts/answers/d8-16-17.txt:60 names `claude --worktree` worktrees as folders of their own. :100 leaves out only a nested army's `.shadow/v2/` files. :108 puts M1-AC11's linked worktree "outside the folder", so the AC passes while the default layout fails. decisions.md D-17 card (lines 365-367).
  reason: This is real and the D-17 draft doesn't answer it. Under B, a second army in the default `claude --worktree` location sits inside the first army's guard. Every edit there fails the outer army's turns in M1 and cards them from M2. The AC that would show this avoids the layout, which keeps P1.
  options: (a) Another working tree of the repository nested in the folder, as `git worktree list` gives it, is not this army's checkout, and ARM-6 and WSP-11 skip it. (b) Keep hashing it, state the friction in Appendix D, and add a nested case to M1-AC11. (c) Refuse an army whose folder lies inside another working tree of the repository.
  big or technical: big. (a) narrows what the guard sees: a soldier's write into the nested tree goes unseen while no army runs there. (c) changes what the owner can run. This follows on from the owner's D-17 B answer but isn't covered by it, so it needs a new short follow-up card on D-17.

- id: R-M1-104
  verdict: CONFIRMED
  severity: P2 (unchanged)
  evidence: v2@e7c33b4.md CH-2 298 ("beside the session's record"). PO-6 229 is M3 and gives no location for records, only for reports. SI-4 361 is M4. PO-1 209 removes "any instructions file the last one left (CH-2)". Codex's draft, AIConnections-m1/src/v2/claude.ts:95-96, writes the file under the OS temp folder, which is the second reading in the finding's scenario. drafts/answers/d9-10-19.txt:25 copies the phrase for PO-4's credential file ("beside the session's record as CH-2's instructions file is"), so the ambiguity spreads. No draft fixes it.
  reason: In M1 no record exists and none has a defined place, so implementers already diverge, and PO-1's cleanup can't find a file in the temp folder.
  fix: CH-2: "That file is written by the post office beside the session's log under `.shadow/v2/logs/` (PO-5), never in a worktree, a snapshot or the system's temporary folder, and removed when the process ends." In d9-10-19.txt:25, "beside the session's record as CH-2's instructions file is" becomes "beside the session's log, as CH-2's instructions file is".

- id: R-M1-105
  verdict: CONFIRMED
  severity: P2 (unchanged)
  evidence: v2@e7c33b4.md CH-4 314. PO-4 220 covers only soldier credentials. PO-3 213 covers only the Monarch's secret. xAI's CLI reference, https://docs.x.ai/build/cli/reference, documents only `grok agent stdio` ("Run as an ACP agent over stdin/stdout"), and https://docs.x.ai/build/cli/headless-scripting does the same. Neither page mentions `serve`, a bind address or a server secret. No spike report or evidence file records `serve`; it appears only in docs/claude-first.md:79.
  reason: The spec allows an undocumented server mode guarded by a secret it never places. ACP over stdio, the documented way, needs no port and no secret.
  fix: CH-4: "`grok agent stdio`; `grok agent serve` is not used (xAI documents only `stdio`)." This is technical: it removes an unused alternative, and nothing changes for the owner.

- id: R-M1-106
  verdict: CONFIRMED
  severity: P2 (unchanged)
  evidence: Judged against drafts/answers/d9-10-19.txt:144 (NEW-D19-AC1) and :160 (the CH-2 bullet).
    Half of the claim is already documented, against the finding. https://code.claude.com/docs/en/settings-reference, `autoMemoryEnabled`: "`CLAUDE_CODE_DISABLE_AUTO_MEMORY` takes precedence over this key for one session, in either direction". So a project's `autoMemoryEnabled: true` loses to the variable set to 1.
    The other half is real and also documented, so it needs no probe. The same page, "How `env` values interact with your shell": "A value here overwrites the same variable exported in your shell". The variable is not among "Variables Claude Code ignores in `env`". "When Claude Code applies `env` values": project settings apply "at startup in `-p` mode". https://code.claude.com/docs/en/env-vars: 0 forces auto memory on even over `autoMemoryEnabled: false`. https://code.claude.com/docs/en/settings, "Settings precedence": `--settings` sits above project local and shared project settings, and "An `env` block inside a settings file is an ordinary key and follows the levels above".
  reason: By the vendor's own documentation, a committed `.claude/settings.json` with `"env": {"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0"}` turns auto memory back on in every claude soldier. The drafted fallback, `--settings '{"autoMemoryEnabled": false}'`, would not help, because the variable outranks that key. The drafted live check would catch the failure but not prevent it.
  fix: the d9-10-19.txt:160 bullet: "The adapter starts each claude process with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in its environment, over any value the post office inherited, and passes the same variable in the `env` of `--settings`, which outranks the folder's own settings files, whose `env` would otherwise replace it." Where a Windows `.cmd` shim can't carry the JSON, the `--settings` file follows CH-2's instructions-file rule. NEW-D19-AC1 adds: the command line carries that `--settings` env. The "if it fails" fallback in the ledger row is dropped. This is technical, within the owner's D-19 A answer.

- id: R-M1-107
  verdict: REFUTED
  severity: P3 (was P2). A hook that can answer the card is already code the owner let run as themselves (their own settings, or a folder they trusted in Claude Code). Such code can just as well write the acceptance record, which the draft already lists as a residual. So answering the card adds no capability.
  evidence: The fact holds. The mod API typings in mod-api-2.1.294/claude-code.d.ts:2406-2411 say `$.ui.ask` is a `tool.call` of AskUserQuestion "through every hook but the calling one". https://code.claude.com/docs/en/plugins/mods/events, "Where settings hooks run in the order": settings `PreToolUse` hooks run after the last mod's `next`, and another mod can answer a call itself. https://code.claude.com/docs/en/hooks: a `PreToolUse` hook answers AskUserQuestion with `permissionDecision: "allow"` and `updatedInput.answers`.
    But the draft already covers it: drafts/answers/d9-10-19.txt:120 ("Claude Code passes the dialog through its hooks as an AskUserQuestion call, which a PreToolUse hook can answer, ... can accept the card. Any process of the owner's ... can write the record"), with `Not now` first at :115.
  reason: The draft already states this residual. Moving the card to the pane's keys (HOST-5) would not close it, since the same code can write `~/.shadow-army/trust/`. The owner accepts the residual in writing through D-4's appendix, under the D-4 A answer already given, so no new card is needed.

