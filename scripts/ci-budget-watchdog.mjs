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
 * Exit 0 on a completed report. API/network errors exit 1 so the workflow
 * run shows red and gets noticed.
 */

const API = "https://api.github.com";
const REPORT_MARKER = "<!-- ci-budget-watchdog:report -->";
const MULTIPLIERS = { linux: 1, windows: 2, macos: 10 };
const WARN_AT = 50;
const HIGH_AT = 80;
const CRITICAL_AT = 95;

const token = process.env.GITHUB_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY || "";
const [owner, repo] = repoFull.split("/");
const issueNumber = process.env.ISSUE_NUMBER || "";
const budget = Math.max(1, parseInt(process.env.BUDGET_MINUTES || "3000", 10));
const cancelQueued = /^(true|1|yes)$/i.test(process.env.CANCEL_QUEUED || "");
const billingMonth = process.env.BILLING_MONTH || new Date().toISOString().slice(0, 7); // YYYY-MM

if (!token || !owner || !repo) {
  console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  process.exit(1);
}

function osOf(labels) {
  const l = (labels || []).join(" ").toLowerCase();
  if (l.includes("macos")) return "macos";
  if (l.includes("windows")) return "windows";
  return "linux";
}

function billedMinutesForJob(job) {
  if (!job.started_at || !job.completed_at) return null; // still running: not billable yet
  const ms = new Date(job.completed_at) - new Date(job.started_at);
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return minutes * MULTIPLIERS[osOf(job.labels)];
}

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
    throw new Error(
      `GitHub API ${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`
    );
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

function monthWindow(ym) {
  const [y, m] = ym.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)) };
}

function statusFor(pct) {
  if (pct >= CRITICAL_AT) return "CRITICAL";
  if (pct >= HIGH_AT) return "HIGH";
  if (pct >= WARN_AT) return "WARNING";
  return "OK";
}

async function upsertComment(body) {
  const comments = await paginate(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
  const existing = comments.find((c) => (c.body || "").includes(REPORT_MARKER));
  if (existing) {
    await gh(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: { body },
    });
    console.log(`updated report comment ${existing.id}`);
  } else {
    const created = await gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: { body },
    });
    console.log(`created report comment ${created.id}`);
  }
}

function renderReport({ monthLabel, total, byWorkflow, byOs, top, daysElapsed, daysInMonth, projected, pct, status }) {
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

async function main() {
  const { start } = monthWindow(billingMonth);
  const now = new Date();
  const runs = await paginate(`/repos/${owner}/${repo}/actions/runs`, {
    key: "workflow_runs",
    params: { created: `>${start.toISOString()}` },
  });

  let total = 0;
  const byWorkflow = new Map();
  const byOs = { linux: 0, windows: 0, macos: 0 };
  const runRows = [];
  const queued = [];
  let skippedRunning = 0;

  for (const run of runs) {
    if (run.status === "queued") queued.push(run);
    const jobs = await paginate(`/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`, { key: "jobs" });
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
  const daysElapsed = Math.max((now - start) / 86400000, 1 / 24);
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = Math.round((total / daysElapsed) * daysInMonth);
  const monthLabel = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const report = renderReport({
    monthLabel,
    total,
    byWorkflow,
    byOs,
    top: runRows.slice(0, 5),
    daysElapsed,
    daysInMonth,
    projected,
    pct,
    status,
  });

  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
  if (issueNumber) await upsertComment(report);

  if (cancelQueued) {
    if (status !== "CRITICAL") {
      console.log(`cancel_queued requested but status is ${status} (< ${CRITICAL_AT}%); nothing cancelled.`);
    } else {
      let cancelled = 0;
      for (const run of queued) {
        await gh(`/repos/${owner}/${repo}/actions/runs/${run.id}/cancel`, { method: "POST" });
        cancelled++;
        console.log(`cancelled queued run ${run.id} (${run.name})`);
      }
      console.log(`cancelled ${cancelled} queued run(s); in_progress runs untouched.`);
    }
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
