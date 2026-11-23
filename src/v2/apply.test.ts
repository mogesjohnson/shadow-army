import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git } from "../workspace/git.js";
import { makeRepo } from "../workspace/testRepo.testutil.js";
import { makeRoster } from "../core/roster.testutil.js";
import type { ChannelOptions, NativeChannel, TurnResult, WriteOutcome } from "./channel.js";
import { applyAudited } from "./apply.js";
import { PostOffice, type OfficeEvent } from "./postOffice.js";
import { credential, factory, until } from "./fixture-main.testutil.js";

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

  it("applies nothing for a cancelled turn", async () => {
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
    expect(await applyAudited("/does/not/exist", write)).toEqual({ applied: false, reason: "the turn failed", clashes: [] });
    expect(await applyAudited("/does/not/exist", { ...write, reason: undefined })).toMatchObject({ applied: false });
  });
});
