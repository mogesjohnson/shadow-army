# Spec 2.0 review playbook

How the Shadow Army spec (`docs/spec/v2.md`) becomes the finished **Shadow Army 2.0 specification**: complete, production-ready and fit for an enterprise to deploy. The owner asked for it on 2026-10-14: review agents that are constant skeptics and critical reviewers, working section by section until each area has been checked several times by independent agents, and then for the whole document.

Where this playbook and [`spec2.0_review_flow.md`](spec2.0_review_flow.md) differ, the flow wins: it holds the owner's later rules (two agents at a time, committed records, the budget cuts).

The session that runs this is the **orchestrator**. It plans the rounds, spawns the agents, records every finding, is the only one who edits the spec, and reports to the owner.

## 1. Why this design

| Choice | Why |
|---|---|
| **Fresh, independent reviewers each round**; none sees another's findings | Agents that read each other agree with each other. Independence is what makes "several reviewers found nothing" mean something. |
| **Different lenses per reviewer**, rotated each round | One kind of skeptic misses whole classes of defect. Eight lenses cover security, failure, buildability, testability, vendor facts, operations, consistency and the owner's daily use. |
| **Every finding is attacked by a separate verifier** before anything changes | Critical agents over-report: plausible findings that are wrong, or already covered elsewhere. Fixing those adds churn and new defects. Only confirmed findings are fixed. |
| **Convergence, not unanimity.** A unit is done after two consecutive rounds with no new confirmed P0–P2 finding, then two sign-offs | "Until they all agree" can be groupthink, or never end. "Nobody independent can find a material defect, twice in a row" is measurable, and it ends. |
| **One editor** (the orchestrator) | Many agents editing one document breaks its voice, its cross-references and its traceability. |
| **Decisions are tested, not guessed.** Each one that matters gets a bake-off: its options written out, attacked by the same skeptics, measured by a prototype where facts can settle it, then judged. The agents decide the technical ones; the owner answers only the big ones (section 14). | The owner wants the spec built out end to end, and answers only big questions (2026-10-14). Tested options make the agents' choices defensible. Keeping scope, money, security posture and the owner's experience as big questions keeps them in the owner's hands. |
| **Codex reviews each batch PR** | A different model family has different blind spots. Codex already reviews every spec PR (memory `codex-review-loop`). |
| **Units follow the milestones**, M1 first | Codex is paused on M1, waiting for the spec. M1's unit converging first lets the owner resume Codex while the rest is reviewed. |
| **A ledger of every finding** | An auditable record of what was found, verified, fixed or decided is itself an enterprise deliverable. |

## 2. Definition of done: the Shadow Army 2.0 specification

1. Every unit (section 4) and every cross-cutting pass (section 8) has converged: two clean rounds and two sign-offs.
2. No open P0, P1 or P2 finding. Every P3 is fixed, or listed in the ledger as accepted.
3. Open questions Q1 to Q8 are each answered in the text, or deferred past 2.0 with a reason (an ADR where it is a design choice).
4. Every decision in `decisions.md` is closed: decided by the agents with its bake-off on record, or answered by the owner. That includes each of Appendix C's 13 "could add (v2.0)" items, written in as requirements or deferred (section 14 says which are big).
5. Spike S6 is finished, or its remaining cases are deferred with a stated fallback. Every NEEDS-PROBE finding is settled by a probe the owner approved, or has a fallback in the text.
6. Every item of the readiness checklist (section 10) is met by a requirement or stated as a non-goal.
7. The document's own quality (section 10.9): revision history, references, normative and informative parts marked, and terms defined.
8. Checks pass: `trace-v2.mjs` (0 problems), `check-appendix-c.mjs` (0 problems), `git diff --check`, CI green.
9. Codex's full review approves the final head; the owner accepts it; the name and revision change (section 11); and the ledger's summary is posted on #63.

## 3. Roles and agents

- **Orchestrator** (the session, Opus): everything in sections 5 to 9.
- **Reviewers**: agent type `spec-reviewer` (read-only tools, Opus). One lens each (section 6).
- **Verifiers**: agent type `spec-verifier` (read-only tools, Opus). They try to refute findings (section 5, step 4).
- **Sign-off agents**: `spec-reviewer` with the sign-off task (section 7).
- **Fix checkers**: `spec-verifier` with the fix-check task, for every P0 and P1 fix.
- **Drafters**: `spec-reviewer` agents that write a decision's options as spec text (section 14).
- **Judges**: `spec-verifier` agents that score a decision's tested options and recommend one.
- **Prototype builders**: `general-purpose` agents with `model: "sonnet"` and `effort: "high"` (`spec2.0_review_flow.md` section 4, rule 6), which build and run small offline experiments in `.shadow/v2-tools/review/prototypes/` only.
- **Codex**: the cross-model gate on each batch PR, through the owner.
- **The owner**: answers only big questions (section 14), approves live probes, merges as before, and accepts the final text. Everything else the agents decide, record and report.

Both agent types are defined in `.claude/agents/` in the main checkout (excluded from git through `.git/info/exclude`). Their committed copies are in `docs/spec/review/agents/`; on a new machine, copy them into `.claude/agents/` before starting. Their tools are Read, Grep, Glob, WebSearch and WebFetch only, so they cannot change a file. If the types are missing, use `general-purpose` agents with `model: "opus"`, put the agent's rules (the text of the definition files) at the top of each prompt, and run `git status` after every round to be sure nothing changed.

Run at most two agents at a time (the owner, 2026-10-14). Start the next when one returns, even when more are independent, such as the reviewers of one round or the verifiers of one batch. Agents run in the background, and the orchestrator is told when each finishes.

## 4. Units

A unit is a milestone's requirements together with that milestone's ACs, because a requirement and the AC that tests it must be judged together. The orchestrator may split a unit that grows past about 150 lines of spec text, along the lines shown.

| Unit | Contents | Notes |
|---|---|---|
| **F** Frame | Header, §0 Reading, §1 Goals and non-goals, §2 Glossary, §3 Architecture, §5.1 Levels, §7 Decisions, §8 Open questions, Appendices A and B | Run first, beside M1: every other unit uses its terms. |
| **M1** | HOST-2; PO-1, PO-2, PO-3, PO-5, PO-7; CH-1, CH-2, CH-7; SI-1 to SI-3; ARM-1, ARM-3; WSP-8; SEC-1, SEC-2, SEC-4; VER-1 to VER-3, VER-5 to VER-7, VER-9; M1-AC1 to M1-AC8 | Unblocks Codex. Read Codex's draft at `../AIConnections-m1` (04ab953) for reality checks; never write there. |
| **M2** (split M2a, M2b) | M2a: PO-8, CH-6, CH-10, SEC-3, and M2-AC2, M2-AC6 to M2-AC10. M2b: CH-3, CH-4, CH-5, CH-8, SI-2, ARM-6, VER-4, VER-8, VER-9, and M2-AC1, M2-AC3 to M2-AC5. Spike S6 | S6's evidence feeds CH-6, CH-10 and PO-8. |
| **M3** | HOST-10, HOST-11; PO-4, PO-6; MSG-1 to MSG-10; ARM-2, ARM-4; SEC-5; OBS-2; M3-AC1 to M3-AC12 | Split MSG-6, MSG-7, MSG-9 and MSG-10 with their ACs into M3b if large. |
| **M4** | SES-1 to SES-8; CH-9; SI-4; SET-1, SET-2; OBS-3; M4-AC1 to M4-AC7 | Running totals versus per-turn usage (OBS-3, SES-7, HOST-15) belongs here. |
| **M5** | HOST-1, HOST-3 to HOST-9, HOST-12 to HOST-15; VIS-1 to VIS-6; OBS-1; M5-AC1 to M5-AC9 | Check against the v2 canvas, version 21. |
| **M6** | WSP-1 to WSP-7, WSP-9; ARM-5; MSG-11; LEG-1; M6-AC1 to M6-AC7 | H48's guard gap lands here. |
| **C** | Appendix C: 118 ideas and six designs | Lighter: verify each row's claims about the spec, then the owner decides the 13 v2.0 items. |

Order: F and M1 in parallel, then C's review of the rows M1 touches. Push to #76, get Codex's review, and merge it (v0.6). Then M2, M3, M4, M5, M6 and the rest of C, then the cross-cutting passes, then the final step. Two units may run at once; fixes are still applied one at a time.

## 5. One round

1. **Context pack.** For each reviewer, give file paths (not pasted text) and line ranges:
   - the unit's text in the review worktree;
   - the frame (§0 to §3) and the sections the unit cites;
   - `review/settled.md` (section 9);
   - the unit's list of refuted and declined findings, with reasons, so they are not raised again without new evidence. Never their open or confirmed findings.
2. **Reviewers.** Spawn three fresh `spec-reviewer` agents, each with a different lens (section 6), using the task template in section 12.
3. **Collect.** Give each finding an ID (`R-<unit>-<n>`), drop exact duplicates (keep the best-argued), and write them all to the ledger.
4. **Verify.** Spawn `spec-verifier` agents on batches of up to eight findings. Each P0 and P1 gets two independent verifiers. Verdicts:
   - **CONFIRMED**: real, and fixable in the text;
   - **DECISION**: real, but a choice between options. It goes to the decision process (section 14), which settles it or brings it to the owner;
   - **DUPLICATE** of another finding;
   - **REFUTED**: wrong, or already covered (with the line that covers it);
   - **NEEDS-PROBE**: only a live run can settle it. It goes to the owner's probe queue.

   When two verifiers disagree on a P0 or P1, the orchestrator decides and writes why in the ledger, or asks a third.
5. **Fix.** The orchestrator rewrites the text for every CONFIRMED finding.
   - New requirements get new IDs, a milestone, evidence codes, an Implements entry and an AC (Appendix B).
   - Every P0 and P1 fix goes to a fresh fix checker: is it fixed, and did the fix break anything near it?
   - Then run `trace-v2.mjs` and, if Appendix C changed, `check-appendix-c.mjs`. Commit: `#63 Review <unit>, round <n>: <what changed>`.
6. **Count.** The round is clean when it has no new CONFIRMED P0, P1 or P2 finding. DECISION and NEEDS-PROBE items don't make a round dirty, but the unit can't be signed off while one that touches its text is open.

**Severity**

| | Meaning | Examples |
|---|---|---|
| **P0** | Harm in production as written | A path to act without the owner; a secret exposed; data loss; two MUSTs that can't both hold |
| **P1** | Wrong, unbuildable or untestable; a failure simulation with no defined outcome; a gap no enterprise could accept | No upgrade path; an AC that can pass while the requirement fails |
| **P2** | Two reasonable readings that matter; a missing limit, default, format or message; an unverified vendor fact | "Closes the session" without saying how, or what is kept |
| **P3** | Wording, style, nits | Fixed when convenient; never blocks a round |

## 6. The eight lenses

Each reviewer gets exactly one lens. Round 1: implementer, red team, chaos. Round 2: test author, consistency, and vendor facts (if the unit names any CLI behavior), otherwise the owner's advocate. Round 3 onwards: rotate the rest, always including implementer or red team.

1. **Red team.** Attack the unit from each of these positions:
   - a prompt-injected soldier that can run commands as the owner's user;
   - a malicious repository the owner opens (hooks, git config, files carrying escape sequences);
   - a hostile MCP server, plugin or CLI update;
   - another process or user on the machine;
   - anything on the network.

   Find a path to: act without the owner (approve, apply, send, assign); read or leak secrets and files; persist; escape a worktree, snapshot or guard; hide activity from the owner; or deny service. Check that every trust boundary has a control, and a test with evidence code X. Leads already open: H48 (the guard ignores `.git/config`, `hooks/` and `info/`) and B2 (the Monarch's secret in process memory).
2. **Chaos engineer.** Break the unit in time and state.
   - The owner's seven failure simulations, with 3 and 5 split into their cases as Codex runs them (comment 6084478520 on #63):
     1. a stream that dies mid tool call;
     2. a cancel after a partial edit;
     3. a rate limit, a context overflow, and a refusal;
     4. a retry after a partial success;
     5. a stale cache after a model, effort, prompt or tool change;
     6. one model's output fed to another;
     7. cost from estimates instead of reports.
   - Then: each process (CLI, post office, mod, Claude Code) crashing and restarting; two actions at once; duplicate or out-of-order events; slow or silent CLIs; a full disk; partial writes; clock jumps.

   Name each state the text leaves undefined, and what the owner would see.
3. **Implementer.** Build the unit from the text alone, with no one to ask. List every guess you'd have to make:
   - two reasonable readings;
   - a missing value (format, limit, default, timeout, path, message text);
   - an undefined term, or an order of operations not given;
   - something Node.js, Windows, macOS or Linux can't do as written;
   - a contradiction with another section.

   For each, say what you'd build under each reading, and why it matters.
4. **Test author.** Write in your head the test for every requirement in the unit. Flag:
   - a requirement no test could fail, or an evidence code that doesn't fit it;
   - an AC that doesn't observe what its requirement promises;
   - a live model needed where a fake would do;
   - timing or ordering with no fake clock or controlled order;
   - a requirement in Implements that no AC really checks, even though the trace script passes.
5. **Vendor-fact checker.** Every statement about what claude, codex, grok, agy or Claude Code does must rest on evidence:
   - an official document (give its URL and what it says today);
   - or a recorded probe (the spike reports on #63, contract fixtures).

   Flag each claim with no evidence, one that contradicts current docs, or one tied to a version without naming it. Mark what only a live run can settle as NEEDS-PROBE. Never run a CLI.
6. **Enterprise operator.** You will roll this out to 200 developers in a regulated company and support it. Use the readiness checklist (section 10). Find what the text doesn't say that you'd need, and say whether a requirement or an explicit non-goal should close each gap.
7. **Consistency auditor.** Read the unit against the whole spec, the ADRs and `settled.md`. Flag:
   - a term used differently from the glossary, or not defined;
   - a reference to a wrong or removed ID;
   - numbers that disagree (timeouts, limits, counts);
   - a requirement that contradicts another one or an ADR;
   - MUST or SHOULD misused, or missing where behavior is mandatory;
   - two requirements under one ID, or a requirement hiding in prose.
8. **Owner's advocate.** You are the owner, using this every day with seven soldiers. Check the unit against:
   - goals G1 to G7 and the non-goals;
   - ADR-0014 (the owner steers) and ADR-0015 (the quiet default);
   - the v2 canvas.

   Flag what would surprise, slow down or nag the owner, hide something they need, or take a decision away from them. Also flag defaults that are wrong for daily use.

## 7. Exit: convergence and sign-off

- **Converged**: two consecutive clean rounds.
- **Sign-off**: then two fresh agents, an implementer and a red team, each read the whole unit and answer PASS or FAIL, with reasons. A FAIL backed by a finding that a verifier CONFIRMS at P0 to P2 reopens the unit. Two PASSes complete it.
- **Round cap**: five rounds. A unit still producing confirmed P0 to P2 findings after five has a design problem, not a wording one. Write the owner a short note with options and a recommendation, and go on with other units.
- **Pending**: a unit with open DECISION or NEEDS-PROBE items that touch it is "converged, pending D-n / P-n". Sign it off once those are applied.

## 8. Cross-cutting passes

These run after every unit has converged, because defects live between sections too. Each reviewer reads the whole spec. Each pass converges like a unit: two clean rounds, two sign-offs.

| Pass | Lenses per round |
|---|---|
| **X1 Security and threat model** | Two red teams and a consistency auditor. Writes or checks a threat model: assets, actors, trust boundaries, controls, tests. |
| **X2 Failure** | Two chaos engineers, across the whole system, process by process. |
| **X3 Enterprise readiness** | Two enterprise operators and the owner's advocate, against section 10 item by item. |
| **X4 Consistency and traceability** | Two consistency auditors. Glossary, IDs, numbers, ADRs, Appendices A to C, revision history. |
| **X5 Build it end to end** | Two implementers reading the whole spec front to back as the only input. |

## 9. Records

All under `docs/spec/review/`, committed on the PR "#63 Ultimate Spec Review" (the owner's ask, 2026-10-14). They started in the git-ignored `.shadow/v2-tools/review/`:
- **`settled.md`**, written first: the accepted ADRs (0008 to 0015), one line each, and the owner's decisions from STATE.md's log that the spec embodies. Reviewers treat these as settled; they may only flag one with new evidence, and then as a DECISION.
- **`ledger.md`**:
  - a summary table: unit, status, rounds, open P0 to P2, fixed, decisions pending, sign-offs;
  - for each unit, one row per finding: ID, round, lens, severity, type, location, claim, verdict, resolution (commit).
- **`decisions.md`**: D-1, D-2, and so on. Each has:
  - the question, and whether it is big, technical or trivial (section 14);
  - the options;
  - the bake-off's record: the confirmed findings against each option, any prototype's results, the evidence, and the judge's scores;
  - the choice, and who made it;
  - where it was applied (the commit).

  Big ones go to the owner as decision cards, in batches; the owner may answer "as recommended".
- **`probes.md`**: P-1, P-2, and so on. Each has what to run, what it settles, and roughly what it costs. Live runs are the owner's to approve, and full-mode soldiers are the owner's to run.
- **STATE.md**: kept current at each milestone, as always.

**Reporting.** After each unit, tell the owner in a few lines:
- the rounds run;
- the findings fixed, by severity;
- the findings refuted;
- the decisions the agents made, one line each, which the owner may overrule;
- the big questions and probes waiting, as decision cards;
- the sign-offs;
- the commit.

The owner doesn't need to answer a report; only the cards.

## 10. Readiness checklist (enterprise and production)

Every item ends as a requirement (new or existing) or an explicit non-goal. Where a new area is needed, propose it to the owner as a decision first. Candidates: an OPS area for install, upgrade and support; a threat-model appendix; a final "release" milestone.

1. **Security.** A threat model; secrets at rest, on the wire and in memory (B2); prompt injection and display safety (H25); command and git safety (H48); least privilege; the vendor safeguards kept whole (CH-7, ADR-0010); supply chain (dependencies, the native helper, Q8); and a vulnerability disclosure policy.
2. **Privacy and data.** What is stored, and where (logs, records, reports, worktrees, snapshots); how long; how the owner deletes it; redaction; that nothing leaves the machine except through the vendors' own CLIs; and telemetry (none, or stated).
3. **Reliability.** Every failure simulation has an outcome; recovery after every crash; no double sends (MSG-4); timeouts everywhere; limits on memory, disk, log size (H62), and soldiers at once; backpressure.
4. **Operability.**
   - install, upgrade, rollback and uninstall;
   - prerequisites, such as the C compiler (Q8);
   - supported OS, Node and CLI versions;
   - config validation and defaults;
   - logs and their levels;
   - a diagnostics or support bundle;
   - health and status;
   - old worktrees cleaned up (M9).
5. **Compatibility.** A policy for vendor CLI versions (CH-8), protocol changes and deprecations; migration from v1 (LEG-1); semantic versioning.
6. **Compliance and legal.** The license of every dependency; a clean-room rule: no code from the leaked Claude Code source, or from the `order/` files, ever enters the repository; clawspring's attribution (Apache-2.0) if any of it is reused; and the vendors' terms (respect their killswitches and forced updates; H18).
7. **Quality.** Every requirement testable; coverage (VER-6); the CI matrix; release criteria (the live checks); performance budgets (delivery latency, pane responsiveness); accessibility (the ASCII profile, never colour alone); internationalization, stated as in or out.
8. **Documentation.** User guide, setup guide, troubleshooting, architecture overview, the ADRs, a changelog, `SECURITY.md`.
9. **The spec as a document.** A revision history; normative references (RFC 2119 and 8174; each vendor doc, with its date); normative and informative parts marked; a conformance statement; a change process after 1.0 (amendments through a PR and an ADR).

## 11. Name and revision (a big question: the owner decides once)

Recommended:
- **Title**: "Shadow Army 2.0: Specification".
- **Revisions**: drafts go on as 0.7, 0.8 and so on; the accepted text is revision 1.0. The product it specifies is release 2.0.0.
- **File**: keep the path `docs/spec/v2.md`. Moving it touches CI, CLAUDE.md, the ADRs and many comments; move it last, if at all.
- **The name clash.** "2.0" already names the archived draft (`docs/legacy/spec/shadow-army-2.0.md`, v0.16). The spec cites it as "2.0 WS-1", "2.0 SAFE-10" and so on. When it is renamed, call the old one "the 2.0 draft" everywhere, Appendix A included, and update `trace-v2.mjs`'s carried-over pattern ("as in 2.0's") to match.

## 12. Task templates

**Reviewer** (to a `spec-reviewer` agent):

```
Unit <U>, round <n>. Your lens: <lens name>.
<the lens's charter from PLAYBOOK.md section 6, pasted in full>

Read, in the review worktree (<path>):
- the unit: docs/spec/v2.md lines <a>-<b> (<IDs>);
- the frame: docs/spec/v2.md lines <frame range>;
- what the unit cites: <IDs and line ranges>;
- the settled decisions: .shadow/v2-tools/review/settled.md;
- findings already refuted or declined for this unit, not to raise again without new evidence: <list, or "none">.
Other sources you may read: docs/adr/; GitHub issue #63's spike reports; Codex's M1 draft at <path>, read-only; vendors' official documentation.

Return only findings in the schema, most severe first, then "Coverage: <the requirement IDs you checked>".
If you find nothing at P0 to P2, say so, and list what you checked.
```

**Verifier** (to a `spec-verifier` agent):

```
Try to refute each finding below. For each one, check:
- the cited text, and the whole spec for anything that already covers it;
- settled.md and docs/adr/ (is it a settled owner decision?);
- whether the failure scenario can really happen;
- for vendor facts, the official documentation.
Findings:
<findings in the schema>
Return one verdict per finding: CONFIRMED, DECISION, DUPLICATE (of which), REFUTED or NEEDS-PROBE, with the evidence (lines, URLs) and one sentence of reasoning.
```

**Sign-off** (to a `spec-reviewer` agent): "Unit <U> at commit <sha>. Your lens: <implementer or red team>. Read the whole unit and the frame. Answer PASS or FAIL. With FAIL, give the findings in the schema that justify it."

**Fix check** (to a `spec-verifier` agent): "Finding <ID> (pasted) was fixed in commit <sha>. The old text: <old>. The new text: <new>. Is the finding fixed? Did the change contradict or break anything within the unit, or in anything that cites it? Answer FIXED or NOT FIXED, and list anything broken in the schema."

**Drafter** (to a `spec-reviewer` agent): "Decision D-<n>: <the question>. Write option <X>, '<one-line summary>', as spec text in the spec's own style: the requirements (number new ones NEW-1, NEW-2), their ACs, and any changed lines, each with the text it replaces. Keep to this option: don't argue for it, and don't mix in another. Return only the text."

**Option reviewer**: the reviewer template, with the drafted text of one option in place of the unit. "This is option <X> of decision D-<n>, proposed as a change to the spec. Review it as if it were in the spec, against the spec around it."

**Prototype** (to a `general-purpose` agent with `model: "sonnet"` and `effort: "high"`; the flow's section 4, rule 6, says why):

```
Decision D-<n> turns on a question of fact: <the question>.
Work only in .shadow/v2-tools/review/prototypes/D-<n>/. Build the smallest experiment that measures <the quantity> under each option, with fake CLIs, and a fake clock where time matters.
Use Node built-ins unless the question is about a dependency.
Never call a model or a vendor CLI, never write outside that folder, and never use code from the leaked Claude Code source or from the-future/order.
Run it, then return: what you built (paths), how to rerun it, the results, and what they mean for each option.
Report a result only from a run that actually exercised it, with that run's output. A syntax check, or a command that failed to start, doesn't count. If something couldn't run, say what and why instead of reporting a result.
```

**Judge** (to a `spec-verifier` agent):

```
Decision D-<n>: <the question>. Options: <for each: its text, its confirmed findings, its evidence and prototype results>.
Score each option from 1 to 5 on each criterion, in this order:
1. safety and security;
2. the owner's goals G1 to G7 and their settled decisions;
3. failure outcomes (the seven simulations);
4. enterprise readiness (PLAYBOOK section 10);
5. cost to the owner;
6. effort to build;
7. how easily it can be undone.
A lower criterion breaks ties only.
Return the scores as a table, your recommendation and its two strongest reasons, and whether the decision is big or technical by PLAYBOOK section 14.
```

**Finding schema** (every reviewer returns exactly this):

```
- severity: P0|P1|P2|P3
  type: defect|gap|ambiguity|contradiction|untestable|vendor-fact|readiness|decision-needed|editorial
  location: <requirement ID or AC> (docs/spec/v2.md:<line>)
  claim: <one sentence>
  scenario: <concrete inputs or state -> the wrong outcome; or "reading A builds X, reading B builds Y">
  evidence: <quotes, IDs, URLs>
  fix: <proposed wording, or "decision: <the options>">
```

## 13. Pitfalls

- **Endless nitpicks.** Only P0 to P2 count toward convergence, and verifiers drop weak findings.
- **Scope creep.** New features are DECISION items for the owner. Appendix C holds the ideas, and agents never add one on their own.
- **Groupthink.** Reviewers are fresh each round, they never see each other's open findings, and lenses rotate.
- **Re-arguing settled decisions.** Give reviewers `settled.md`. Raising one needs new evidence.
- **Invented vendor facts.** Require a URL or a probe, and mark the rest NEEDS-PROBE.
- **Stray edits.** Reviewers use read-only agent types, only the orchestrator edits, and `git status` follows every round.
- **A full context window.** Findings go to the ledger file, and only counts go to chat.
- **Leaked code.** Reviewers may read the prose of the `order/` files, never their code. Nothing from the zip enters the repository, a brief, or a finding's proposed fix.
- **Agents taking a big decision.** When it's unclear whether a decision is big, treat it as big. It still gets its bake-off first, so the owner receives a tested recommendation, not an open question.
- **Bake-offs for everything.** Only decisions that matter get one. A choice with one sensible answer is made directly and recorded.
- **Cost.** Expect about 150 to 250 agent runs for the review itself, and 8 to 15 more for each bake-off. The owner wants the spec built out end to end, so there is no cap. Report after each unit, so the owner can always see where it stands.

## 14. Decisions: test the options, then choose

The owner wants the spec built out end to end, and answers only big questions (2026-10-14). So the agents settle every decision they can, with evidence, and bring the owner only the big ones, each with a tested recommendation.

**Who decides**

| Kind | Decided by | What counts |
|---|---|---|
| **Big** | The owner, from a decision card | Adding or dropping a capability (a new command, a new automatic action, an "after v2.0" item pulled into 2.0). Anything that changes what the owner sees, does or must approve. Money: paid probes, budgets, anything that raises what the owner pays. Security posture: what may happen without the owner, the trust boundaries, and accepting a remaining risk. Vendor terms, licensing, anything legal. Reversing an owner decision or an accepted ADR. The spec's name and revision, and the release. Anything hard to undo. |
| **Technical** | The agents, by a bake-off. Recorded, and the owner may overrule it in the unit's report | Limits, timeouts, defaults, formats, message wording, internal mechanisms, how something is measured or tested, the document's structure, and a fix to a defect in v2.0's own behavior that changes nothing the owner sees or approves. |
| **Trivial** | The orchestrator, directly. Recorded | A choice with one sensible answer. |

When in doubt, it is big.

**What is waiting already**
- **The spec's name and revision** (section 11): big.
- **Q8, how the C process helper ships:** big, because it changes what users must install. Run its bake-off first; a prototype can show whether prebuilt helpers work across CI's three systems.
- **The lease timing:** the owner decided 10 s and 30 s, and Codex built 5 s and 20 s. Run a bake-off with a fake clock, including a laptop that sleeps. If 10 s and 30 s holds up, keep it and tell Codex to match; no question is needed. Changing it would reverse the owner's decision, which makes it big.
- **Appendix C's 13 "could add (v2.0)" items:**
  - **Technical:** H48, B2, H25 and H2 fix defects in v2.0's security or failure handling, and H6, H5, M24, H23, M15 and H44 refine v2.0's own behavior. The agents decide how to fix each by bake-off. Accepting a risk that can't be fixed (for example, B2 on one system) is big.
  - **Big:** H38 (what a resumed Claude session does with the soldiers), M9 (cleaning up old worktrees deletes things), and H22 (a new way for soldiers to ask the owner).
  - **After v2.0:** the 22 items stay out of 2.0 unless the owner pulls one in.

**The bake-off**
1. **Frame.** Write the question, two or three options (including "leave it as is" when that is a real option), and what would settle it.
2. **Draft.** A drafter writes each option as spec text, ready to drop in.
3. **Test.** Run these for each option, two agents at a time, each reviewer seeing one option only:
   - the lenses that fit: red team, chaos (the seven simulations), implementer, enterprise operator, and the owner's advocate;
   - the evidence: vendor docs, Codex's M1 draft (read-only), and the spike reports;
   - a prototype, when a question of fact would settle it and no live model is needed;
   - a live probe, only with the owner's go (`probes.md`).
4. **Verify.** Findings against each option go through verifiers, like any other finding.
5. **Judge.** A fresh judge scores the options and recommends one (the task template in section 12).
6. **Close.**
   - **Technical:** apply the winner, record it in `decisions.md`, and list it in the unit's report as decided by the agents.
   - **Big:** write the decision card and go on with other work. Apply the owner's answer when it comes.

**Decision card** (big questions only), a few lines:

```
D-<n> <the question>
Options: A <one line>; B <one line>; C <one line>
Tested: <what the reviews, prototypes or docs showed for each>
Recommended: <the option>, because <the two strongest reasons>
For you: <what changes for the owner>. Can be undone: <yes, or how hard it is>
```
