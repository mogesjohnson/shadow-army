import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { hasOtherRecentRuns, runWatchdog } from "./ci-budget-watchdog.mjs";

const OWNER = "o";
const REPO = "r";
const RUNS = `/repos/${OWNER}/${REPO}/actions/runs`;

function respond(status, data) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

// A stateful stand-in for the GitHub REST API: the run list (with GitHub's
// 1,000-result cap on created-filtered queries), job lists (filter=latest by
// default, as documented), single runs and cancellation. `onRequest` runs before
// each answer, so a test can change a run's state mid-enumeration.
function fakeGitHub({ runs, jobs = {}, onRequest = () => {} }) {
  const requests = [];
  async function fetch(url, { method = "GET" } = {}) {
    const { pathname, searchParams } = new URL(url);
    const params = Object.fromEntries(searchParams);
    requests.push({ method, path: pathname, params });
    onRequest({ method, path: pathname, params, runs });

    if (method === "GET" && pathname === RUNS) {
      let matching = runs;
      const created = params.created || "";
      if (created.includes("..")) {
        const [from, to] = created.split("..").map((s) => new Date(s));
        matching = runs.filter((r) => new Date(r.created_at) >= from && new Date(r.created_at) <= to);
      } else if (created.startsWith(">")) {
        const since = new Date(created.slice(1));
        matching = runs.filter((r) => new Date(r.created_at) > since);
      }
      matching = [...matching].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const perPage = Number(params.per_page || 30);
      const page = Number(params.page || 1);
      const reachable = created ? matching.slice(0, 1000) : matching;
      const workflow_runs = reachable.slice((page - 1) * perPage, page * perPage);
      return respond(200, { total_count: matching.length, workflow_runs });
    }

    let m = pathname.match(/\/actions\/runs\/(\d+)\/jobs$/);
    if (method === "GET" && m) {
      const all = jobs[m[1]] || [];
      const latest = Math.max(1, ...all.map((j) => j.run_attempt || 1));
      const listed = params.filter === "all" ? all : all.filter((j) => (j.run_attempt || 1) === latest);
      return respond(200, { total_count: listed.length, jobs: listed });
    }

    m = pathname.match(/\/actions\/runs\/(\d+)\/cancel$/);
    if (method === "POST" && m) {
      const run = runs.find((r) => String(r.id) === m[1]);
      if (!run) return respond(404, { message: "Not Found" });
      if (run.status === "completed") {
        return respond(409, { message: "Cannot cancel a workflow run that is completed." });
      }
      run.status = "completed";
      run.conclusion = "cancelled";
      return respond(202, {});
    }

    m = pathname.match(/\/actions\/runs\/(\d+)$/);
    if (method === "GET" && m) {
      const run = runs.find((r) => String(r.id) === m[1]);
      return run ? respond(200, run) : respond(404, { message: "Not Found" });
    }

    return respond(404, { message: `fake has no route for ${method} ${pathname}` });
  }
  return { fetch, requests };
}

function run(id, { name = "CI", created = "2026-10-13T14:23:00Z", status = "completed", path = ".github/workflows/ci.yml" } = {}) {
  return { id, name, path, status, event: "push", created_at: created, html_url: `https://github.com/${OWNER}/${REPO}/actions/runs/${id}` };
}

function job(id, { name, os = "ubuntu-latest", start, end, attempt = 1, runner = 1000000001, conclusion = "success" }) {
  return {
    id,
    name,
    run_attempt: attempt,
    status: "completed",
    conclusion,
    runner_id: runner,
    runner_name: runner == null ? null : `GitHub Actions ${runner}`,
    started_at: start,
    completed_at: end,
    labels: [os],
  };
}

function watch(fake, options = {}) {
  const lines = [];
  return runWatchdog({
    token: "t",
    owner: OWNER,
    repo: REPO,
    billingMonth: "2026-10",
    now: new Date("2026-10-29T12:00:00Z"),
    fetch: fake.fetch,
    log: (line) => lines.push(line),
    ...options,
  }).then((result) => ({ ...result, lines }));
}

describe("billed-minute estimate", () => {
  it("rounds each job up to whole minutes and applies its OS multiplier", async () => {
    const fake = fakeGitHub({
      runs: [run(1)],
      jobs: {
        1: [
          job(11, { name: "test (ubuntu-latest)", start: "2026-10-13T14:23:45Z", end: "2026-10-13T14:24:36Z" }),
          job(12, { name: "test (windows-latest)", os: "windows-latest", start: "2026-10-13T14:23:45Z", end: "2026-10-13T14:28:37Z" }),
          job(13, { name: "test (macos-latest)", os: "macos-latest", start: "2026-10-13T14:23:49Z", end: "2026-10-13T14:24:24Z" }),
        ],
      },
    });
    const { total, byOs, status } = await watch(fake);
    expect(byOs).toEqual({ linux: 1, windows: 10, macos: 10 });
    expect(total).toBe(21);
    expect(status).toBe("OK");
  });

  it("counts every attempt's executions once, not only the latest attempt", async () => {
    // Job records of run 38412963172: Windows failed, was re-run and failed
    // again; the re-run carried Ubuntu and macOS forward under new ids.
    const fake = fakeGitHub({
      runs: [run(38412963172)],
      jobs: {
        38412963172: [
          job(115349815756, { name: "test (windows-latest)", os: "windows-latest", attempt: 1, runner: 1000000561, conclusion: "failure", start: "2026-10-13T14:23:45Z", end: "2026-10-13T14:28:37Z" }),
          job(115349816352, { name: "test (ubuntu-latest)", attempt: 1, runner: 1000000562, start: "2026-10-13T14:23:45Z", end: "2026-10-13T14:24:36Z" }),
          job(115349816480, { name: "test (macos-latest)", os: "macos-latest", attempt: 1, runner: 1000000563, start: "2026-10-13T14:23:49Z", end: "2026-10-13T14:24:24Z" }),
          job(115407157913, { name: "test (windows-latest)", os: "windows-latest", attempt: 2, runner: 1000000573, conclusion: "failure", start: "2026-10-13T16:18:07Z", end: "2026-10-13T16:23:16Z" }),
          job(115407160543, { name: "test (macos-latest)", os: "macos-latest", attempt: 2, runner: 1000000563, start: "2026-10-13T14:23:49Z", end: "2026-10-13T14:24:24Z" }),
          job(115407213420, { name: "test (ubuntu-latest)", attempt: 2, runner: 1000000562, start: "2026-10-13T14:23:45Z", end: "2026-10-13T14:24:36Z" }),
        ],
      },
    });
    const { total, byOs } = await watch(fake);
    // Windows 10 + 12, Ubuntu 1, macOS 10: not 23 (latest attempt only) or 44 (copies counted twice).
    expect(byOs).toEqual({ linux: 1, windows: 22, macos: 10 });
    expect(total).toBe(33);
  });

  it("charges nothing for a job that was skipped and never got a runner", async () => {
    // Job records of run 40446447077: the draft gate was skipped; only the 22 s test ran.
    const fake = fakeGitHub({
      runs: [run(40446447077, { created: "2026-10-27T03:51:00Z" })],
      jobs: {
        40446447077: [
          job(121998771860, { name: "test (ubuntu-latest)", runner: 1000002025, start: "2026-10-27T03:51:03Z", end: "2026-10-27T03:51:25Z" }),
          job(121998773507, { name: "gate", runner: null, conclusion: "skipped", start: "2026-10-27T03:51:02Z", end: "2026-10-27T03:51:02Z" }),
        ],
      },
    });
    const { total } = await watch(fake);
    expect(total).toBe(1);
  });
});

describe("idle gate", () => {
  const WATCHDOG = ".github/workflows/ci-budget-watchdog.yml";
  const now = new Date("2026-10-29T07:24:00Z");
  const gate = (runs) =>
    hasOtherRecentRuns({ token: "t", owner: OWNER, repo: REPO, now, fetch: fakeGitHub({ runs }).fetch });
  const watchdogRuns = [
    // This run, asking, and yesterday's scheduled run, both inside the 25 h window.
    run(2, { name: "CI budget watchdog", path: WATCHDOG, status: "in_progress", created: "2026-10-29T07:23:30Z" }),
    run(1, { name: "CI budget watchdog", path: `${WATCHDOG}@refs/heads/main`, created: "2026-10-28T07:23:10Z" }),
  ];

  it("reports idle when only the watchdog itself ran", async () => {
    expect(await gate([...watchdogRuns, run(3, { created: "2026-10-28T06:00:00Z" })])).toBe(false);
  });

  it("reports activity when any other workflow ran", async () => {
    expect(await gate([...watchdogRuns, run(3, { created: "2026-10-29T05:00:00Z" })])).toBe(true);
  });

  it("is the check the workflow's gate job runs", () => {
    const workflow = parse(readFileSync(new URL(`../${WATCHDOG}`, import.meta.url), "utf8"));
    const steps = workflow.jobs.gate.steps.map((s) => s.run).filter(Boolean);
    expect(steps).toEqual(['node scripts/ci-budget-watchdog.mjs --gate | tee -a "$GITHUB_OUTPUT"']);
  });
});

describe("cancel_queued", () => {
  it("re-reads each queued run and never cancels one that started or finished meanwhile", async () => {
    // Run 1 alone puts the month at 200% of a 10-minute budget: CRITICAL.
    const runs = [
      run(1, { created: "2026-10-02T00:00:00Z" }),
      run(2, { created: "2026-10-05T00:00:00Z", status: "queued" }),
      run(3, { created: "2026-10-04T00:00:00Z", status: "queued" }),
      run(4, { created: "2026-10-03T00:00:00Z", status: "queued" }),
    ];
    const fake = fakeGitHub({
      runs,
      jobs: { 1: [job(11, { name: "build", start: "2026-10-02T00:01:00Z", end: "2026-10-02T00:21:00Z" })] },
      onRequest: ({ method, path, runs }) => {
        const byId = (id) => runs.find((r) => r.id === id);
        // Run 2 starts while the month's jobs are still being listed.
        if (path === `${RUNS}/1/jobs`) byId(2).status = "in_progress";
        // Run 3 finishes between its re-read and its cancel POST.
        if (method === "POST" && path === `${RUNS}/3/cancel`) byId(3).status = "completed";
      },
    });
    const { status, cancelled, lines } = await watch(fake, { budget: 10, cancelQueued: true });

    expect(status).toBe("CRITICAL");
    expect(fake.requests.some((r) => r.method === "POST" && r.path === `${RUNS}/2/cancel`)).toBe(false);
    expect(cancelled).toEqual([4]);
    expect(lines).toContain("left run 2 (CI) alone: in_progress, not queued");
    expect(lines).toContain("left run 3 (CI) alone: completed before the cancel");
  });
});
