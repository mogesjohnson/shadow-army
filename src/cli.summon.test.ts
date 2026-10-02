import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRoster } from "./core/roster.testutil.js";
import { SummonError } from "./core/summon.js";

const mocks = vi.hoisted(() => ({
  loadRoster: vi.fn(),
  summon: vi.fn(),
  stop: vi.fn(async () => {}),
  startLive: vi.fn(),
  applyToCheckout: vi.fn(),
  recordApplied: vi.fn(),
}));

vi.mock("./core/roster.js", async (original) => ({
  ...await original<typeof import("./core/roster.js")>(),
  loadRoster: mocks.loadRoster,
}));
vi.mock("./core/summon.js", async (original) => ({
  ...await original<typeof import("./core/summon.js")>(),
  summon: mocks.summon,
}));
vi.mock("./ui/live.js", async (original) => ({
  ...await original<typeof import("./ui/live.js")>(),
  liveScreensFor: () => true,
  startLive: mocks.startLive,
}));
vi.mock("./workspace/apply.js", async (original) => ({
  ...await original<typeof import("./workspace/apply.js")>(),
  applyToCheckout: mocks.applyToCheckout,
}));
vi.mock("./workspace/ledger.js", async (original) => ({
  ...await original<typeof import("./workspace/ledger.js")>(),
  recordApplied: mocks.recordApplied,
}));
vi.mock("./workspace/git.js", async (original) => ({
  ...await original<typeof import("./workspace/git.js")>(),
  repoRoot: async () => "REPO",
}));

const argv = process.argv;
const exitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.loadRoster.mockReturnValue(makeRoster({
    free: { cli: "fake", model: "m", roles: ["orchestrate", "test", "research"] },
  }));
  mocks.startLive.mockReturnValue({ update: vi.fn(), stop: mocks.stop });
  mocks.summon.mockResolvedValue({
    soldier: "free", role: "test", model: "m", status: "ok", summary: "done",
    filesTouched: [], openQuestions: [], notes: [], structured: true, durationMs: 1,
  });
  process.exitCode = undefined;
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
});

async function run(soldier = "free", args: string[] = []) {
  process.argv = ["node", "sa", "summon", soldier, "check the project", "--no-vault", ...args];
  await import("./cli.js");
}

describe("summon live status", () => {
  it("shows and dispatches the first non-orchestrate role when --role is omitted", async () => {
    await run();
    expect(mocks.startLive).toHaveBeenCalledWith(
      expect.objectContaining({ label: "free [test] is working" }), expect.any(Function),
    );
    expect(mocks.summon).toHaveBeenCalledWith(expect.objectContaining({ soldier: "free", role: "test" }));
    expect(mocks.stop).toHaveBeenCalledWith(expect.objectContaining({ done: "ok" }));
  });

  it("shows and dispatches the explicitly selected role", async () => {
    await run("free", ["--role", "research"]);
    expect(mocks.startLive).toHaveBeenCalledWith(
      expect.objectContaining({ label: "free [research] is working" }), expect.any(Function),
    );
    expect(mocks.summon).toHaveBeenCalledWith(expect.objectContaining({ role: "research" }));
  });

  it("preserves the clean refusal for an unknown soldier", async () => {
    mocks.summon.mockRejectedValue(new SummonError('unknown soldier "missing"'));
    await run("missing");
    expect(console.error).toHaveBeenCalledWith('refused: unknown soldier "missing"');
    expect(mocks.stop).toHaveBeenCalledWith(expect.objectContaining({ done: "error" }));
    expect(process.exitCode).toBe(2);
  });
});

describe("summon --write applies its work to the folder", () => {
  // `changed: false` is a write run whose branch holds nothing, so the workspace has no commit.
  const writeReport = (status: "ok" | "error", changed = true) => ({
    soldier: "free", role: "build", model: "m", status, summary: "done",
    filesTouched: ["x.txt"], openQuestions: [], notes: [], structured: true, durationMs: 1,
    workspace: {
      branch: "shadow/free/t1", path: "WT", base: "BASE", claims: ["x.txt"], touched: ["x.txt"], inScope: ["x.txt"],
      outOfScope: [], reverted: false, commit: changed ? "abc1234" : undefined, leaseLost: false,
    },
  });
  const write = ["--role", "build", "--write", "--claim", "x.txt"];
  const printed = () => vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join("\n");

  beforeEach(() => {
    mocks.loadRoster.mockReturnValue(makeRoster({ free: { cli: "fake", model: "m", roles: ["build"] } }));
    mocks.applyToCheckout.mockResolvedValue({ applied: true, files: [{ change: "A", path: "x.txt" }] });
    mocks.recordApplied.mockResolvedValue({});
  });

  it("applies the soldier's branch to the repository's folder and says how to keep or undo it", async () => {
    mocks.summon.mockResolvedValue(writeReport("ok"));
    await run("free", write);
    expect(mocks.applyToCheckout).toHaveBeenCalledWith("REPO", "BASE", "shadow/free/t1");
    expect(printed()).toContain("Applied to your folder (not committed):\n  A  x.txt");
    expect(printed()).toContain("Undo it:     sa undo shadow/free/t1");
    expect(printed()).toContain("Backup:      shadow/free/t1");
  });

  it("records the apply for `sa undo`, with the branch as its id", async () => {
    mocks.summon.mockResolvedValue(writeReport("ok"));
    await run("free", write);
    expect(mocks.recordApplied).toHaveBeenCalledTimes(1);
    expect(mocks.recordApplied).toHaveBeenCalledWith("REPO", join("REPO", ".shadow"), {
      id: "shadow/free/t1", kind: "summon", base: "BASE", branch: "shadow/free/t1", files: [{ change: "A", path: "x.txt" }],
    });
  });

  it("still shows the result, with a warning, when the ledger cannot be written", async () => {
    mocks.summon.mockResolvedValue(writeReport("ok"));
    mocks.recordApplied.mockRejectedValue(new Error("disk full"));
    await run("free", write);
    expect(printed()).toContain("Applied to your folder (not committed):");
    expect(printed()).toContain("Warning: the changes are in your folder, but could not be recorded for `sa undo`: disk full");
  });

  it("records nothing when nothing was applied", async () => {
    mocks.summon.mockResolvedValue(writeReport("ok"));
    mocks.applyToCheckout.mockResolvedValue({ applied: false, reason: "your folder changed, since the run started, in files the run also changed", clashes: ["x.txt"] });
    await run("free", write);
    expect(mocks.recordApplied).not.toHaveBeenCalled();
    expect(printed()).toContain("Not applied to your folder");
  });

  it("includes the apply result in --json", async () => {
    mocks.summon.mockResolvedValue(writeReport("ok"));
    await run("free", [...write, "--json"]);
    expect(JSON.parse(printed())).toMatchObject({ status: "ok", applied: { applied: true, files: [{ change: "A", path: "x.txt" }] } });
  });

  it("applies nothing with --no-apply, after a failed run, or when the soldier changed nothing", async () => {
    mocks.summon.mockResolvedValue(writeReport("ok"));
    await run("free", [...write, "--no-apply"]);
    vi.resetModules();
    mocks.summon.mockResolvedValue(writeReport("error"));
    await run("free", write);
    vi.resetModules();
    mocks.summon.mockResolvedValue(writeReport("ok", false));
    await run("free", write);
    expect(mocks.applyToCheckout).not.toHaveBeenCalled();
    expect(printed()).not.toContain("Applied to your folder");
  });
});
