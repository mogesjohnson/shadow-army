# M1 round 1, verifier M1-V4 (records and logs): R-M1-11, R-F-13, R-M1-7, R-M1-21, R-M1-52, R-M1-6, R-M1-54. Snapshot be9deb0; v0.7 noted. Cut off by the usage limit and resumed in the same session.

- id: R-M1-11
  verdict: CONFIRMED
  severity: P1
  evidence: PO-5 183 gives only where the logs live and that writes pass through redact(). §5.1 F 490 lists "a failed log write" with no outcome. The spec's only rule about a failed write is WSP-5 403, which is about apply. settled.md and ADR-0008 to 0015 say nothing on it. Codex's draft closes the post office on any log error, then refuses every later command (C:\Users\johns\projects\AIConnections-m1\src\v2\postOffice.ts:71 and 79-83). PLAYBOOK §5's severity table rates "a failure simulation with no defined outcome" as P1, and §10.3 says "Every failure simulation has an outcome". The controls the spec enforces are the guard and the claim audit (CLAUDE.md design rules), not the logs. R-M1-29 and R-F-34 are already recorded as its duplicates. v0.7: unchanged (PO-5 210, §5.1 F 558).
  reason: As written, the F case can neither pass nor fail, and both readings fit the text: the draft ends every turn, while the other reading leaves gaps and torn lines. Carrying on is the clearly sensible outcome, because a log enforces nothing. The delivery record that MSG-4 relies on is R-F-13's.
  fix: PO-5 becomes (M1; U, F) and adds: "A log never stops a soldier or a turn. A write that fails is tried once more. If that fails too, the post office carries on and reports it once on the event stream, and Claude's transcript gets one line, as in `Shadow Army: logs not written · disk full`. Each later write tries again, and the first line written after a gap says how many lines were lost. A line cut short by a failed write is ended before the next one, and a reader skips any line that doesn't parse." §5.1 F 490 reads: "a failed log write: the turn goes on, the failure is reported once, and the log resumes with the count of lost lines". M1-AC4 adds: "log writes fail in the middle of a turn; the turn completes, one line reports it, and the log resumes once writes succeed". Codex's draft is told to match (postOffice.ts:79-83).

- id: R-F-13
  verdict: CONFIRMED
  severity: P2 (was P1). The failed log write is R-M1-11's P1. MSG-4 303 already rules out reading B's "deliver anyway", because the record must come before the CLI write. What remains is narrower, and it is M3 text (MSG-4, PO-6):
    - Nothing requires the record to reach the disk first. After a machine crash or power loss, the message then reads "not delivered … safe to send again" (298, 301), and r sends it twice.
    - A message whose record can't be written has no state.
  evidence: MSG-4 303, 298, 301; PO-6 184 (M3); PO-5 183; §5.1 F 490; PLAYBOOK §10.3 ("no double sends (MSG-4)"). Codex's draft appends with no flush (C:\Users\johns\projects\AIConnections-m1\src\v2\logs.ts:76) and closes the post office on a failed write (postOffice.ts:79-83). On the snapshot part: v0.7 WSP-10 451 covers only a soldier whose snapshot waits on held harness git, and where M1's soldiers run is R-M1-23 (pending, M1-V6). v0.7: MSG-4 unchanged (332).
  reason: Apart from its log half (R-M1-11), the finding is real. MSG-4's promise never to repeat a send needs the "delivered" record on disk before the message goes to the CLI, and it needs a stated outcome when that record can't be written.
  fix:
    - MSG-4 303 reads: "The post office records a message as delivered, and flushes the record to disk, before it writes the message to the CLI. A crash between the two, the machine's included, can then only lose a send, which shows as interrupted, and never repeat one. If the record can't be written, the message isn't sent: it stays queued, and its row says why, as in `waits · records can't be written · disk full`. A record line cut off by a crash is skipped when the records are read; because of the flush, its message never reached the CLI."
    - §5.1 F adds: "a record that can't be written as its message is about to go, and a record line cut off by a crash". PO-6 gains F, with an M3 AC.
    - HOST-11 (M3): when a report can't be written, the card says `report not saved · <reason>` in place of its path.
    - The snapshot part goes with R-M1-23.

- id: R-M1-7
  verdict: CONFIRMED
  severity: P1 (was P2). This settles the severity question left open by R-M1-28, its recorded duplicate. As written, SEC-4 can be neither met nor tested. M1-AC2 cites it (547) and passes while it fails, which is PLAYBOOK §5's own P1 example. The gap is concrete: Codex's redact() lets this finding's own example, `AWS_SECRET_ACCESS_KEY=…`, through unredacted. Its name pattern wants `=` straight after `SECRET`, so a name that runs on past it is missed (C:\Users\johns\projects\AIConnections-m1\src\v2\logs.ts:30).
  evidence: SEC-4 419 and WSP-8 409. 2.0 SAFE-6 (legacy 1035) names no patterns either, and v1's src\ has no redact() to inherit. VER-6 509 wants every branch of redact() covered without saying what it must match. §5.1 X 474 says only "Logs are redacted". M1-AC2 547 checks only the Monarch's credential. v0.7: unchanged (WSP-8 439, SEC-4 458).
  reason: Pattern-based redaction can't keep every secret out. So SEC-4 should promise exactly what redact() matches, WSP-8 should name that set, and D-4's threat model should state the remaining risk.
  fix:
    - WSP-8 adds: "It replaces with `[redacted]`: the Monarch's secret and each soldier credential, in any letter case; a `Bearer` token and an `Authorization` header's value; a private key block, from its `-----BEGIN` line to its `-----END` line; a key that starts `sk-` (`sk-ant-` included) or GitHub's `ghp_`, `gho_`, `ghu_`, `ghs_` or `ghr_`, followed by at least 12 more letters, digits, `-` or `_`; and the value given to a name that ends in `key`, `token`, `secret`, `password` or `credential`, in any case, with or without `_` or `-`, as in `AWS_SECRET_ACCESS_KEY=…` or `"access_token": "…"`. A count such as `input_tokens` is kept."
    - SEC-4 reads: "Logs and records hold nothing that `redact()` matches (WSP-8). A test writes each kind and finds none of it in a log or a record. A secret of another form that a soldier quotes isn't recognized, and can be written."
    - D-4 lists that remaining risk for the owner.

- id: R-M1-21
  verdict: CONFIRMED
  severity: P2
  evidence:
    - The spec: PO-5 183 says "Every write passes through redact()", and SEC-4 419 says logs hold no secret. CH-1 218 names the events but not whether text arrives whole or in pieces. CH-2 222-224 doesn't close claude's flag list (R-M1-24's fix adds `--permission-mode`).
    - claude: https://code.claude.com/docs/en/cli-reference documents `--include-partial-messages`: "Include partial streaming events in output. Requires --print and --output-format stream-json".
    - grok (CH-4): ACP sends a reply only as `agent_message_chunk` updates, with no whole-message event (https://agentclientprotocol.com/protocol/prompt-turn). For grok, pieces are the only form.
    - codex: it streams `item/agentMessage/delta` before `item/completed` (https://developers.openai.com/codex/app-server).
    - Codex's draft passes the flag (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:33) and emits every frame and every text delta as an event (claude.ts:142, 198-201). postOffice.ts:74-78 and 143-145 then redact and log each event on its own, and its key pattern needs 12 characters in a single string (logs.ts:29).
    - v0.7: unchanged (PO-5 210).
  reason: Redacting each write separately can't catch a secret split across fragments. The text doesn't say whether a log holds fragments, and for grok they are the only form its text arrives in.
  fix: PO-5 adds: "A log holds each message, thinking block, tool call and tool result whole. The fragments a CLI streams are joined first, and `redact()` runs on the joined text. When a turn ends before a message is whole, what was joined so far is written." M1-AC2 adds: "a key that a fake claude streams across three fragments appears in no log". Apply together with R-M1-7.

- id: R-M1-52
  verdict: CONFIRMED
  severity: P2
  evidence:
    - What the spec says: PO-5 183 and WSP-8 409 set no format, file name or retention. §0 31 makes the 2.0 text "the reference for their detail, unless this spec restates it". 2.0 SAFE-6 (legacy 1035) covers "logs, events, briefs, reports and fixtures" and prunes logs after 30 days, while WSP-8 restates only "logs, records and briefs". Both readings fit.
    - The ledger already sends this question here: R-F-32's resolution says "WSP-8 settles SAFE-6's pruning and report redaction with R-M1-52".
    - Already covered: fixtures, by VER-4 505.
    - Elsewhere the spec keeps logs: SES-5 351 ("keeps its log"), and Appendix C's H35 row, 835 ("PO-5 keeps logs").
    - The size limit is D-5's (R-F-7; H62 937, after v2.0).
    - PLAYBOOK §10.2 asks how long data is kept and how the owner deletes it.
    - Codex's draft writes `<name>.jsonl`, with one `post-office.jsonl` across all starts (C:\Users\johns\projects\AIConnections-m1\src\v2\logs.ts:55-85). It redacts each event before the mod gets it (postOffice.ts:75-76).
  v0.7: not fixed. Its §0 31 now applies a source's detail "where this spec says nothing on the point", which brings the 30-day pruning in.
  reason: Two answers depend on how §0 31 meets WSP-8's narrower list: whether logs are pruned after 30 days, and whether events and reports are redacted. The log files also have no stated form, which R-M1-11's line rule and OBS-1 both rely on.
  fix:
    - PO-5 adds: "Logs are JSON Lines: one file per soldier session, named by the soldier and the session id, and one per start of the post office, named by its start time."
    - WSP-8 reads: "`redact()` runs on every write to logs, records (reports included) and briefs, and on every event the post office sends the mod, where each streamed fragment is redacted on its own (from 2.0 SAFE-6; fixtures are redacted as VER-4 says). 2.0's pruning after 30 days is not carried: logs are kept until the owner deletes them."
    - The size limit, and whether logs expire, go on D-5's card.
    - Apply together with R-M1-7 and R-M1-21.

- id: R-M1-6
  verdict: CONFIRMED
  severity: P2
  evidence:
    - The gap: nothing in the spec covers control, escape, bidirectional or invisible characters, as H25's rows at 781 and 1026 say. 2.0 SAFE-7 (legacy 1036) did.
    - Why Appendix A doesn't list it: ADR-0013 names `redact()` among the carry-overs but not SAFE-7, so Appendix A (722-741) is right to leave it out. SAFE-7 was dropped with ADR-0013, and nothing replaced it.
    - The strongest case is CH-6 243, which shows each approval request "word for word". A bidirectional control can make a command read differently from the one that runs.
    - Claude Code's own check: the mod typings allow only tab and newline as control characters in a Markdown's or Code's text, and say a tree that breaks this check "is refused" (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\evidence\mod-api-2.1.294\claude-code.d.ts 1621-1622, 5678-5679, 9518-9519, 9529-9530). So a soldier's ESC gets the mod's card or pane refused rather than rewriting the terminal, while bidirectional and zero-width characters still draw.
    - Codex's draft puts soldier error data in the transcript through JSON.stringify (C:\Users\johns\projects\AIConnections-m1\plugins\shadow-army\hooks\register.ts:128-129). That escapes C0 controls but not C1 or bidirectional ones.
    - PLAYBOOK §14 classes H25 as technical, and §10.1 asks for display safety (H25).
    - R-F-6 is already recorded as its duplicate.
    - v0.7: unchanged (Appendix A 804-825, H25 866).
  reason: The gap is real and the 2.0 text to restore it exists. H25 is technical by PLAYBOOK §14, as H48 was for R-F-1, so the review can write it in without an owner question; this touches Appendix C item H25. The harm is narrower than the finding claims: a refused card or pane, and spoofed text, rather than a rewritten terminal.
  fix:
    - A new SEC requirement, (M1; U, X); SEC-6 is free in v0.7: "**Text the mod shows.** In text from a soldier, a CLI or a config file, each character of Unicode's control (Cc) and format (Cf) categories, except newline and tab, shows as a visible placeholder such as `\u{1b}` or `\u{202e}` wherever the mod draws it, and reaches Claude escaped the same way (from 2.0 SAFE-7). That covers ESC, and so every escape sequence, as well as the bidirectional controls and the zero-width characters. Every other character is kept, so an approval request is still shown word for word (CH-6). A test draws a line holding each kind and finds only placeholders."
    - Appendix A adds `SEC-6 | 2.0 SAFE-7`.
    - M1's Implements line and an M1 AC (the mod's transcript lines) name it, and M3's and M5's ACs add the summary card, the pane and the approval card.
    - Appendix C's H25 becomes Same.

- id: R-M1-54
  verdict: REFUTED
  severity: P3
  evidence: PO-2 169 names the accepted addresses, "(127.0.0.1 or ::1)", and refuses "any other address", which includes `localhost`, `127.0.0.2` and `::ffff:127.0.0.1`. Having no setting is by design: the non-goal at §1 51 is "Any service reachable from the network", and ADR-0012 says any other address is refused at start. SEC-1 416 and M1-AC1 546 test that guard, which an X test reaches through the post office's own start option. Codex's draft reads PO-2 the same way, accepting exactly `127.0.0.1` or `::1` (C:\Users\johns\projects\AIConnections-m1\src\v2\server.ts:40-41). v0.7: unchanged (PO-2 196).
  reason: The accepted strings are listed and every other string is refused, so the text has one reading. A guard that no setting can reach is a backstop, not a gap.
