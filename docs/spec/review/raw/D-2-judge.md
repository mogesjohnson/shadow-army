# D-2 judge: the lease timing, option A (the owner's 10 s / 30 s) against B (Codex's 5 s / 20 s). Recommends A, technical.

**Scores** (1 to 5, criteria in the task's order; a lower criterion only breaks ties)

| # | Criterion | A (10 s / 30 s) | B (5 s / 20 s) | Why |
|---|---|---|---|---|
| 1 | Safety and security | **5** | **4** | Both drafts count only the post office's own running time, in 1 s checks. So sleep and post-office stalls end neither lease: 0 lapses, against 216/216 and 498–1000/1000 under `lease.ts`'s count (results.txt 11, 19-20). With that measurement, A gives more room before a false expiry, which cuts every soldier's turn and queue. It always survives a 20 s Claude Code stall; B's limit is 15 s, and it sits right on it (results.txt 13, 157). After a wake A leaves the mod about 15 s to renew; B leaves about 12–13 s (A 158, B 119). A's test also covers the defect in Codex's build: a renewal handled before the first check after a wake must still renew (A 55). With a strict renew, 36 of 36 sleeps lapse (results.txt 66; `lease.ts` 34-49, `server.ts` 73). B's tests don't cover this. B's gains: a dead Monarch that the watch misses is cleaned up 5–10 s sooner (mean 17.5 s against 25 s, max 20 s against 30 s; results.txt 21). It also survives two lost renewals in a row where A survives one (results.txt 166-174). Neither option changes a trust boundary. |
| 2 | Owner's goals and settled decisions | **5** | **2** | A is settled decision 1 (settled.md 22), and the prototype found that it holds up (D-2-prototype.md 69). B reverses that decision without showing that 10 s / 30 s fails, so it needs a decision card (decisions.md 38; PLAYBOOK 338, 347). That goes against "I will only answer big questions" (settled.md 32). B 56 and B 64 also reach into D-11 and H38. |
| 3 | Failure outcomes | **4** | **3** | See the seven simulations below. Beyond them: A's tests cover the order where a renewal arrives before the first check, and B's don't. B's M1-AC1 asks M1 for behaviour that comes later (B 82-83): the CLI's interrupt (CH-10, M2; v2.md 290), approval requests (CH-6, M2; v2.md 270) and how messages end (MSG-4, M3). A defers these (A 38, 116-118, 129). |
| 4 | Enterprise readiness (§10) | **4** | **3** | A: a watch with a measurable bound, and pid reuse caught by start time (A 58); the post office refuses to start without a session id (A 19); the owner sees status in the transcript, a toast and the brief rows (A 41); each test sits in the right milestone. A lacks a statement that the values are fixed, and a rule on logging renewals. B: the fixed values (B 47), bounded logging (B 62) and a real-process test (B 85) are good. But M1 can't pass its M1-AC1 as written (§10.7, every requirement testable). |
| 5 | Cost to the owner | **5** | **4** | Renewals are local and free in both (360 against 720 an hour). A needs no card; its cost is seconds. A shutdown that only the lease starts, or a reload whose post office survives (D-12 (a), decisions.md 203), waits up to 10 s longer. B costs a card on a question the prototype already answered. It also brings slightly more false expiries, and the owner re-sends interrupted turns by hand (MSG-4). |
| 6 | Effort to build | **4** | **3** | Codex rewrites the count under either option (`lease.ts` 23-49, `server.ts` 73). Codex must also stop `fail()` from ending renewals at the first error (`register.ts` 81-92, 121). A then changes two constants. A's rules for the mod are already as built: one renewal in flight (`register.ts` 119), another session refused (`lease.ts` 42-44), a session id required (`lease.ts` 15). B needs the same rewrite plus: renewals sent whether or not the last was answered, the lease ended on another session's renewal, the next start reading the last log, a SIGSTOP test harness, and M2/M3 parts pulled into M1. |
| 7 | How easily it is undone | **5** | **4** | Under A it is two constants and some text, and the value is the owner's own. B is as easy to change in code, but it comes in through a card. Its "the next start shows it once" (B 64) also adds something the owner sees, and removing that later would itself be big. |

**The seven simulations** (I walked through the drafts' text; nothing was executed. The prototype simulated the timings, not either draft's text.)
1. **Stream dies mid tool-call.**
   - When the post office's output ends, the mod stops renewing in both drafts (A 41, B 45).
   - On lost renewals, A survives one in a row and B two (results.txt 166-174). B is ahead here.
   - A soldier mid tool-call is cut short in M1 and never sent again in both (A 34 and 38; B 38).
2. **Cancel after a partial edit.** A stop sent during the shutdown is refused, with the reason (A 31, B 36). The edits stay. Same in both.
3. **Rate limit, context overflow, refusal.** Not reachable: the lease calls no model. A turn that ends this way during the shutdown ends as PO-8 says (v2.md 347).
4. **Retry after a partial success.** Renewals are idempotent. A renewal after the lease has ended is refused and doesn't bring it back (A 26, B 55). A keeps one renewal in flight (A 19). B sends each one on time regardless (B 44), so a stopped post office collects one every 5 s. A is ahead.
5. **Stale cache.** Not reachable: the lease caches nothing. The nearest case is a renewal from an earlier start; PO-3 refuses it in both, but only B says so and tests it (B 57, 87). B is ahead.
6. **Cross-model output.** Not reachable: a renewal carries only the secret and a session id.
7. **Estimated cost.** Not reachable: the lease spends no tokens.

**Recommendation: A.**
1. **It is the owner's settled 10 s / 30 s, and nothing in the evidence overturns it.** The measurement decided sleep and stalls, not the timing: both timings lapse 216 of 216 under `lease.ts`'s count and 0 under the per-check count (D-2-prototype.md 66). The prototype found that "Nothing in the 7 scenarios makes B safer against false expiry" (69). So no card is needed, and Codex is told to match A.
2. **With the shared measurement, A takes the safer side of the only trade-off the timing makes.** That trade-off is false expiries against cleanup speed:
   - A survives a 20 s Claude Code stall (B 15 s) and leaves the mod about 15 s after a wake (B about 12–13 s).
   - B's gain, cleanup 5–10 s sooner, applies only when the watch can't see the end (A 27).
   - A false expiry cuts every soldier's turn and queue. A slower cleanup costs seconds.

**What A should take from B** (beyond the parts of A that R-M1-8, R-F-11 and R-M1-10 already take):
- **Fixed values** (B 47): "The 10 and 30 seconds are fixed; no setting changes them."
- **Logging** (B 62): log when the lease starts, and never log a renewal one by one. Keep A's lines for long steps and refused renewals.
- **The release** (B 41), in three parts:
  - At `session.end` the mod MUST stop renewing before doing anything else.
  - The release names the Claude session, and one naming another session is refused. Leave out B 56's "ends the lease at once".
  - The post office answers the release at once, then shuts down. The whole `session.end` chain shares one 1.5 s bound (d.ts 10980), while a shutdown can take 30 s plus 10 s. Codex already answers first (`server.ts` 98-99).
- **Renewals from an earlier start** (B 57, with its test at B 87): such a renewal is refused, reported (PO-3), and changes nothing. This matters now that HOST-2 restarts the post office at the next use.
- **The stated residual** (B 58): a renewal naming the right session but sent after `session.end` can't be told from a live one; only the mod's stop-first rule prevents it. This belongs in D-4's threat model.
- **A real-process test** (B 85): SIGSTOP and SIGCONT on Linux and macOS while the mod renews. At A's timing the stop must be longer than 30 s, for example 40 s. A count that includes the pause then fails every time; a 25 s stop catches it only 498 times in 1000 (results.txt 19-20).
- **Test wording** (B 81, 88): "through an hour, and its log has no line for any of them", and "even when the release fails".
- **Evidence code U on PO-7** (B 24).

**What A should not take from B:**
- 5 s / 20 s.
- The 2 s cap per check. The cap trades the margin after a wake (the lease, minus the renewal period, minus the cap) against counting a slow post office's time. A's 5 s cap keeps 15 s, and either value is a technical choice.
- B 44's "each goes on time". Keep A's one renewal in flight, which is what Codex built.
- B 56, which belongs to D-11.
- B 64, which shows the owner something new; it was left optional under R-F-11.
- B 82-83, which ask M1 for M2 and M3 behaviour.
- B's "unless its turn had already ended by itself", which MSG-9 already covers (v2.md 347).

**Also for the record:**
- **Codex's mod stops renewing after one failed renewal.** `fail()` (`register.ts` 81-92), called from the renewal's catch at line 121, cancels the timer at the first error. A 19 and A 41 forbid this. As built, one lost renewal ends the army within 20 s. Add this to decisions.md 50's list of what Codex must match.
- **The prototype's K3 is not either draft's count.** K3 gives a fresh full lease after a pause (D-2-prototype.md 59; results.txt 163); the drafts count at most the cap.
  - So the margins after a wake are about 15 s (A) and 12–13 s (B), not 29.9 s and 19.9 s.
  - The prototype's 0 of 216 sleep lapses still holds for both drafts, because its first renewals came 0–3 s after waking.
  - The drafts' way is the safer one: a post office that keeps pausing still counts each pause, so a dead Monarch's lease always ends.
- **D-11 needs more than the one held-back clause.** The held-back clause (A 17) has twins in the first two sentences of A 20 and in A 59. And `session.end` itself fires with the reasons `clear` and `resume` (d.ts 10989-10995). So "at `session.end`" already ends the army at /clear, as HOST-2's "stops it when the session ends" does today. D-11's answer must cover both.
- **A gap in both drafts (technical).** Neither draft limits how long a renewal may wait, and `$.http.fetch` takes no timeout or signal (d.ts 3451, 5180-5200). Under A's one-in-flight rule, a renewal that never resolves holds back every later one.
- **Unverified, so not weighed.** B's 5 s period equals Node's documented `server.keepAliveTimeout` default of 5000 ms (https://nodejs.org/api/http.html). The same page gives 65000 ms for `createServer`'s option, so it depends on the Node version. Codex's server sets neither (`server.ts` 55-107). A's 10 s doesn't coincide with it.
- **Modern Standby.** Microsoft says the Desktop Activity Moderator "pauses all desktop applications" and lets none run "after the DAM phase completes" (https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/integrating-apps-with-modern-standby). That supports A 23 for both processes. The order inside the DAM phase isn't documented, so B 118's probe stays open.

**Kind: technical** (PLAYBOOK §14, lines 339 and 347). A keeps the owner's 10 s / 30 s. The rest is how the lease is measured and tested, and the parts taken from B are wording, logging and tests. No card is needed: record it under D-2 in decisions.md and list it in the unit's report. Adopting B 56 or B 64 would be big, so both stay out.

Files: C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-A.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\D-2-option-B.md, C:\Users\johns\projects\AIConnections-review\docs\spec\review\prototypes\D-2\results.txt, C:\Users\johns\projects\AIConnections-m1\src\v2\lease.ts, C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts, C:\Users\johns\projects\AIConnections-m1\plugins\shadow-army\hooks\register.ts, C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts
