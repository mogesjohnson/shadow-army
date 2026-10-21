# CI budget watchdog

Daily watchdog that estimates billed GitHub Actions minutes for the current
month against the 3,000-minute budget, and keeps a living report comment on
issue #80. Built because #78 showed a single draft PR can burn ~929 minutes
before anyone notices.

## How the estimate works

GitHub's billing endpoints are not available to `GITHUB_TOKEN`, so the
watchdog reconstructs the bill the same way the manual audit in #79 did:

```
billed = Σ over jobs of ceil(job minutes) × OS multiplier
```

- Job minutes come from each job's `started_at`/`completed_at`.
- Private-repo multipliers: Linux 1x, Windows 2x, macOS 10x.
- Jobs still running are skipped (not billable yet); reruns count twice,
  because GitHub bills them twice.

This is an estimate. GitHub's billing page is the source of truth.

## Behavior

- Runs daily (~07:23 UTC) on ubuntu-only, plus on demand via
  `workflow_dispatch`. A gate job skips the run when no workflow runs
  happened in the last 25 hours.
- Every run rewrites one living report comment on #80
  (`<!-- ci-budget-watchdog:report -->`): total vs budget, per-workflow and
  per-OS breakdowns, top-5 burners, burn rate, month-end projection.
- Thresholds: warning at 50%, high at 80%, critical at 95%.
- Kill switch: the `cancel_queued` dispatch input (default off) cancels
  **queued** runs when the budget is critical. `in_progress` runs are never
  touched, and nothing is cancelled below the critical threshold.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `GITHUB_TOKEN` | — | needs `actions:read`, `issues:write` |
| `GITHUB_REPOSITORY` | — | `owner/repo` |
| `ISSUE_NUMBER` | — | issue for the living report comment |
| `BUDGET_MINUTES` | `3000` | monthly budget |
| `BILLING_MONTH` | current UTC month | `YYYY-MM` window to audit |
| `CANCEL_QUEUED` | `false` | set `true` (via dispatch input) to arm the kill switch |

## Limitations

- Billing is estimated from job timings, not read from GitHub's billing API.
- Model/API spend (Claude, Codex, Grok usage) is not tracked by this tool;
  that lives with each vendor's own dashboard.
- The watchdog itself costs ~1 ubuntu minute per run (~30/month worst case,
  ~1% of the budget) — the gate job keeps quiet days free.
