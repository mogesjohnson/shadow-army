#!/usr/bin/env node
/**
 * CI budget watchdog for shadow-army (issue #80).
 *
 * Estimates billed GitHub Actions minutes for the current billing month and
 * reports them against the monthly budget. GitHub's own billing endpoints are
 * not available to GITHUB_TOKEN, so this reconstructs the bill the same way
 * the manual audit in #79 did:
 *
 *   billed = sum over jobs of ceil(job minutes) x OS multiplier
 *
 * Private-repo multipliers: Linux 1x, Windows 2x, macOS 10x.
 * This is an estimate; GitHub's billing page is the source of truth.
 *
 * Env:
 *   GITHUB_TOKEN       (required) token with actions:read (+ issues:write to report)
 *   GITHUB_REPOSITORY  (required) "owner/repo"
 *   ISSUE_NUMBER       (optional) issue that keeps the living report comment
 *   BUDGET_MINUTES     (default 3000)
 *   BILLING_MONTH      (default: current UTC month, YYYY-MM)
 *   CANCEL_QUEUED      (default "false") when "true" and status is CRITICAL,
 *                      cancel queued runs (in_progress runs are never touched)
 *
 * With --gate, prints only "stale=true" or "stale=false" for the workflow's
 * gate job: stale when no workflow other than this one ran in the last 25h.
 *
 * Exit 0 on a completed report. API/network errors exit 1 so the workflow
 * run shows red and gets noticed.
 *
 * The functions are exported for scripts/ci-budget-watchdog.test.mjs; the
 * report only runs when this file is executed directly.
 */

import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";
const REPORT_MARKER = "<!-- ci-budget-watchdog:report -->";
const MULTIPLIERS = { linux: 1, windows: 2, macos: 10 };
const WARN_AT = 50;
const HIGH_AT = 80;
const CRITICAL_AT = 95;
const WATCHDOG_WORKFLOW = ".github/workflows/ci-budget-watchdog.yml";
const IDLE_HOURS = 25;

export function osOf(labels) {
  const l = (labels || []).join(" ").toLowerCase();
  if (l.includes("macos")) return "macos";
  if (l.includes("windows")) return "windows";
  return "linux";
}

export function billedMinutesForJob(job) {
  // A skipped job, or one that never got a runner, did not execute and bills
  // nothing; the one-minute minimum below is only for jobs that ran.
  if (job.conclusion === "skipped" || (job.runner_id == null && !job.runner_name)) return 0;
  if (!job.started_at || !job.completed_at) return null; // still running: not billable yet
  const ms = new Date(job.completed_at) - new Date(job.started_at);
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return minutes * MULTIPLIERS[osOf(job.labels)];
}

// The jobs endpoint lists only the latest attempt unless asked for filter=all,
// which lists every attempt. A re-run copies the jobs it did not re-run into
// the new attempt under new ids but with the original runner and timings, so
// key each execution on those to count it once.
export function uniqueExecutions(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = [job.name, job.runner_id, job.started_at, job.completed_at].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createClient({ token, fetch = globalThis.fetch }) {
  async function gh(path, { method = "GET", body, params } = {}) {
    let url = `${API}${path}`;
    if (params) url += `?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "shadow-army-ci-budget-watchdog",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(
        `GitHub API ${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function paginate(path, { key, params } = {}) {
    const items = [];
    for (let page = 1; page <= 50; page++) {
      const data = await gh(path, { params: { per_page: "100", page: String(page), ...params } });
      const batch = key ? data[key] || [] : data;
      if (!Array.isArray(batch)) throw new Error(`unexpected API shape for ${path}`);
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  }

  return { gh, paginate };
}

// Calls `gh`, but answers undefined for the listed HTTP statuses instead of
// throwing, so one finished or deleted run does not abandon the rest.
async function callOrSkip(gh, path, statuses, options) {
  try {
    const data = await gh(path, options);
    return data === null ? {} : data;
  } catch (err) {
    if (statuses.includes(err.status)) return undefined;
    throw err;
  }
}

function monthWindow(ym) {
  const [y, m] = ym.split("-").map(Number);
  // Half-open [start, end): a past BILLING_MONTH must not count later months.
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

function isoSeconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function statusFor(pct) {
  if (pct >= CRITICAL_AT) return "CRITICAL";
  if (pct >= HIGH_AT) return "HIGH";
  if (pct >= WARN_AT) return "WARNING";
  return "OK";
}

function renderReport({ monthLabel, total, budget, byWorkflow, byOs, top, daysElapsed, daysInMonth, projected, pct, status }) {
  const badge = { CRITICAL: "🛑", HIGH: "🔶", WARNING: "⚠️", OK: "✅" }[status];
  const fmt = (n) => n.toLocaleString("en-US");
  let report = `${REPORT_MARKER}\n## CI budget report — ${monthLabel}\n\n`;
  report += `**${fmt(total)} / ${fmt(budget)} billed minutes (${pct.toFixed(1)}%)** — ${badge} ${status}\n\n`;
  if (status === "CRITICAL") {
    report += `> 🛑 Budget critical at ${pct.toFixed(0)}%. Batch pushes, and consider cancelling queued runs via the \`cancel_queued\` dispatch input.\n\n`;
  } else if (status === "WARNING" || status === "HIGH") {
    const daysLeft = Math.max(0, Math.ceil(daysInMonth - daysElapsed));
    report += `> ${badge} Budget ${status.toLowerCase()} at ${pct.toFixed(0)}% with ~${daysLeft} days left in the cycle.\n\n`;
  }
  report += `| Workflow | Billed min |\n|---|---|\n`;
  for (const [name, min] of [...byWorkflow.entries()].sort((a, b) => b[1] - a[1])) {
    report += `| ${name} | ${fmt(min)} |\n`;
  }
  report += `\n| OS | Multiplier | Billed min |\n|---|---|---|\n`;
  for (const os of ["linux", "windows", "macos"]) {
    report += `| ${os} | ${MULTIPLIERS[os]}x | ${fmt(byOs[os])} |\n`;
  }
  report += `\n### Top burners\n\n| Run | Workflow | Event | Actor | Billed min |\n|---|---|---|---|---|\n`;
  for (const r of top) {
    report += `| [${r.id}](${r.url}) | ${r.name} | ${r.event} | ${r.actor || "?"} | ${fmt(r.billed)} |\n`;
  }
  report += `\nBurn rate: ~${fmt(Math.round(total / daysElapsed))} min/day · projected month-end: ~${fmt(projected)} min (${((projected / budget) * 100).toFixed(0)}% of budget)\n\n`;
  report += `_Estimate only: per-job minutes rounded up × private-repo multipliers (Linux 1x, Windows 2x, macOS 10x), the same method as the #79 audit. GitHub billing is the source of truth._`;
  return report;
}

export async function runWatchdog({
  token,
  owner,
  repo,
  issueNumber = "",
  budget = 3000,
  cancelQueued = false,
  billingMonth,
  now = new Date(),
  fetch,
  log = console.log,
  stepSummary,
}) {
  const { gh, paginate } = createClient({ token, fetch });

  async function upsertComment(body) {
    const comments = await paginate(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
    const existing = comments.find((c) => (c.body || "").includes(REPORT_MARKER));
    if (existing) {
      await gh(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: { body },
      });
      log(`updated report comment ${existing.id}`);
    } else {
      const created = await gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: "POST",
        body: { body },
      });
      log(`created report comment ${created.id}`);
    }
  }

  const { start, end } = monthWindow(billingMonth || now.toISOString().slice(0, 7)); // YYYY-MM
  // GitHub's range syntax is inclusive on both ends, so stop 1s before the next month.
  const last = new Date(end.getTime() - 1000);
  const runs = await paginate(`/repos/${owner}/${repo}/actions/runs`, {
    key: "workflow_runs",
    params: { created: `${isoSeconds(start)}..${isoSeconds(last)}` },
  });

  let total = 0;
  const byWorkflow = new Map();
  const byOs = { linux: 0, windows: 0, macos: 0 };
  const runRows = [];
  const queued = [];
  let skippedRunning = 0;

  for (const run of runs) {
    if (run.status === "queued") queued.push(run);
    const jobs = uniqueExecutions(
      await paginate(`/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`, {
        key: "jobs",
        params: { filter: "all" },
      })
    );
    let runBilled = 0;
    for (const job of jobs) {
      const billed = billedMinutesForJob(job);
      if (billed === null) {
        skippedRunning++;
        continue;
      }
      runBilled += billed;
      byOs[osOf(job.labels)] += billed;
    }
    total += runBilled;
    byWorkflow.set(run.name, (byWorkflow.get(run.name) || 0) + runBilled);
    if (runBilled > 0) {
      runRows.push({
        id: run.id,
        name: run.name,
        event: run.event,
        actor: run.actor && run.actor.login,
        url: run.html_url,
        billed: runBilled,
      });
    }
  }

  runRows.sort((a, b) => b.billed - a.billed);

  const pct = (total / budget) * 100;
  const status = statusFor(pct);
  const daysElapsed = Math.max((Math.min(now, end) - start) / 86400000, 1 / 24);
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = Math.round((total / daysElapsed) * daysInMonth);
  const monthLabel = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const report = renderReport({
    monthLabel,
    total,
    budget,
    byWorkflow,
    byOs,
    top: runRows.slice(0, 5),
    daysElapsed,
    daysInMonth,
    projected,
    pct,
    status,
  });

  log(report);
  if (stepSummary) await appendFile(stepSummary, `${report}\n`);
  if (issueNumber) await upsertComment(report);

  const cancelled = [];
  if (cancelQueued) {
    if (status !== "CRITICAL") {
      log(`cancel_queued requested but status is ${status} (< ${CRITICAL_AT}%); nothing cancelled.`);
    } else {
      // `queued` was listed before every job request and the report, so a
      // candidate may have started since. Re-read each one just before its POST
      // and leave it alone unless it is still queued. GitHub's cancel has no
      // "only if queued" condition, so the re-read narrows the race to one
      // round trip; it cannot close it.
      for (const run of queued) {
        const current = await callOrSkip(gh, `/repos/${owner}/${repo}/actions/runs/${run.id}`, [404]);
        if (!current || current.status !== "queued") {
          log(`left run ${run.id} (${run.name}) alone: ${current ? current.status : "gone"}, not queued`);
          continue;
        }
        // 409: the run completed between the re-read and the POST.
        const ok = await callOrSkip(gh, `/repos/${owner}/${repo}/actions/runs/${run.id}/cancel`, [409], { method: "POST" });
        if (ok === undefined) {
          log(`left run ${run.id} (${run.name}) alone: completed before the cancel`);
          continue;
        }
        cancelled.push(run.id);
        log(`cancelled queued run ${run.id} (${run.name})`);
      }
      log(`cancelled ${cancelled.length} queued run(s); runs that had started were left alone.`);
    }
  }

  return { total, status, byOs, report, cancelled };
}

// The gate job's question: did any workflow other than this watchdog run in
// the last IDLE_HOURS? The watchdog's own runs (the one asking, and the
// previous daily one) are not activity, or the gate could never report idle.
export async function hasOtherRecentRuns({ token, owner, repo, now = new Date(), fetch }) {
  const { gh } = createClient({ token, fetch });
  const since = isoSeconds(new Date(now.getTime() - IDLE_HOURS * 3600000));
  for (let page = 1; page <= 10; page++) {
    const data = await gh(`/repos/${owner}/${repo}/actions/runs`, {
      params: { created: `>${since}`, per_page: "100", page: String(page) },
    });
    const batch = data.workflow_runs || [];
    // A run's path can carry an @ref suffix.
    if (batch.some((r) => (r.path || "").split("@")[0] !== WATCHDOG_WORKFLOW)) return true;
    if (batch.length < 100) return false;
  }
  return true; // 1,000 watchdog runs in a day is activity of its own
}

function configFromEnv(env) {
  const [owner, repo] = (env.GITHUB_REPOSITORY || "").split("/");
  return {
    token: env.GITHUB_TOKEN,
    owner,
    repo,
    issueNumber: env.ISSUE_NUMBER || "",
    budget: Math.max(1, parseInt(env.BUDGET_MINUTES || "3000", 10)),
    cancelQueued: /^(true|1|yes)$/i.test(env.CANCEL_QUEUED || ""),
    billingMonth: env.BILLING_MONTH,
    stepSummary: env.GITHUB_STEP_SUMMARY,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configFromEnv(process.env);
  if (!config.token || !config.owner || !config.repo) {
    console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
    process.exit(1);
  }
  // --gate prints the gate job's `stale=` output line instead of the report.
  const work =
    process.argv[2] === "--gate"
      ? hasOtherRecentRuns(config).then((active) => console.log(`stale=${!active}`))
      : runWatchdog(config);
  work.catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}
