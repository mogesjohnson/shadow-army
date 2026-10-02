import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRoster } from "./core/roster.testutil.js";
import { SummonError } from "./core/summon.js";

const mocks = vi.hoisted(() => ({
  loadRoster: vi.fn(),
  summon: vi.fn(),
  stop: vi.fn(async () => {}),
  startLive: vi.fn(),
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
