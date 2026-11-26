import { Command } from "commander";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerLiveCommand } from "./cli.js";

const fake = vi.hoisted(() => ({ request: vi.fn<(command: { action: string }) => Promise<unknown>>(), close: vi.fn(async () => {}), result: { status: "failed", text: "partial answer line 1\nline 2\nline 3\nline 4\nline 5\nline 6", refusal: false, error: { kind: "other", message: "read-only guard failed; partial work is retained at retained-worktree" } } }));
vi.mock("./client.js", () => ({ OfficeClient: class {
  request = fake.request;
  close = fake.close;
} }));
const originalExitCode = process.exitCode;
beforeEach(() => { fake.request.mockReset().mockImplementation(async (command) => command.action === "send" ? fake.result : {}); });
afterEach(() => { process.exitCode = originalExitCode; vi.restoreAllMocks(); fake.close.mockClear(); });

it("plain output exposes the failure and retained-worktree location even when a partial answer exceeds five lines", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const program = new Command(); registerLiveCommand(program);
  await program.parseAsync(["node", "sa", "live", "scout", "partial task"]);
  const rendered = [...output.mock.calls, ...errors.mock.calls].flat().join("\n");
  expect(rendered).toContain("partial answer line 1");
  expect(rendered).toContain("read-only guard failed");
  expect(rendered).toContain("retained-worktree");
  expect(process.exitCode).toBe(1);
  expect(fake.close).toHaveBeenCalled();
});

it("cancels during session opening without delivering the single task after opening finishes", async () => {
  let finishOpening!: () => void;
  const opening = new Promise<void>((done) => { finishOpening = done; });
  fake.request.mockImplementation((command) => command.action === "open" ? opening : Promise.resolve(fake.result));
  const initialListeners = process.listenerCount("SIGINT");
  const program = new Command(); registerLiveCommand(program);
  const running = program.parseAsync(["node", "sa", "live", "scout", "task must never be sent"]);
  try {
    await vi.waitFor(() => expect(fake.request).toHaveBeenCalledWith({ action: "open", soldier: "scout" }));
    process.emit("SIGINT");
    expect(fake.close).toHaveBeenCalled();
  } finally { finishOpening(); await running; }
  expect(fake.request.mock.calls.map(([command]) => command.action)).toEqual(["open"]);
  expect(process.exitCode).toBe(130);
  expect(process.listenerCount("SIGINT")).toBe(initialListeners);
});
