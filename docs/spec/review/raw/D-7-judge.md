# D-7 judge over options A and C (spec-verifier). Judged against v2@e7c33b4.md (spec v0.10), 2026-10-17; cut off by the usage limit once and resumed in the same session.

Abbreviations: **A** = C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-7-option-A.md; **C** = C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-7-option-C.md; **v2.md** = v0.10, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@e7c33b4.md; settled.md and decisions.md are under C:\Users\johns\projects\AIConnections-review\docs\spec\review\.

## Scores

| # | Criterion | A | C | Basis |
|---|---|---|---|---|
| 1 | Safety and security | 4 | 4 | Both have the same NEW-2 revert and the same guard. C also blocks writes outside the worktree during a codex read-only turn at `full`, but only after fixtures have been recorded on each system. A depends on no vendor mode. |
| 2 | Goals G1-G7 and settled decisions | 4 | 3 | A keeps every soldier that can't write in a snapshot under auto and full, and leaves the autonomy's flags alone (settled.md:40-41, ADR-0010:11). C gives a codex non-writer at `full` a worktree instead (C:51) and narrows `full` turn by turn, which v1 never did at auto or full (src/adapters/codex.ts:13-16, claude.ts:15-18). C's mode switches may also cool the cache (G5). |
| 3 | Failure outcomes (seven simulations) | 4 | 3 | Both define what happens on a stop, a crash mid tool call, a post-office death, held harness git and a failed revert. C adds a mode request that can be refused or time out, and an unknown cache effect at each switch (simulation 5; C:467, C:469). |
| 4 | Enterprise readiness | 4 | 3 | C needs a table per CLI version and fixtures recorded again on every system after each CLI update. Under C, whether a codex non-writer gets a worktree or a snapshot changes with the codex version. |
| 5 | Cost to the owner | 4 | 2 | Both need the same card. C adds full-mode recordings on three systems, which only the owner may run (settled.md:42), five more probes, and codex read-only turns whose test runs fail (C:29). |
| 6 | Effort to build | 3 | 2 | NEW-2 is most of the work in both. C adds per-CLI tables, three switching paths, a timeout path and SES-6 rules. |
| 7 | How easily undone | 4 | 3 | A is the smaller commitment, and C's mode layer can still be added on top of A later. |

No reviewer has tested either draft (the record goes straight from the drafts to this judge). The scores rest on the drafts, v0.10, v1's code, and the vendor docs I checked: https://learn.chatgpt.com/docs/app-server (turn/start overrides "become the defaults for later turns on the same thread"), https://learn.chatgpt.com/docs/sandboxing and https://docs.x.ai/build/features/permissions (grok's plan mode limits only edit tools). The fact that claude's plan mode runs classifier-approved commands comes from D-16's record (decisions.md:328).

## Recommendation: A

1. **A carries the settled rule as it stands.** Every soldier that can't write stays in a throwaway snapshot under auto and full, and every vendor flag stays the one the owner's autonomy level chose (settled.md:40-41; ADR-0010:11). C replaces the snapshot with a worktree for a codex non-writer at `full`, and lets a turn's kind narrow `full` at every level. v1 never did that above supervised, and F-V6 flagged it as possibly "adding a vendor safeguard".
2. **C's extra layer buys almost nothing for its cost.** As C itself is drafted, the only read-only mode that can hold is codex's `readOnly` at `full` (C:34), and even that only after fixture recordings on every system. Those recordings are full-mode runs, which only the owner may make. Every claude, grok and agy turn runs exactly as under A. Meanwhile C adds version tables, three switching paths, a new failure path, unknown cache effects, and codex read-only turns whose test runs fail.

## What v0.10 already covers or contradicts

**A, already covered by v0.10.** Take v0.10's text and drop A's version of:
- the snapshot's place outside the folder (v2.md:511);
- writes found and reported when each turn is over, and discarded before the next one; a moved HEAD counts as a write (:507, :514);
- a restart's old snapshot reported, then removed (:512);
- the snapshots a dead post office left (PO-1 :209);
- each snapshot logged with its commit (PO-5 :227);
- harness git trusting only the metadata of the snapshot or worktree its own command made or removed (:507; ARM-6 :470, :474);
- Shadow Army's own folders and `.shadow/v2/` not being the checkout (:515);
- no start while harness git is held (:509);
- most of A's additions to M1-AC11 (:728-733).

**A, contradicted by v0.10.** Do not merge these as drafted (ledger rows R-M1-70 and R-M1-76 already note this):
- snapshots under `.shadow/v2/` (A:259, A:330);
- A's WSP-10 exemption for "what git writes in their metadata as a soldier or harness git works in them, such as HEAD, the index and logs" (A:251). v0.10's :507 says metadata is only `gitdir`, `commondir` and `config.worktree`, trusted only for the snapshot or worktree its own command made or removed, and checks HEAD against the commit it expects;
- ARM-6's "less what WSP-10 exempts" (A:213), against :470;
- A's PO-1 paragraph (A:107-113): in v0.10, :205-209 is a list, so it becomes one bullet.

**A, still needed (v0.10 has none of it):**
- NEW-1 and NEW-2;
- ARM-5's definition of a writing turn, and ARM-2's refusal for `write: false`;
- the lines for WSP-1, WSP-2 and WSP-4 (GUARD-6);
- the lines for HOST-14, MSG-3, MSG-4, MSG-9 and MSG-11;
- the glossary entries, with R-F-58's wording for Autonomy;
- §5.1, and M6-AC9 to M6-AC12, with M6-AC9's place corrected.

**A, an optional refinement (technical).** Report only paths git doesn't ignore plus the paths ARM-6 hashes, and discard other ignored output without a report (A:266, from 2.0 WS-3). v0.10 reports every file written (:514).

**C.** Its ARM-6 trusted record (C:273) and "as WSP-10 defines it" (C:266) are already v0.10's :474 and :470, and its WSP-11 follows :511. Nothing in C contradicts v0.10 apart from its own policy changes to CH-2 (:297) and CH-7 (:337).

## Parts of C the winner should take

1. **The between-turn mode switch, at supervised only** (this is the fix for finding 2 below):
   - setting the mode between turns, and failing safe when that fails (C:35-41);
   - CH-2 (C:166), CH-3 (C:170), CH-4 (C:173), and SES-6's "permission mode" (C:227);
   - not the holding table.
2. **NEW-2 details A lacks:**
   - the start state is flushed to disk and kept outside any worktree or snapshot until the revert has run, and it records the worktree's ignore rules (C:64-68);
   - nothing is sent while harness git is held (C:70);
   - C:72's explicit statement that a turn the CLI starts by itself also reverts an edit the owner made after the last finished turn.
3. **Merge points onto v0.10:**
   - WSP-11 keeps v0.10's text and only extends its first line to M6's snapshot soldiers (C:299);
   - PO-1 gets one bullet (C:133-136);
   - WSP-4's "a HEAD that moved during its read-only turn is a write there" (C:292).
4. **The approval-card line** `read-only turn: whatever this writes is reverted` (C:46).
5. **ACs:**
   - C's M6-AC10 setup and checks (C:357-370);
   - M6-AC12's claude case at `~/.shadow-army/snapshots/` (C:379);
   - M6-AC9's supervised cases (C:350-351, C:354), once part 1 is taken.

Leave out:
- C's NEW-1 holding table and its read-only modes at auto and full;
- NEW-3's worktree for a codex non-writer;
- CH-7's "a turn's kind also chooses" at every level;
- C:159, which makes a turn the CLI starts by itself read-only. A's rule, that such a turn takes its message's kind (A:194), matches v2.md:280.

## Findings against A

```
- severity: P2
  type: contradiction
  location: NEW-1 and WSP-11 as drafted (A:11, A:265); WSP-6 (docs/spec/v2.md:491); ARM-6 (docs/spec/v2.md:467)
  claim: A non-writer's snapshot is made "of its base, the folder as it is when the session opens" and put back "as it was made" after every turn, so no later brief in that long-lived session sees work applied to the folder after it opened.
  scenario: a review-only claude soldier at auto opens its session at 10:00; at 11:00 the owner runs /apply on Iron's work and the Monarch sends the reviewer a review brief -> it reviews the 10:00 tree; agy's research and test briefs (ARM-6) go the same way.
  evidence: A:11; A:265; v2.md:491 "follow-up work sees changes applied earlier"; SES-1 v2.md:416; C has the same text (C:52, C:299) and lists it as open (C:485).
  fix: in NEW-1, WSP-11's M6 sentence and ARM-6: "Before each turn's message goes in, harness git (WSP-10) brings the snapshot to the soldier's base as WSP-6 defines it then, in the same folder, so the paths in the session's history still hold; the post office logs the commit (PO-5), and that is the HEAD WSP-10 expects there."

- severity: P2
  type: ambiguity
  location: CH-7 bullet as drafted (A:134); CH-2 (docs/spec/v2.md:297); ARM-5 (docs/spec/v2.md:465)
  claim: "No adapter passes, drops or switches a vendor flag or mode to enforce it" can be read to forbid the per-turn mode CH-2 already gives a supervised writing turn, which R-M1-24's fix left to ARM-5; A gives no way to change a live session's mode between turns.
  scenario: reading 1: a supervised claude builder keeps one mode for its session: in plan, every build turn stalls until the owner approves leaving plan mode; in acceptEdits, its review turns edit without asking, and a supervised codex builder's reviews run in workspace-write where v1 passed read-only. Reading 2: the adapter switches per turn, through a request no line names, with no outcome defined for a refusal.
  evidence: v2.md:297 "plan for supervised, or acceptEdits for a writing turn (ARM-5, →M6)"; ledger R-M1-24 "a supervised writer's mode with ARM-5 (→M6)"; A:414 leaves it open; src/adapters/claude.ts:20, codex.ts:18; https://learn.chatgpt.com/docs/app-server; setPermissionMode() at https://code.claude.com/docs/en/agent-sdk/permissions (C:449).
  fix: "The read-only rule never depends on a vendor's mode: it holds whatever mode the CLI runs in. At supervised, each turn runs in the mode its autonomy and kind choose, as v1's flags do (CH-2; CH-3 to CH-5, →M2), set between turns: claude through the stream-json control request behind the Agent SDK's setPermissionMode(), codex in every turn/start's sandboxPolicy, grok through ACP's session/set_mode. A message goes in only once the CLI has answered; a refusal, or no answer within 10 seconds, keeps it queued with the reason and holds the queue (MSG-3)." Add SES-6's "permission mode" (C:227). Which mode a supervised read-only claude turn uses stays D-16's.

- severity: P2
  type: gap
  location: NEW-2, the start state (A:25-29, A:37); PO-5 (docs/spec/v2.md:227); WSP-11 (docs/spec/v2.md:515)
  claim: The revert restores the builder's uncommitted files from copies that the audited turn itself can rewrite, since they are files the soldier's user can write and nothing checks them before use.
  scenario: Bellion (review and build, v2.md:460) set to full takes a review brief whose code carries an injected instruction; the turn rewrites the start state's copy of its uncommitted src/a.ts; the revert "restores" those bytes as Bellion's own work; its next build brief covers src/, the claim audit keeps them, and they reach /diff and /apply as built work.
  evidence: A:29 "on disk beside the guard's baseline"; A:37; v2.md:213 "Soldiers run as the same user"; v2.md:515 (.shadow/v2/ is not the checkout, so no guard watches it); C:486 leaves it to D-4.
  fix: "The post office keeps a hash of the start state in memory, and in the flushed line that opens the turn (PO-5), and checks it before the revert. A start state that doesn't match is not restored from: the revert counts as failed (queue held, /apply refused), and the soldier's log and one line in Claude's transcript say the start state changed." The guard's baseline has the same exposure; D-4's threat model should name it.
```

## Messages without a kind

Yes, this part needs a card. It changes what the owner does to get a write: the pane's field can no longer produce one, and HOST-9's "a kind only adds ARM-2's check" (v2.md:165) reverses. PLAYBOOK §14 counts both as big. The CLAUDE.md design rule "Writes need the build role and `--write`" points toward read-only, but settled.md:39 drops `--write`, and the owner's v2.1 pick made the kind a check for ARM-2, not a write gate (settled.md:30).

C has the same part, word for word in effect (C:112, C:246-248), and its drafter flagged it too (C:480). So the card is needed whichever option wins, and this part does not separate them.

A draft card for the orchestrator:

```
D-7 Which of your own messages may make a soldier write?
Options: A only a message with the kind build writes (the Monarch's build brief, or /send <soldier> --kind build); what you type in a pane, or /send without a kind, is read-only, and its writes are undone and reported; B your own message without a kind, to a soldier that can write, takes the kind of that soldier's last brief, so steering a build keeps building.
Tested: both D-7 drafts make every message without a kind read-only, as v1 kept a run read-only without --write.
Recommended: A, because every write carries a kind you or the Monarch chose, as --write did, and a question typed mid-build can't rewrite code.
Also yours to accept: what a read-only turn writes where git ignores files (build output, caches, installed packages) stays in that soldier's worktree for later turns, though never on its branch or in /apply; an edit you make in a soldier's worktree during its read-only turn is undone with it.
For you: to have a soldier write, use /send <soldier> --kind build. Can be undone: yes, one rule.
```

## Residual risk

Yes, both options need the owner to accept the same remaining risk. NEW-2 doesn't audit paths git ignores in a builder's worktree, apart from the ones ARM-6 hashes (A:34, C:82). So build output, caches and installed packages that a read-only turn writes there stay for the builder's later writing turns. The settled snapshot used to discard them. A technical step could shrink this risk before asking: the start state also lists ignored files, and the revert removes the ones the turn created and reports the ones it changed.

On the same card, both options also state two behaviors:
- an owner's edit made in the worktree during a read-only turn is reverted, and no copy is kept (A:41, C:80);
- a `.claude/` settings file that a read-only turn writes takes effect until the revert (A:44).

Not new, and for D-4 rather than this card: writes outside the snapshot, the worktree and the checkout under auto or full are caught by neither option, as in v1. That includes the home folder, other repositories, and claude's auto memory (D-19). C blocks them only for codex at full, and only once its fixtures exist. C needs no residual of its own.

## Big or technical

Choosing A over C is technical. It is an internal mechanism that carries the rule at settled.md:41 (decisions.md:205), and the read-violation reports it shows are the ones that rule already requires. The owner may overrule it in the unit's report.

Two parts are big and go on the one card above:
- every message without a kind is read-only, the owner's own included;
- accepting NEW-2's residual risk.

Apply the rest now. Had C won, its read-only-mode layer would also have been big: it narrows what the owner's `full` lets codex do, shows the owner codex's refusals and failed test runs, and rewrites the settled CH-7 wording.
