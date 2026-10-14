# Prompt for the next session

Paste the block below into a new Claude Code session on the cloud machine. It assumes the repository is cloned and `gh` is logged in as the owner's account.

```
Continue the Shadow Army spec 2.0 review (issue #63) on this machine. Your job: run the review with agents, two at a time, until the spec is the finished, enterprise-ready Shadow Army 2.0 specification, and commit every result.

Setup (once):
1. git fetch origin && git checkout claude/63-ultimate-spec-review && npm install
2. mkdir -p .claude/agents && cp docs/spec/review/agents/*.md .claude/agents/ && echo ".claude/agents/" >> .git/info/exclude
   Then restart Claude Code in this folder so the agent types spec-reviewer and spec-verifier load.
3. git worktree add ../shadow-army-m1 origin/codex/63-m1-post-office   (Codex's M1 draft at 04ab953: read only)
4. mkdir -p ../review-scratch && git show be9deb0:docs/spec/v2.md > ../review-scratch/v2@be9deb0.md   (round 1's frozen snapshot; findings cite its lines)

Read, in this order: CLAUDE.md, CONTRIBUTING.md, docs/spec/review/STATE.md, docs/spec/review/spec2.0_review_flow.md (the rules; it wins over PLAYBOOK.md), docs/spec/review/PLAYBOOK.md, docs/spec/review/ledger.md, docs/spec/review/decisions.md.

Rules that matter most:
- At most two agents at a time. Start the next when one returns.
- You are the only editor. Agents are read-only and return text; save each report word for word under docs/spec/review/raw/.
- Commit and push after every agent result that changes a doc (raw report, ledger, decisions, probes, spec fix), and after every pass update STATE.md and the ledger summary and comment on the PR "#63 Ultimate Spec Review". Subjects: "#63 <action>". Stage by path; never git add -A; never force-push.
- The owner answers only big questions, as short decision cards with a tested recommendation; the agents decide technical ones by bake-off and record them in decisions.md.
- Never put leaked Claude Code source, or code from the owner's the-future/order files, into anything. Vendor files (Claude Code's mod typings) stay out of the repository.
- Live probes and CLI runs need the owner's go.
- Budget: about $80 of API credit. M1 comes first, because it unblocks Codex. Check the spend after the first two agents and project it. Report it in each PR comment.
- Answer the owner straight to the point.

Start with STATE.md's "Next, in order": verify M1 (docs/spec/review/batches/M1-V1.md to M1-V6.md), then F (F-V1.md to F-V5.md), then the second verifiers for the P1s the first ones confirmed, then fix, then the D-2 judge, then D-3.

Verifier prompt (one packet per spec-verifier agent; replace <packet> and, for unit F, the unit name):
  Spec 2.0 review, unit M1, round 1. Verify the findings in docs/spec/review/batches/<packet>.md.
  Try to refute each finding: check the cited text and the whole spec for anything that already covers it; settled.md and docs/adr/ (is it a settled owner decision?); whether the scenario can really happen; and, for vendor facts, the official documentation.
  Sources: the spec as reviewed, ../review-scratch/v2@be9deb0.md (findings cite its lines); docs/spec/review/settled.md; docs/adr/; the archived 2.0 draft, docs/legacy/spec/shadow-army-2.0.md (grep it); v1's code in src/; docs/spec/review/evidence/ (its README lists what is there); Codex's draft in ../shadow-army-m1 (read only, grep it); every other finding in one line each in docs/spec/review/ledger.md, only to name a DUPLICATE.
  Appendix C's "could add (v2.0)" items (H48, H25, B2, H6, H2, H5, M24, H23, M15 with H44, H38, M9, H22) are open decisions; judge a finding that touches one on its own, and name the item. Open decisions: D-1 the name; D-2 the lease (PO-7); D-3 Q8.
  Return one block per finding: id, verdict (CONFIRMED, DECISION, DUPLICATE, REFUTED or NEEDS-PROBE), severity (as given, or changed with a reason), evidence (lines, URLs), reason (one sentence). For CONFIRMED add "fix:" with the smallest change to the spec text, in its style, or "as proposed". For DECISION add "options:" and "big or technical:" by PLAYBOOK section 14 (when unsure, big). Read only the lines you need. No preamble and no summary.
```

## Notes for the owner

- **The cloud machine needs:** the repository cloned with `gh` logged in; Node 20 or later; Claude Code with your API key. The review needs no vendor CLI (claude for soldiers, codex, grok, agy), because live probes stay on your machine.
- **What stays on your Windows machine:**
  - the `the-future` idea files, needed for Appendix C's checker. Their code is leaked source; don't copy them to the VM;
  - `.shadow/v2-tools/` (v2's overall state, canvases and probes);
  - WSL.
- **If you return to this machine instead,** the same prompt works from the main checkout's worktree `../AIConnections-review`. There, a Claude Code session in the main checkout already has the agent types.
