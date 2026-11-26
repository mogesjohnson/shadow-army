import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git } from "../workspace/git.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { makeRoster } from "../core/roster.testutil.js";
import type { ChannelOptions, NativeChannel, TurnResult, WriteOutcome } from "./channel.js";
import { applyAudited } from "./apply.js";
import { HarnessGit, HarnessGitHeld, HarnessGitTimeout, type GitResult } from "./git/harness.js";
import { HarnessGitHeldAfter } from "./git/hold.js";
import type { RunGit } from "./snapshot.js";
import { findRepo, PostOffice, type OfficeEvent } from "./postOffice.js";
import { credential, factory, until } from "./fixture-main.testutil.js";
import { windowsOnly } from "./windowsOnly.testutil.js";

const offices: PostOffice[] = [];
const repos: ReturnType<typeof makeRepo>[] = [];
const builders = makeRoster({ tank: { cli: "claude", model: "synthetic", roles: ["build"], write: true } });
afterEach(async () => {
  await Promise.all(offices.splice(0).map((office) => office.close()));
  repos.splice(0).forEach((repo) => repo.cleanup());
});

/** A channel that writes the given files into its cwd, then answers with `result`. */
async function writer(files: Record<string, string>, result: TurnResult = { status: "completed", text: "done", refusal: false }, extra?: (repo: ReturnType<typeof makeRepo>) => void) {
  const repo = makeRepo(); repos.push(repo);
  const events: OfficeEvent[] = [];
  const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, onEvent: (event) => events.push(event), channelFactory: (options: ChannelOptions): NativeChannel => ({
    async send() {
      for (const [name, body] of Object.entries(files)) { await mkdir(dirname(join(options.cwd, name)), { recursive: true }); await writeFile(join(options.cwd, name), body); }
      extra?.(repo);
      return result;
    }, async interrupt() {}, async respondApproval() {}, async close() {},
  }) }); offices.push(office);
  return { repo, office, events };
}

describe("M1-AC28: the audited change lands in the owner's folder, uncommitted", () => {
  it("applies the claimed edit and a new file as unstaged changes, with HEAD unmoved, and lists them for the card", async () => {
    const { repo, office } = await writer({ "src/a.ts": "claimed edit\n", "src/new.ts": "brand new\n" });
    const head = repo.git("rev-parse", "HEAD");
    const result = await office.send("tank", "edit", { claims: ["src/**"] });
    const apply = result.write!.apply!;
    expect(apply.applied).toBe(true);
    if (apply.applied) expect(apply.files.map((f) => `${f.change} ${f.path}`).sort()).toEqual(["A src/new.ts", "M src/a.ts"]);
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("claimed edit\n");
    expect(await readFile(join(repo.dir, "src/new.ts"), "utf8")).toBe("brand new\n");
    expect(repo.git("rev-parse", "HEAD")).toBe(head);
    expect(repo.git("diff", "--cached", "--name-only")).toBe("");
    expect(repo.git("status", "--porcelain")).toContain("src/new.ts");
    expect(repo.git("status", "--porcelain")).toContain("src/a.ts");
  }, 30_000);

  it("applies nothing and gives the reason when the owner has local changes to a file the soldier changed", async () => {
    const repo = makeRepo(); repos.push(repo);
    repo.write("src/a.ts", "owner's own edit\n");
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, channelFactory: (options): NativeChannel => ({
      async send() { await writeFile(join(options.cwd, "src/a.ts"), "soldier edit\n"); return { status: "completed", text: "done", refusal: false }; },
      async interrupt() {}, async respondApproval() {}, async close() {},
    }) }); offices.push(office);
    const result = await office.send("tank", "edit", { claims: ["src/a.ts"] });
    const write = result.write!;
    expect(write.applicable).toBe(true);
    expect(write.apply).toMatchObject({ applied: false, clashes: ["src/a.ts"] });
    expect(write.apply && !write.apply.applied && write.apply.reason).toContain("uncommitted changes");
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("owner's own edit\n");
    expect(await git(write.worktree, ["show", `${write.branch}:src/a.ts`])).toContain("soldier edit");
  }, 30_000);

  it("applies nothing for a failed turn, and the branch keeps its claimed work", async () => {
    const { repo, office } = await writer({ "src/a.ts": "half done\n" }, { status: "failed", text: "", refusal: false, error: { kind: "rate_limit", message: "429" } });
    const result = await office.send("tank", "edit", { claims: ["src/a.ts"] });
    expect(result.status).toBe("failed");
    expect(result.write?.applicable).toBe(false);
    expect(result.write?.apply).toBeUndefined();
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("a\n");
    expect(repo.git("status", "--porcelain")).not.toContain("src/a.ts");
  }, 30_000);

  windowsOnly("applies nothing for a cancelled turn", async () => {
    const repo = makeRepo(); repos.push(repo);
    const events: OfficeEvent[] = [];
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, onEvent: (event) => events.push(event), channelFactory: factory }); offices.push(office);
    await office.open("tank", { claims: ["partial.txt"] });
    const pending = office.send("tank", "partial");
    await until(() => events.some((event) => event.type === "tool_call"));
    await office.interrupt("tank");
    const result = await pending;
    expect(result.status).not.toBe("completed");
    expect(result.write?.apply).toBeUndefined();
    await expect(readFile(join(repo.dir, "partial.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("applies nothing when the checkout guard fails, and nothing when the soldier changed nothing", async () => {
    const guarded = await writer({ "src/a.ts": "edit\n" }, undefined, (owner) => owner.write("README.md", "changed under the turn\n"));
    const failed = await guarded.office.send("tank", "edit", { claims: ["src/a.ts"] });
    expect(failed.status).toBe("failed");
    expect(failed.write?.apply).toBeUndefined();
    expect(await readFile(join(guarded.repo.dir, "src/a.ts"), "utf8")).toBe("a\n");
    const idle = await writer({});
    const none = await idle.office.send("tank", "look", { claims: ["src/a.ts"] });
    expect(none.write?.applicable).toBe(false);
    expect(none.write?.apply).toBeUndefined();
  }, 60_000);

  it("applies a later turn's new file on its own, not the earlier turn's again", async () => {
    const repo = makeRepo(); repos.push(repo);
    let turn = 0;
    const office = await PostOffice.create({ cwd: repo.dir, credential, roster: builders, channelFactory: (options): NativeChannel => ({
      async send() { await writeFile(join(options.cwd, turn++ ? "src/b.ts" : "src/a.ts"), `turn ${turn}\n`); return { status: "completed", text: "done", refusal: false }; },
      async interrupt() {}, async respondApproval() {}, async close() {},
    }) }); offices.push(office);
    const first = await office.send("tank", "one", { claims: ["src/**"] });
    const second = await office.send("tank", "two");
    expect(first.write?.apply).toMatchObject({ applied: true, files: [{ change: "M", path: "src/a.ts" }] });
    expect(second.write?.apply).toMatchObject({ applied: true, files: [{ change: "M", path: "src/b.ts" }] });
    expect(await readFile(join(repo.dir, "src/b.ts"), "utf8")).toBe("turn 2\n");
  }, 30_000);

  it("applyAudited refuses a non-applicable outcome without touching git", async () => {
    const write = { applicable: false, reason: "the turn failed", base: "x", branch: "y" } as WriteOutcome;
    const run = () => { throw new Error("git ran"); };
    expect(await applyAudited(run, write)).toEqual({ applied: false, reason: "the turn failed", clashes: [] });
    expect(await applyAudited(run, { ...write, reason: undefined })).toMatchObject({ applied: false });
  });

  it("applies the audited commit by its id through harness git, not the branch, which moved after the audit (review 15 C1)", async () => {
    const repo = makeRepo(); repos.push(repo);
    const base = repo.git("rev-parse", "HEAD"), wt = mkdtempSync(join(tmpdir(), "sa-apply-wt-"));
    repo.git("worktree", "add", "-q", "-b", "shadow/tank/t1", wt, base);
    await writeFile(join(wt, "src/a.ts"), "audited\n");
    await git(wt, ["commit", "-qam", "audited"]);
    const audited = (await git(wt, ["rev-parse", "HEAD"])).trim();
    await writeFile(join(wt, "src/a.ts"), "moved on\n");
    await writeFile(join(wt, "src/c.ts"), "later\n");
    await git(wt, ["add", "-A"]);
    await git(wt, ["commit", "-qm", "after the audit"]);
    const harness = new HarnessGit({ repo: findRepo(repo.dir), hooksDir: mkdtempSync(join(tmpdir(), "sa-apply-hooks-")) });
    const ran: string[] = [];
    const run: RunGit = (args, kind, cwd) => { ran.push(args[0]!); return harness.run(args, kind, cwd); };
    const write = { applicable: true, base, commit: audited, branch: "shadow/tank/t1" } as WriteOutcome;
    // A changed id refuses before anything is applied: an abbreviation, or an id no commit has.
    for (const commit of [audited.slice(0, 12), "0".repeat(40)]) {
      expect(await applyAudited(run, { ...write, commit })).toMatchObject({ applied: false, reason: expect.stringContaining("is not a commit in the repository") });
    }
    expect(await applyAudited(run, write)).toEqual({ applied: true, files: [{ change: "M", path: "src/a.ts" }] });
    expect(await readFile(join(repo.dir, "src/a.ts"), "utf8")).toBe("audited\n");
    expect(existsSync(join(repo.dir, "src/c.ts"))).toBe(false);
    expect(ran).toContain("apply");
    repo.git("worktree", "remove", "--force", wt);
  }, 30_000);

  /** A repository whose audited commit edits src/a.ts and adds src/new.ts, and harness git that fails as `fail` says once `apply` has run. */
  async function interrupted(fail: (args: string[], applied: boolean) => Error | GitResult | undefined) {
    const repo = makeRepo(); repos.push(repo);
    const base = repo.git("rev-parse", "HEAD"), wt = mkdtempSync(join(tmpdir(), "sa-apply-wt-"));
    repo.git("worktree", "add", "-q", "-b", "shadow/tank/t1", wt, base);
    await writeFile(join(wt, "src/a.ts"), "audited\n");
    await writeFile(join(wt, "src/new.ts"), "new\n");
    await git(wt, ["add", "-A"]);
    await git(wt, ["commit", "-qm", "audited"]);
    const commit = (await git(wt, ["rev-parse", "HEAD"])).trim();
    const harness = new HarnessGit({ repo: findRepo(repo.dir), hooksDir: mkdtempSync(join(tmpdir(), "sa-apply-hooks-")) });
    let applied = false;
    const run: RunGit = async (args, kind, cwd) => {
      const before = fail(args, applied);
      if (before instanceof Error) throw before;
      if (before) return before;
      const result = await harness.run(args, kind, cwd);
      if (args[0] === "apply" && args.length === 3 && result.code === 0) { applied = true; const after = fail(["after", ...args], applied); if (after instanceof Error) throw after; }
      if (args[0] === "apply" && args[1] === "-R" && args.length === 4) { const after = fail(["after-undo"], applied); if (after instanceof Error) throw after; }
      return result;
    };
    const result = await applyAudited(run, { applicable: true, base, commit, branch: "shadow/tank/t1" } as WriteOutcome);
    repo.git("worktree", "remove", "--force", wt);
    return { repo, result, a: await readFile(join(repo.dir, "src/a.ts"), "utf8") };
  }
  const both = [{ change: "M", path: "src/a.ts" }, { change: "A", path: "src/new.ts" }];

  it("reports the edits as applied when a hold after git apply leaves them in the folder and nothing can take them out (#136 self-review)", async () => {
    // Held by the check after `apply`: every later command is held too, `add -N` and `apply -R` included.
    const held = await interrupted((args, applied) => args[0] === "after" ? new HarnessGitHeldAfter("held", { code: 0, stdout: "", stderr: "" }) : applied ? new HarnessGitHeld("held") : undefined);
    expect(held.a).toBe("audited\n");
    expect(held.result).toEqual({ applied: true, files: both });
    // Held before `add -N` runs.
    const before = await interrupted((args, applied) => applied && args[0] !== "after" ? new HarnessGitHeld("held") : undefined);
    expect(before.a).toBe("audited\n");
    expect(before.result).toEqual({ applied: true, files: both });
  }, 60_000);

  it("finds out whether a git apply stopped at its time limit landed, and reports nothing applied only when the folder is unchanged", async () => {
    const landed = await interrupted((args) => args[0] === "after" ? new HarnessGitTimeout("other", 60_000) : undefined);
    expect(landed).toMatchObject({ a: "audited\n", result: { applied: true, files: both } });
    const none = await interrupted((args) => args[0] === "apply" && args.length === 3 ? new HarnessGitTimeout("other", 60_000) : undefined);
    expect(none).toMatchObject({ a: "a\n", result: { applied: false, reason: expect.stringContaining("git took longer") } });
  }, 60_000);

  it("takes the edits back out when add -N fails and the undo works, and says nothing was applied", async () => {
    const failed = await interrupted((args) => args[0] === "add" ? { code: 1, stdout: "", stderr: "fatal: no" } : undefined);
    expect(failed).toMatchObject({ a: "a\n", result: { applied: false, reason: "fatal: no" } });
    expect(existsSync(join(failed.repo.dir, "src/new.ts"))).toBe(false);
    // The undo ran and took the edits out, then a hold was seen after it: still nothing applied.
    const undone = await interrupted((args) => args[0] === "add" ? { code: 1, stdout: "", stderr: "fatal: no" } : args[0] === "after-undo" ? new HarnessGitHeldAfter("held", { code: 0, stdout: "", stderr: "" }) : undefined);
    expect(undone).toMatchObject({ a: "a\n", result: { applied: false, reason: "fatal: no" } });
  }, 60_000);

  it("says part of the changes may be in the folder when git apply failed and a hold stops finding out (self-review P1)", async () => {
    const held = await interrupted((args, applied) => args[0] === "after" ? new HarnessGitHeldAfter("held", { code: 1, stdout: "", stderr: "" }) : applied ? new HarnessGitHeld("held") : undefined);
    expect(held.result).toMatchObject({ applied: false, reason: expect.stringContaining("may be in your folder: src/a.ts, src/new.ts") });
  }, 60_000);
});
