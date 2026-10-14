# The spec 2.0 review

The record of the review that turns `docs/spec/v2.md` into the Shadow Army 2.0 specification (issue #63). Everything here is committed on the PR "#63 Ultimate Spec Review", at the owner's request.

Start with [`STATE.md`](STATE.md). The rules are in [`spec2.0_review_flow.md`](spec2.0_review_flow.md), and the full protocol is in [`PLAYBOOK.md`](PLAYBOOK.md). Section 8 of the flow says what each file and folder holds.

| Read | For |
|---|---|
| [`STATE.md`](STATE.md) | where it stands and what comes next |
| [`NEXT-SESSION.md`](NEXT-SESSION.md) | the prompt and setup for the next session |
| [`SESSION-1-REPORT.md`](SESSION-1-REPORT.md) | what session 1 ran, found and learned, the two prototypes included |
| [`ledger.md`](ledger.md) | every finding and its verdict |
| [`decisions.md`](decisions.md) | the decisions and their bake-offs |
| [`probes.md`](probes.md) | live runs that wait for the owner's go |
| [`settled.md`](settled.md) | what reviewers treat as decided |

Tools (`tools/`, Node, no dependencies):
- `trace-v2.mjs <spec>` checks Appendix B's rules 1 to 4 and 6. Pass: `0 problems`.
- `check-appendix-c.mjs <spec> <spec> <the-future folder>` checks Appendix C. It needs the owner's idea files.
- `packet.mjs <out> <title> <raw.md>:<index>=<ID>,…` builds a verification packet from raw reports.
- `extract.mjs`, with `TASKS_DIR` set, saves a background agent's report from its transcript without reading it into context.
