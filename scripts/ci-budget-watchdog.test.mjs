import { describe, expect, it } from "vitest";
import { runWatchdog } from "./ci-budget-watchdog.mjs";

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
