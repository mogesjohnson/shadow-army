# Settled: what reviewers treat as decided

Reviewers treat everything here as settled. Raise one only with new evidence, and then with the type `decision-needed`. Sources: `docs/adr/` (ADR-0008 to ADR-0015), STATE.md's owner-decisions log, and `CLAUDE.md`'s design rules. Last updated 2026-10-14 (review start, spec v0.6 at `be9deb0`).

## Accepted ADRs

- **ADR-0008 Claude is the Monarch** (2026-10-06/07). The owner's own Claude Code session plans, sends briefs by name through the mod's `send` tool, and reads five-line summaries. No other process plans for the army. The Monarch's own permissions stay the owner's (HOST-13; Q1).
- **ADR-0009 Live sessions through each CLI's own channel** (2026-10-07). One live session per soldier through claude stream-json, codex app-server, grok ACP, agy stream-json. One ACP-shaped interface toward Claude and the mod. No third-party adapter between the post office and a vendor CLI.
- **ADR-0010 Vendor harnesses stay whole** (2026-10-07, the owner: "lets not strip down the harnesses that the corporate companies provide with the models (they have built in safeguards)"). Never replace a system prompt, remove a built-in tool, or pass a flag that disables a safeguard. Instructions only appended. Autonomy only chooses documented vendor flags. Personal plugins and connectors are not the harness (SET-2).
- **ADR-0011 Sessions: the meter, the cold warning and the 200k handoff** (2026-10-07). Context size from the CLI's own numbers; a 200,000-token handoff line per soldier, below any reported window; near handoff at 90%; a handoff summary (working on, done, decided, files, open) with accept, edit or keep going; cold is an estimate; start fresh at any time.
- **ADR-0012 A local-only post office with a secret for each start** (2026-10-07). Loopback only; any other address refused at start. Two credential kinds that never mix: the Monarch's (32 random bytes per start, on the post office's stdin, never on disk, a command line or an environment variable; the event stream only on stdout) and each soldier's (per session, revoked on close or fresh, `send` only, sender always its own soldier).
- **ADR-0013 v1 is legacy** (2026-10-07). v1 frozen at `v1.0.1` on `legacy/v1`; the 2.0 draft spec and ADRs 0001–0007 stay in `docs/legacy/` unchanged; the carry-overs of Appendix A; v1-only code leaves `main` in M6.
- **ADR-0014 The owner steers** (accepted 2026-10-08 with v0.3; amended by v0.4). Stop a turn through the CLI's own interrupt, keeping the session; a stop cancels the turn's open approval requests and approves nothing; the queue is visible, and its messages can be cancelled or changed; one meaning per message state (queued, delivered, answered; interrupted, not delivered, cancelled; "failed" is not a state); facts on the summary card from git and the tool-call record; one list of decisions.
- **ADR-0015 The quiet default** (2026-10-13). Margin's composition is the default; "While you were away" after 10 minutes without input once the army settles; Gatehouse is the pane's first tab; a broad allow ("allow for this session", ACP `allow_always`) takes two presses; Review Desk and Summoning Circle not adopted; War Table and Timeline held.

## The owner's decisions the spec embodies

- **Harnesses** (2026-10-07): never trim a CLI's system prompt, tools or safeguards to save tokens; append our instructions only (ADR-0010, CH-7).
- **Stops and crashes** (2026-10-08, kept after explanation): a stopped turn that has not ended after 30 seconds is ended and its session resumed (CH-10). A lost connection is a crash: the post office ends the CLI, restarts it and reopens the session (PO-1).
- **Asked for** (2026-10-08): instructions are fixed for a session's life (SI-4); an interrupted message is never re-sent by Shadow Army or by one key (MSG-4); the "stopping" state (MSG-9).
- **M1's seven decisions** (2026-10-13, each as recommended):
  1. the lease: the mod pings every 10 s; 30 s without one closes each session through its CLI and quits; beside the launcher watch and process containment (PO-7). *Codex built 5 s and 20 s; bake-off D-2 checks whether 10 s and 30 s hold up. Until D-2 closes, the text's 10 s and 30 s stand.*
  2. one post office per folder, with a lock holding pid, start time and port (PO-1);
  3. the mod stays in M1 (HOST-2, M1-AC1); `sa live` may stay as a dev tool;
  4. fakes chosen through configuration (VER-5);
  5. M1-AC3 replays a real, redacted recording; recorded again in VER-9 if the flags differ;
  6. CI fails below 85% line coverage on the post office and channels (VER-6);
  7. M1's soldiers run in a throwaway snapshot of HEAD, until WSP-1 gives each its worktree in M6.
- **Coverage** (2026-10-13): "we will do the 85 and 100 % then". 85% line coverage combined over the three systems; every line and branch of the security code (making, handing over and checking the Monarch's credential; the loopback-only rule; redaction), in the post office and the mod. No code excluded, no bar lowered (VER-6).
- **v2.1 picks** (2026-10-13): Margin the default and Gatehouse the needs-you tab (only the confirm step for "allow for this session"; no m/unread, no / palette); the away digest after 10 minutes without input, once the army settles; a kind of work (build, review, research, test) on `send` and `/send`, so ARM-2 refuses a grok review or an agy build before sending; Bellion (codex-astra) gets review and hard builds, listed after claude-opus.
- **Ideas** (2026-10-14): Appendix C sets the owner's 118 ideas and the six v2.1 designs beside the spec, with file paths. It is a reference; nothing in it is a requirement until a review moves it into section 4. No code from the `order/` files or the leaked Claude Code source ever enters the repository, a brief, a finding or a fix.
- **Who decides** (2026-10-14): "I want this built out end to end! I will only answer big questions." Technical choices are made by the agents through a bake-off and reported; big ones (PLAYBOOK section 14) go to the owner as decision cards.

## Design rules carried from `CLAUDE.md`

- Soldiers never share context: only briefs and reports cross between them.
- Hard rules: Grok never reviews, agy never writes. A delegate file can only restrict a soldier, never grant it more.
- Routing policy (roles, cost, `forbidden`, `write`) lives in `orchestratorDelegate.md`'s front-matter; runtime settings (`cli`, `model`, `autonomy`) in `shadow.config.json`; both list the same soldiers.
- Writes need the build role, and happen only in the soldier's own worktree under its claims.
- Autonomy (supervised, auto, full) only chooses each vendor's own flags. Shadow Army never adds or removes a vendor safeguard.
- With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task during which something outside Shadow Army's branches and worktrees changed.
- Live probes and CLI runs need the owner's go. A full-mode soldier run is the owner's own.

## Process

- Codex reviews each batch PR; Claude merges with Codex's approval at the exact head.
- Issues close only on verified acceptance, never by assertion; PRs use `Tracking:`, never closing keywords.
