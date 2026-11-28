# M1-R4-V1b: R-M1-206's second verifier (spec-verifier, Opus, high; 2026-10-28, session 15)

Packet `batches/M1-R4-V1.md` lines 3-12, judged independently of the first verifier (`raw/M1-R4-V1.md`). All line numbers are v0.20 (`v2@4f481fc.md`). Result: CONFIRMED, P1. Its fix puts the next-start finishing in a sibling bullet after PO-1 227, not under the 222 heading, whose reason line would be wrong after a clean shutdown.

```
- id: R-M1-206
  verdict: CONFIRMED
  severity: P1 (stays P1). It takes one benign or hostile `git config` call to bypass Appendix D row 6's "detected" claim. A benign trigger is common: an `npm install` whose `prepare` script sets `core.hooksPath`, as husky does, writes the shared config from inside a snapshot.
  evidence: v0.20 (v2@4f481fc.md). WSP-10 781: the guard's git commands are harness git. 789: the state is compared "before and after each command", so the guard's first command finds the soldier's config change and does not run. 790: "In M1 ... harness git stays held until the post office restarts". 791: "A turn that needs harness git to finish ends interrupted ... Once harness git goes on, that turn's guard and audit run before anything else". WSP-11 802: "A snapshot is removed only after its writes are reported", and writes are found "when the turn's guard closes". 803: the baseline "is removed once the turn's guard has closed". PO-7 275-282: a clean shutdown, a lease end included, closes every channel and exits. PO-1 222-227: next-start finishing applies only "After a post office that didn't close its channels". 797-801 cover only another army's snapshots. Contrast WSP-12 847, where a pending revert "outlives the post office however that ends, a shutdown (PO-7) or a mod reload included"; the guard and the snapshot report have no such rule. Row 6 (1798) claims "detected". Residual 7 (1821) covers only the race between check and use. Residual 12 (1831) covers a rewritten baseline, not a guard that never runs. settled.md, docs/adr/, D-1 to D-34 and the refuted or parked rows have nothing on this. M1-AC11 1103 tests the close-after-write report only with harness git running. Not a gap: a mod reload or kill (274) leaves channels unclosed, so 222-227 apply. A crash restart while the hold lasts starts nothing (791; 751) and is no crash (PO-1 215).
  reason: In M1 only a post office restart lifts the hold, and after a clean shutdown no requirement makes the next post office close the deferred guard or report and remove the left snapshot, so the soldier's checkout edit is never reported and a full snapshot stays orphaned in ~/.shadow-army/snapshots/.
```

Fix (v0.20 line numbers):

1. WSP-10 791. After "Once harness git goes on, that turn's guard and audit run before anything else (PO-8, →M2).", add:
"Such a turn keeps its guard's baseline (WSP-11), and its snapshot stays until its writes are reported. The soldier's log records that the turn's guard and the snapshot's report are waiting on harness git, and records each again once it has run (PO-5). So they outlive the post office however it ends, a shutdown (PO-7) or a mod reload included. A post office that shuts down with one still waiting names each in its log and in one line in Claude's transcript, as in `Iron's turn at 14:02 not checked: harness git held · checked at the next start`. Before it opens any channel, a later post office finishes each one of this army's as PO-1 says."

2. PO-1, after the bullet at 227, add a sibling bullet at the same level. It goes there, and the 222 heading stays as it is, because bullet 224's reason `the post office stopped unexpectedly` would be wrong after a clean shutdown:
"- However the last one ended, a shutdown (PO-7) included, a turn whose guard, or a snapshot whose report, its log records as waiting on harness git (WSP-10) is finished the same way: the guard is closed against its baseline as the first bullet says, and the snapshot's writes are reported and the snapshot removed as the bullet above says. The line says why, as in `Iron's turn at 14:02 checked at this start: harness git was held`."

3. Optional. In Appendix D row 6 (1798), add "WSP-10" to its requirement list so the row cites the rule it depends on.

M1-AC10 case. Add a new bullet after 1091:
"- a fake claude soldier at `auto` changes the shared config and edits a tracked checkout file by absolute path in one turn. Harness git is held, and Claude's transcript says so. The fake Claude Code process then ends, and the shutdown's transcript line names the turn not checked. Before it opens any channel, the next use's post office closes that turn's guard against its baseline, gives the checkout file in one transcript line, reports the snapshot's writes, and removes the snapshot. With the post office killed instead of shut down, the outcome is the same;"

A related point outside this finding, for the orchestrator to judge: under 790 and 784, the restart that lifts the M1 hold trusts the config as it stands at the new start. A `filter.*` driver the soldier added then counts as the owner's and runs in harness git, including the deferred guard this fix adds. Check whether a ledger row already covers that before raising it.

Files: C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@4f481fc.md; C:\Users\johns\projects\AIConnections-review\docs\spec\review\batches\M1-R4-V1.md (lines 3-12); C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\M1-R4-V1.md (first verifier, lines 6-15).
