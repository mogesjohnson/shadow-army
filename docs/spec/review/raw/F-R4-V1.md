# F-R4-V1: verdicts on R-F-157 and R-F-158 (spec-verifier, Sonnet, medium; 2026-10-28, session 15)

Packet `batches/F-R4-V1.md`. All line numbers are v0.20 (`v2@4f481fc.md`). Result: both CONFIRMED; R-F-158 moves down to P3.

```
- id: R-F-157
  verdict: CONFIRMED
  severity: P2 (kept; wording contradiction, testable ACs disagree)
  evidence: v0.20 line 91 (glossary: transcript line is not added to Claude's conversation unless its requirement says so); line 188 (HOST-11: only the summary card and MSG-7's line go into Claude's conversation; "the other rows are for the owner only"); line 643 (MSG-9: "Claude's transcript gets one line, so Claude knows the turn was stopped"); line 647 (MSG-10: "Claude's transcript gets one line saying it was cancelled or changed"); line 646 ("Claude gets no line"); line 1225 (M3-AC3 "Claude gets one line"); line 1226 (M3-AC4 "adds one line to Claude's transcript (MSG-7)", while MSG-7 at line 633 says Claude's conversation); line 1237 (M3-AC10 "Claude gets one line for its own briefs"). No ledger row duplicates it (ledger.md:196 is the finding itself). Not in settled items or R-F-4/46/69/108/138/141/142. Nothing in v0.20 repairs it. The glossary repair (R-F-151) did not reach these lines.
  reason: v0.20 still words MSG-9, MSG-10 and three M3 ACs as reaching Claude while HOST-11 and the glossary say those rows are owner-only, so the reading and the test differ. The fix below picks the reading MSG-9 states ("so Claude knows"). If the owner wants owner-only, that is a product choice.
  fix: |
    1. Line 188, replace with: "Of these, the summary card, MSG-7's line, MSG-9's stop line and MSG-10's cancel-or-change line also go into Claude's conversation (MSG-5, MSG-7, MSG-9, MSG-10); the other rows are for the owner only."
    2. Line 643, replace with: "Claude's conversation gets one line, so Claude knows the turn was stopped. Claude's transcript shows it too."
    3. Line 647, replace with: "When the message was Claude's brief, Claude's conversation gets one line saying it was cancelled or changed. Claude's transcript shows it too."
    4. Line 1225 (M3-AC3), replace "Claude gets one line" with "Claude's transcript gets one line (a notice row, not in Claude's conversation: HOST-11)". This is the soldier-to-soldier row, which HOST-11:187-188 keeps owner-only.
    5. Line 1226 (M3-AC4), replace "adds one line to Claude's transcript (MSG-7)" with "adds one line to Claude's transcript and to Claude's conversation (MSG-7)".
    6. Line 1237 (M3-AC10), replace "Claude gets one line for its own briefs" with "Claude's conversation gets one line for its own briefs", and "Claude gets no line" with "Claude's conversation gets no line".
    (Line 1225 is also the place to add the M3-AC9 check: line 1236, "the message ends as interrupted", add "and Claude's conversation gets one line (MSG-9)".)

- id: R-F-158
  verdict: CONFIRMED
  severity: P3 (was P2: the text already says "counts as the post office's ... join the same count" (1005) and M1-AC21 says "VER-6's count includes the helper's C, the Windows script and the DLL's C#" (1161). A reader can reach the pooled reading, so the harm is a wording gap, not a contradiction. The per-language reading comes only from "keeps the same bars".)
  evidence: v0.20 line 1000 (the 85% bar is "counted over the three systems' runs together"); line 1005 ("keeps the same bars through that language's own coverage tool"; "The containment helper's C counts as the post office's ... and join the same count"; "The Windows script counts the same way, and so does the DLL's C#"; "No code is left out of the count, and neither bar is lowered"); line 1161 (M1-AC21). Settled "Coverage": 85% combined, no code excluded. Ledger R-F-138 (refuted) and R-M1-100 concern how the script and C# are measured, not pooling versus per-language, so this is not a duplicate. No D-1 to D-34 decision settles it.
  reason: The sentence says both "same bars through its own tool" and "join the same count", and a CI implementer could gate per language or pooled. The fix states the pooled reading the rest of the text already implies (1005, 1161). If the owner wants a floor for the C helper, that is a separate owner decision, which is the per-language alternative below.
  fix: |
    Line 1005, replace "keeps the same bars through that language's own coverage tool, counted over the systems it runs on (VER-2)" with "is measured by that language's own coverage tool, counted over the systems it runs on (VER-2), and its lines join the post office's or the channels' one count; no language has a bar of its own".
    Optional, after "No code is left out of the count" at 1005, add: "A language with few lines can fall below 85% alone while the count holds; PO-17's tests, not this bar, are what check the helper's containment."
    Alternative, only if the owner chooses it: "Each language's code also keeps 85% line coverage on its own."
```
