# Spec 2.0 review flow: the rules

How the review of `docs/spec/v2.md` runs until it is the finished **Shadow Army 2.0 specification**: complete, production-ready and fit for an enterprise to deploy. The detail is in [`PLAYBOOK.md`](PLAYBOOK.md). Where the two differ, this file wins: it holds the owner's later rules.

Written 2026-10-14 by session 7ac7daad, from the owner's instructions that day.

## 1. The goal and who decides

- **The owner's words:** "constant skeptics and critical review agents … work till we have a fully built out spec 2.0 … enterprise/corporate ready, production ready … 2 agents verify the same section 2 or 3 times and so then the area is complete."
- **On decisions:** "I want this built out end to end! I will only answer big questions."
  - **Big** (the owner decides, from a short decision card with a tested recommendation): new capabilities; anything that changes what the owner sees, does or approves; money; security posture and accepting a risk; vendor terms and licensing; reversing the owner's own decisions or an accepted ADR; the spec's name; the release. When in doubt, it is big.
  - **Technical** (the agents decide by a bake-off, record it in `decisions.md`, and list it in the unit's report, where the owner may overrule it): limits, timeouts, defaults, formats, wording, internal mechanisms, how a thing is measured or tested.
  - **Trivial** (the orchestrator decides and records it): one sensible answer.
- Keep working while a card waits. Never stop between units to ask permission; report instead.

## 2. Roles

- **The orchestrator** is the session. It plans the rounds, starts the agents, writes every record, is the **only editor** of the spec, commits, and reports.
- **Agents** never edit files. Their output comes back to the orchestrator, which writes it to `raw/`.

| Agent | Type and model | Does |
|---|---|---|
| Reviewer | `spec-reviewer`, Opus, read-only (Read, Grep, Glob, WebSearch, WebFetch) | Reviews one unit through one lens; returns findings in the schema |
| Verifier | `spec-verifier`, Opus, read-only | Tries to refute findings: CONFIRMED, DECISION, DUPLICATE, REFUTED or NEEDS-PROBE |
| Sign-off | `spec-reviewer` | Reads a converged unit; PASS or FAIL |
| Fix checker | `spec-verifier` | Checks each P0 and P1 fix: FIXED or NOT FIXED, and what it broke |
| Drafter | `spec-reviewer` | Writes one option of a decision as spec text |
| Judge | `spec-verifier` | Scores a decision's options and recommends one |
| Prototype builder | `general-purpose`, **Sonnet** | Builds and runs an offline experiment in `prototypes/D-<n>/`; never calls a model or a vendor CLI |

The two definitions are in [`agents/`](agents/). On a new machine, copy them into `.claude/agents/` (keep that folder out of git, through `.git/info/exclude`).

## 3. Running agents: two at a time

- **At most two agents run at once** (the owner, 2026-10-14). Start the next one when one comes back. Order the queue so that verification and fixes of the unit nearest done come first: M1 unblocks Codex.
- The lineup stays the one round 1 used: three reviewers for each unit in round 1, verifiers for every finding, drafters, prototypes and a judge for each decision. Only the pace changes.
- **Why:** on 2026-10-14, thirteen agents at once used up a five-hour usage window in about ten minutes, three times. Every agent cut off mid-run had to be resumed later, which re-reads its whole transcript (100k–300k tokens) at full price.
- **The rate, measured:** one verifier (F-V1) alone used about 243k tokens, 68 tool calls and 16 minutes.
- **When a usage or rate limit cuts agents off:**
  - in the same session, send each one a message (SendMessage) once the limit resets; it continues from its transcript;
  - in a new session, or on another machine, they can't be resumed. Rerun them from their packets or prompts.
- Record in the ledger which agents were cut off, so nothing is silently lost.

## 4. Spending less where it is worth it

Adopted 2026-10-14, at the owner's ask ("if using less agents is smarter then skim down the number we use by a couple. only if it's worth it"). The owner may overrule any of these.

1. **D-2 (the lease) goes straight to its judge.** Its option reviews are dropped: the prototype settled the facts, and the two drafts share one mechanism. Saves about six runs.
2. **From round 2, a unit's round has two reviewers, not three.** Round 1 keeps three, for breadth. A unit still needs two clean rounds in a row and then two sign-offs (an implementer and a red team). Saves one run per round per unit.
3. **A P1's second verifier runs only when the first one CONFIRMS it or calls it a DECISION.** When the first refutes a P1, the orchestrator decides, and asks a second only if it doubts the refutation. P0s always get two.

Kept as they are, because cutting them would cost quality: three reviewers in round 1; a verifier for every finding; a fix check for every P0 and P1; two sign-offs; a judge for every bake-off; cards for big decisions.

How to keep each agent small:
- Give exact line ranges, from a frozen snapshot. Tell it to read only what it needs, and to grep big files (the archived 2.0 draft, Codex's draft, vendor typings) instead of reading them whole.
- Dedupe findings before verifying, and put overlapping findings in the same verification packet.
- Ask for findings only: no preamble, no summary.

Measured on 2026-10-14: a reviewer used 130k–330k tokens, a drafter 240k–320k, a verifier about the same as a reviewer, and a Sonnet prototype about 290k.

## 5. Units and order

1. **F** (the frame) and **M1**, side by side. M1 converging lets the owner resume Codex.
2. **C**'s rows that M1 touches.
3. The first batch goes to Codex (section 9).
4. Then M2 (as M2a and M2b), M3, M4, M5, M6, and the rest of C.
5. Then the five whole-document passes: X1 security and threat model, X2 failure, X3 enterprise readiness, X4 consistency and traceability, X5 build it end to end. Each converges like a unit.
6. Last: the rename (decision D-1), Codex's full review, and the owner's acceptance.

Findings that belong to a later unit are **parked** in the ledger (`parked for M3`, and so on). That unit's verifiers check them, together with its own findings. Its reviewers never see them.

## 6. One round

1. **Freeze a snapshot** of the spec for the round: `git show <sha>:docs/spec/v2.md > <scratch>/v2@<sha>.md`. Findings cite its lines.
2. **Reviewers**, one lens each, from PLAYBOOK section 6. Round 1: implementer, red team, chaos. Round 2: test author, consistency, and vendor facts (or the owner's advocate). Round 3 on: rotate the rest, always with an implementer or a red team. They never see each other's open findings.
3. **Collect.** Give each finding an ID (`R-<unit>-<n>`, numbered in the raw report's order), save the raw report to `raw/<unit>-r<n>-<lens>.md`, and add one row per finding to the ledger. Mark duplicates.
4. **Verify.** Build packets of up to eight findings in `batches/` (the packet script copies findings out of the raw reports, under their IDs). Each verifier gets one packet. Verdicts:
   - **CONFIRMED:** the orchestrator fixes the text;
   - **DECISION:** it goes to a bake-off, or a card if it is big;
   - **DUPLICATE**, **REFUTED:** recorded, with the reason;
   - **NEEDS-PROBE:** it goes to `probes.md`, for the owner's go.
5. **Fix** every CONFIRMED finding. New requirements get an ID, a milestone, evidence codes, an Implements entry and an AC. Every P0 and P1 fix gets a fix checker. Run `tools/trace-v2.mjs docs/spec/v2.md` (0 problems), and `tools/check-appendix-c.mjs` when Appendix C changed (it needs the owner's `the-future` folder).
6. **Commit and push** (section 8), with the ledger updated.
7. **Count.** A round is clean when it has no new CONFIRMED P0, P1 or P2. Open DECISION and NEEDS-PROBE items don't make a round dirty, but block the sign-off of the text they touch.

**Severity.** P0: harm in production as written. P1: wrong, unbuildable or untestable, or a failure with no defined outcome. P2: two readings that matter; a missing limit, default, format or message; an unverified vendor fact. P3: wording; never blocks a round.

**Done.** Two clean rounds in a row, then two PASS sign-offs. At most five rounds; a unit still failing after five gets a design note to the owner.

## 7. Decisions: the bake-off

1. Frame the question and two or three options, "leave it as is" included when it is real.
2. A drafter writes each option as spec text.
3. Test each option: reviewers with the lenses that fit (skipped when the facts are already settled; see section 4); a Sonnet prototype when a question of fact would settle it; a live probe only with the owner's go.
4. Verifiers check the findings against each option.
5. A judge scores the options in order: safety; the owner's goals and settled decisions; failure outcomes; enterprise readiness; cost to the owner; effort; how easily it is undone.
6. Technical: apply the winner and record it. Big: write the card, keep working, and apply the owner's answer when it comes.

**Card format:**
```
D-<n> <the question>
Options: A …; B …; C …
Tested: <what reviews, prototypes or docs showed>
Recommended: <option>, because <the two strongest reasons>
For you: <what changes for the owner>. Can be undone: <yes, or how hard>
```

## 8. Records, commits and the PR

- **Everything that ties to the review is committed** (the owner, 2026-10-14), in `docs/spec/review/` on PR #77, **"#63 Ultimate Spec Review"**, branch `claude/63-ultimate-spec-review`, stacked on #76 (`claude/63-spec-ideas`).
- **Commit and push every time an agent's result changes a doc**: a raw report saved, the ledger, a decision, a probe, a fix to the spec. **After every pass** (a round, a bake-off, a unit's sign-off), update the ledger's summary and [`STATE.md`](STATE.md), and post a short comment on the PR: what ran, what was found and fixed, what is next. The work must survive if the credits run out.
- Commit subjects: `#63 <action>`, for example `#63 Review M1, round 1: verify 45 findings`. End each with the attribution trailer the session gives. Stage files by path; never `git add -A`. Never force-push.
- Spec fixes from the review go on this same branch.

| File | Holds |
|---|---|
| `STATE.md` | Where the review stands and what comes next. Read it first. |
| `ledger.md` | A summary table, then one row per finding: ID, lens, severity, type, location, claim, verdict, resolution |
| `decisions.md` | D-1, D-2 …: question, kind, options, bake-off record, choice, where applied |
| `probes.md` | P-1, P-2 …: live runs waiting for the owner's go |
| `settled.md` | The accepted ADRs and the owner's decisions; reviewers may only reopen one with new evidence |
| `raw/` | Each agent's report, word for word |
| `batches/` | The verification packets |
| `prototypes/` | Each bake-off's offline experiment, with its results |
| `evidence/` | Copies of the spike reports and #63's comments, because GitHub is private to the agents |
| `agents/` | The two agent definitions |
| `tools/` | `trace-v2.mjs` (Appendix B's checker) and `check-appendix-c.mjs` |
| `SESSION-1-REPORT.md` | What session 1 learned |
| `NEXT-SESSION.md` | The prompt for the next session |

## 9. Codex and merging

- Codex reviews each batch PR as the cross-model gate; its findings come as C1, C2 … with [P1] or [P2], posted as the owner's account.
- Merge only with Codex's approval at the exact head. Issues close only on verified acceptance, never by assertion. PR bodies use `Tracking:`, never closing keywords.
- M1's PR (#75) is Codex's. It is paused at `04ab953` until the spec's M1 text converges. Don't touch its branch, except to read it.

## 10. Rules that never bend

- **No leaked code.** Most files in the owner's `the-future/order/` copy the leaked Claude Code source line for line. Their prose may be read; their code never enters the repository, a brief, a finding, a fix or a prototype. The same goes for the leaked zip.
- **Vendor files stay out** of the repository, such as Claude Code's mod typings (`evidence/README.md`).
- **Live runs need the owner's go:** every probe and every CLI run. A full-mode soldier run is the owner's own.
- **The roadmap stays separate:** `the-future/future-roadmap.md` is not linked from the review.
- **Answers to the owner are short and to the point.**
