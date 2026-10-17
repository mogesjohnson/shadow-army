# M1 round 1, fix check M1-FC3: the P1 repairs (R-M1-70, R-M1-73) in v0.9. Both FIXED; 6 findings on what the repairs broke or left half done (FC3-1 to FC3-6: two P2, four P3). 201,894 tokens, 60 tool calls, 18 min.

**R-M1-70: FIXED**
- evidence (v0.9 lines, `v2@b6f4315.md`): WSP-10 507 now trusts the state "as Shadow Army's own command left it when it made or removed a snapshot or a worktree". It defines a worktree's metadata as its `gitdir`, `commondir` and `config.worktree`. It checks the HEAD of Shadow Army's own snapshots and worktrees against the commit it expects, and a moved HEAD in a soldier's snapshot counts as a write there. This follows 2.0 GIT-3 (legacy 1053-1060); v0.8's 498 trusted only the start state and the owner's answer. ARM-6 470 hashes metadata "as WSP-10 defines it", and 474 adds Shadow Army's own snapshot and worktree commands to the trusted records. WSP-11 514 makes a moved HEAD a write. WSP-11 515 reads metadata "as WSP-10 defines and trusts it, so another soldier's snapshot made or removed during the turn is no change", and puts Shadow Army's own snapshots, worktrees and `.shadow/v2/` files outside the checkout. That is the exemption settled.md:41 gives its branches and worktrees. M1-AC11 727 tests a commit in the snapshot, and 731 tests a second soldier's open, restart and close.
- reason: Each of FC2-6's four scenarios now ends the way the settled rule wants:
  - the first snapshot holds nothing;
  - Kaisel's open, restart or close is no change in Iron's turn;
  - a soldier's own `git status` touches only its index, which is not metadata;
  - M1-AC11 runs two soldiers.
- depends on:
  - D-17. The repair trusts only this post office's own commands. Under D-17's option B, a second army's snapshots still change the metadata this army checks until D-17's text lands. A worktree the owner makes during a turn, as `claude --worktree` does, still holds harness git in M1, which is D-17's question.
  - D-7. Option A's draft (decisions.md:210) writes its own version of this exemption against v0.8. Whichever option wins must be merged onto ARM-6 474, WSP-10 507 and WSP-11 514-515, not replace them.

FC3-1 (R-M1-70, broke)
- severity: P2
  type: ambiguity
  location: WSP-10 (v2@b6f4315.md:507); ARM-6 (:474); WSP-11 (:515)
  claim: WSP-10 trusts "their state" (the config, `hooks/`, `info/` and every worktree's metadata) as Shadow Army's own snapshot or worktree command left it. ARM-6 trusts such a command only "for the worktree metadata they changed". Neither reading holds in M1.
  scenario:
  - Reading A, WSP-10 as written: after the command that makes or removes another soldier's snapshot, whatever the config, `hooks/` and `info/` then hold is trusted. That includes a change something else made while the command ran, so the check after the command can no longer report it. In M1, soldiers' processes run while harness git runs, because WSP-7 is M6.
  - Reading B, ARM-6's: an owner's global git config sets `worktree.useRelativePaths=true`. Shadow Army's first `git worktree add` in the repository then also writes `extensions.relativeWorktrees` into the repository's config. That is not worktree metadata, so it holds harness git until the post office restarts. This is FC2-6's first scenario again, for that owner.
  - M1-AC11 731 passes under both readings, so it doesn't choose between them.
  evidence:
  - WSP-10 :507; ARM-6 :474; WSP-11 :515; WSP-7 :492 (M6). v0.8's WSP-10 (v2@1580e87.md:498) had no such clause.
  - 2.0 GIT-3 (docs/legacy/spec/shadow-army-2.0.md:1060): "The check runs again after each command, so a change made while the command ran is reported too." 2.0 shipped SAFE-11 (no soldier code while harness git runs) in the same milestone as GIT-3 (:1255).
  - git: "setting `worktree.useRelativePaths` to "true" implies enabling the `extensions.relativeWorktrees` config" (https://git-scm.com/docs/git-worktree). `relativeWorktrees` is "Automatically set if a worktree has been created or repaired with either the --relative-paths option or with the worktree.useRelativePaths config set to true" (https://code.googlesource.com/git/+/refs/heads/master/Documentation/config/extensions.adoc).
  fix:
  - WSP-10 :507: "…their state when the post office started; after Shadow Army's own command that made or removed a snapshot or a worktree, that state with the metadata of the one it made added and that of the one it removed taken out; or as the owner last accepted it."
  - The command that makes a snapshot or a worktree passes `-c worktree.useRelativePaths=false`, so it changes no repository config.
  - ARM-6 :474: "for the metadata of the snapshot or worktree they made or removed".
  - M1-AC10 adds a global `worktree.useRelativePaths=true`, set before the post office starts: making a snapshot holds nothing and leaves the repository's config unchanged.

FC3-2 (R-M1-70, half done)
- severity: P3
  type: gap
  location: PO-1 (v2@b6f4315.md:206, :209); PO-5 (:227); WSP-11 (:514-515); M1-AC1 (:697)
  claim: The repair adds two rules: another soldier's snapshot made or removed during a turn is no change, and a moved snapshot HEAD is a write. Both need records that a post office dying mid-turn doesn't leave, so the next post office's check under PO-1 can't apply them.
  scenario:
  - During Iron's turn, Kaisel crashes and restarts: its old snapshot is removed and a new one made. Iron commits in its own snapshot. Then the post office is killed.
  - The next post office closes Iron's guard against the baseline on disk (:206).
  - Reading A compares the metadata with that baseline. Kaisel's two snapshots then show as changes in the transcript line, and from M2 on a card whose n fails Iron's turn.
  - Reading B reads the metadata "as WSP-10 ... trusts it" (:515). For the new post office that trust is its own start state, so no metadata change in that turn is ever reported.
  - Either way, :209 must report Iron's commit, but nothing on disk names the commit Iron's snapshot was made at, so its HEAD can't be checked.
  evidence: PO-1 :206 and :209; PO-5 :227 (a turn's log lines give only where its baseline is kept); WSP-10 :507 (the first trusted state is the post office's start); WSP-11 :514-515; M1-AC1 :697 (one soldier, and only a file written in the snapshot).
  fix:
  - PO-5 :227 adds: "So is each snapshot or worktree Shadow Army makes or removes, with the commit it was made at and the metadata it left, written and flushed as it is made or removed."
  - PO-1 :206 trusts the metadata those lines explain, as WSP-10 does. PO-1 :209 reports a snapshot whose HEAD is not its logged commit as a write.
  - M1-AC1's kill case adds a commit in the snapshot.

FC3-3 (R-M1-70, half done)
- severity: P3
  type: contradiction
  location: WSP-11 (v2@b6f4315.md:515); PO-6 (:229)
  claim: WSP-11 puts only Shadow Army's files under `.shadow/v2/` outside the checkout, but PO-6 writes full reports under `.shadow/reports/`. So from M3, a report written during another soldier's turn is a change to the checkout under WSP-11's guard, which runs until M6.
  scenario: From M3, Iron's report is written while Kaisel's turn is open. Read literally, Kaisel's guard finds a new file in the checkout, and Kaisel's turn goes to the card. If `.shadow/` ignores itself, as v1 sets it up (src/workspace/session.ts:53), nothing shows, but v2 doesn't say so.
  evidence: WSP-11 :515; PO-5 :225 (logs under `.shadow/v2/logs/`); PO-6 :229.
  fix: PO-6 :229: "Full reports go under `.shadow/v2/reports/`". Or WSP-11 :515 names `.shadow/reports/` beside `.shadow/v2/`.

**R-M1-73: FIXED**
- evidence: WSP-8 493 makes an approval request's tool input and options the one exception:
  - its event carries them whole;
  - its card shows them word for word (CH-6, →M2);
  - the mod redacts them wherever they reach Claude, as when `/decisions` prints them (HOST-14 180, →M5);
  - the post office's log of them is redacted.

  This restores CH-6 325 and SEC-6 524 as written. The event stream reaches only the mod, on the post office's standard output (PO-3 215), so the whole request goes nowhere a soldier can read. M2-AC2 743 adds the `GH_TOKEN=…` and `Bearer` case (whole on the card, redacted in the log) and cites WSP-8. claude's `can_use_tool` carries the tool's exact input (spike S5, .shadow/v2-tools/review/evidence/issue-63-comments.md:109), so FC2-3's scenario now shows the whole command.
- reason: The card now gets the request whole and the log gets it redacted, so CH-6 and SEC-6 hold as written for every request that carries its own input. FC3-4 covers codex and grok requests that may not.

FC3-4 (R-M1-73, half done)
- severity: P2
  type: ambiguity
  location: WSP-8 (v2@b6f4315.md:493); CH-6 (:324-325); M2-AC2 (:743)
  claim: The exception covers "an approval request's tool input and options". But codex and grok can send what the owner approves outside the request itself, in an event WSP-8 still redacts. Their cards can still hide part of it, and M2-AC2's new case can pass with claude alone.
  scenario:
  - codex asks to approve a file change. Its `item/fileChange/requestApproval` carries no diff. The diff came earlier, in the `fileChange` item of `item/started`, which is a tool-call event and is redacted.
    - Reading A folds that item into the request's tool input, and the card shows the diff whole.
    - Reading B takes "tool input" to mean the request's own fields, so the card's diff shows `[redacted]` wherever a value matched.
  - The same holds in two more cases:
    - a codex command request without its optional `command`;
    - a grok `session/request_permission` whose `toolCall` carries only its `toolCallId`, the `title`, `content` and `rawInput` having come in the earlier `tool_call` update.

    In both cases the card can hide a command, which is FC2-3's P1 hazard. Only recordings (M2-AC1) show whether grok's requests carry their input.
  - M2-AC2's "a request whose command holds `GH_TOKEN=…`" names no CLI and no file change.
  evidence:
  - WSP-8 :493; CH-6 :324-325; CH-1 :288 (a tool call and an approval request are separate events).
  - codex app-server docs (https://developers.openai.com/codex/app-server, which redirects to https://learn.chatgpt.com/docs/app-server):
    - the command approval "includes `itemId`, `threadId`, `turnId`, optional `reason`, optional `command`, optional `cwd`";
    - the file-change approval "includes `itemId`, `threadId`, `turnId`, optional `reason`, and optional `grantRoot`";
    - before it, `item/started` "emits a `fileChange` item with proposed `changes`".
  - ACP (https://agentclientprotocol.com/protocol/tool-calls): the request's `toolCall` is "The tool call update containing details about the operation", and "All fields except `toolCallId` are optional in updates".
  - Spike S5 ran claude live, and took codex from its schema and grok from its docs (issue-63-comments.md:109-112). S6 left grok's pending-permission case untested (:143).
  fix:
  - WSP-8 :493: "An approval request is the one exception: what its card shows (the command or tool input, a file change's diff, its title and reason, and its options) reaches the mod whole, from whichever of the CLI's messages carries it, such as codex's `item/started` item or grok's `tool_call` update, and the card shows it word for word (CH-6, →M2)…".
  - M2-AC2 :743: "For claude, codex and grok, a request whose command holds `GH_TOKEN=…` and a `Bearer` value, and a file change whose diff holds them, is shown with both whole…".

FC3-5 (R-M1-73, broke)
- severity: P3
  type: contradiction
  location: WSP-8 (v2@b6f4315.md:493); CH-1 (:289); CH-6 (:334); PO-8 (:274); M2-AC2 (:743)
  claim: WSP-8 now calls the approval request "the one exception", so a CLI's error and a denial agy reports reach the mod redacted. CH-1, CH-6, PO-8 and M2-AC2 promise them word for word, and M2-AC2 now cites WSP-8 right beside that promise.
  scenario: agy reports a denial whose input holds `api_key=…`. M2-AC2 says it is shown word for word; WSP-8 says it is shown as `api_key=[redacted]`. A test written to either text fails the other.
  evidence: CH-1 :289 ("Each keeps the CLI's message word for word"); CH-6 :334; PO-8 :274; M2-AC2 :743. CH-1 :291 already says "recorded word for word, redacted (WSP-8)" for an unparseable line.
  fix: CH-1 :289, CH-6 :334, PO-8 :274 and M2-AC2 :743 say "word for word, redacted (WSP-8)", as CH-1 :291 does.

FC3-6 (R-M1-73, half done)
- severity: P3
  type: gap
  location: WSP-8 (v2@b6f4315.md:493-494); PO-4 (:218); VER-6 (:649)
  claim: The repair makes the mod redact an approval request wherever it reaches Claude. But WSP-8's first kind includes each soldier credential, which the post office makes (PO-4) and nothing gives the mod, so the mod's `redact()` can't match one.
  scenario: From M5, `/decisions` prints a request whose input holds a soldier's credential in a form that kinds two to five don't match, and it reaches Claude whole.
  evidence: WSP-8 :494 (the first kind); PO-4 :218 and :222; VER-6 :649 (`redact()` "in the post office and in the mod").
  fix: WSP-8 :493: "…the post office sends them twice, whole for the card and redacted for anything that reaches Claude, as when `/decisions` prints them (HOST-14, →M5)". The mod then never needs a soldier's credential.
