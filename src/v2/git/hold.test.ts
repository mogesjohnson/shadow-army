import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessGit, HarnessGitHeld } from "./harness.js";
import { changedFiles, HarnessHold, type HoldEvent } from "./hold.js";
import { addSubmodule, createHostileRepo, plantChange, type HostileRepo } from "./hostileRepo.testutil.js";

const folders: string[] = [];
const temp = () => { const folder = mkdtempSync(join(tmpdir(), "sa-hold-")); folders.push(folder); return folder; };
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const filter = '[filter "evil"]\n\tclean = evil-clean\n';

function setup() {
  const base = temp(), repo = createHostileRepo(base), hooksDir = join(base, "empty-hooks"), events: HoldEvent[] = [];
  mkdirSync(hooksDir);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: repo.globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const gitFor = (where: { gitDir: string; workTree: string; commonDir: string }) => new HarnessGit({ repo: where, hooksDir, env });
  const main = { gitDir: repo.gitDir, workTree: repo.root, commonDir: repo.gitDir };
  const open = () => new HarnessHold({ repo: main, gitFor, statePath: join(base, "log", "hold.json"), log: (event) => events.push(event) });
  return { repo, events, gitFor, main, open };
}

describe("harness git hold", () => {
  it("trusts the state at the start, and holds on a later change until it is undone", async () => {
    const { repo, events, open } = setup(), hold = open();
    expect(await hold.start()).toEqual({ held: false });
    expect(events[0]).toMatchObject({ event: "trusted" });
    expect(await hold.check()).toEqual({ held: false });
    for (const [change, file] of [["config", ".git/config"], ["hook", ".git/hooks/pre-rebase"], ["info", ".git/info/attributes"]] as const) {
      const undo = plantChange(repo, change);
      expect(await hold.check()).toEqual({ held: true, files: [file], line: `Shadow Army: harness git held · ${file} changed · undo it to go on` });
      undo();
      expect(await hold.check()).toEqual({ held: false });
    }
    expect(events.map((event) => event.event)).toEqual(["trusted", "held", "released", "held", "released", "held", "released"]);
    expect(events[1]).toMatchObject({ files: [".git/config"] });
  }, 60_000);

  it("holds for a filter added to the user's global config", async () => {
    const { repo, open } = setup(), hold = open();
    await hold.start();
    const undo = plantChange(repo, "global-filter");
    const check = await hold.check();
    expect(check.held && check.files.map((file) => file.split("/").pop())).toEqual(["global-config"]);
    undo();
    expect(await hold.check()).toEqual({ held: false });
  }, 60_000);

  it("keeps a filter in the config when the post office started, and holds nothing for `git push -u`", async () => {
    const { repo, open } = setup();
    appendFileSync(join(repo.gitDir, "config"), filter);
    const hold = open();
    expect(await hold.start()).toEqual({ held: false });
    const remote = join(temp(), "remote.git"), run = (...args: string[]) => execFileSync("git", args, { cwd: repo.root, stdio: "pipe", env: { ...process.env, GIT_CONFIG_GLOBAL: repo.globalConfig } });
    run("init", "-q", "--bare", remote); run("remote", "add", "origin", remote);
    try { run("-c", "core.hooksPath=/nowhere", "push", "-q", "-u", "origin", "HEAD"); } catch { /* the planted hooks may refuse */ }
    expect(readFileSync(join(repo.gitDir, "config"), "utf8")).toContain("[remote \"origin\"]");
    expect(await hold.check()).toEqual({ held: false });
  }, 60_000);

  it("stays held across starts until the change is gone, and says it can't be told from the owner's", async () => {
    const { repo, open } = setup(), first = open();
    await first.start();
    const undo = plantChange(repo, "config");
    await first.check();
    const restarted = await open().start(); // a new post office, as after a restart
    expect(restarted).toEqual({ held: true, files: [".git/config"], line: "Shadow Army: harness git held · .git/config differs from what the last post office trusted · can't be told from your own edit · undo it to go on" });
    expect(await open().start()).toMatchObject({ held: true });
    undo();
    expect(await open().start()).toEqual({ held: false });
  }, 60_000);

  it("trusts what the owner changed while no post office ran, unless a turn was left open", async () => {
    const { repo, open } = setup();
    await open().start();
    plantChange(repo, "config");
    expect(await open().start()).toEqual({ held: false });
    const hold = open();
    await hold.start();
    hold.setTurnOpen(true);
    plantChange(repo, "hook");
    expect(await open().start()).toMatchObject({ held: true, files: [".git/hooks/pre-rebase"] });
  }, 60_000);

  it("refuses to run harness git while held, and holds for a change a command leaves behind", async () => {
    const { repo, gitFor, main, open } = setup(), hold = open(), git = gitFor(main);
    await hold.start();
    expect((await hold.run(git, ["status", "--porcelain"], "guard")).code).toBe(0);
    await expect(hold.run(git, ["config", "filter.evil.clean", "x"])).rejects.toThrow("harness git held · Shadow Army: harness git held · .git/config changed");
    await expect(hold.run(git, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
    await git.run(["config", "--unset", "filter.evil.clean"]);
    expect((await hold.run(git, ["status"])).code).toBe(0);
    expect(repo.ran()).toEqual([]);
  }, 60_000);

  it("names the files that differ", () => {
    expect(changedFiles({ "config .git/config": "a", "x": "1" }, { "config .git/config": "b", "y": "2" })).toEqual([".git/config", "x", "y"]);
  });
});

describe("submodules", () => {
  const hostile = async (absorb: boolean) => {
    const context = setup();
    const folder = addSubmodule(context.repo, "sub", absorb);
    addSubmodule({ ...context.repo, root: folder } as HostileRepo, "deep");
    const hold = context.open(), ranBefore = context.repo.ran(); // building the repositories ran plain git, and its traps
    await hold.start();
    return { ...context, ranBefore, folder, hold, sub: absorb ? join(context.repo.gitDir, "modules", "sub") : join(folder, ".git") };
  };

  it("holds for a filter in a checked-out submodule's own config, and in one nested in it", async () => {
    for (const absorb of [false, true]) {
      const { hold, sub, folder } = await hostile(absorb);
      appendFileSync(join(sub, "config"), filter);
      expect(await hold.check()).toMatchObject({ held: true, files: [absorb ? ".git/modules/sub/config" : "sub/.git/config"] });
      writeFileSync(join(sub, "config"), readFileSync(join(sub, "config"), "utf8").replace(filter, ""));
      expect(await hold.check()).toEqual({ held: false });
      appendFileSync(join(folder, "deep", ".git", "config"), filter);
      expect(await hold.check()).toMatchObject({ held: true, files: ["sub/deep/.git/config"] });
    }
  }, 120_000);

  it("holds when the submodule's `.git` file, `commondir` or info/ is rewritten, or a repository is added as a gitlink", async () => {
    const { hold, folder, sub, repo, ranBefore } = await hostile(true);
    const own = join(temp(), "own");
    mkdirSync(own);
    rmSync(join(folder, ".git")); // Windows hides it, and a hidden file can't be opened for writing
    writeFileSync(join(folder, ".git"),`gitdir: ${sub.replace(/\\/g, "/")}\n`);
    expect(await hold.check()).toMatchObject({ held: true, files: ["sub/.git"] });
    writeFileSync(join(sub, "commondir"), own);
    mkdirSync(join(sub, "info"), { recursive: true });
    writeFileSync(join(sub, "info", "attributes"), "* filter=evil\n");
    const check = await hold.check();
    expect(check.held && check.files).toEqual(expect.arrayContaining(["sub/.git", ".git/modules/sub/commondir", ".git/modules/sub/info/attributes"]));
    expect(repo.ran()).toEqual(ranBefore); // harness git ran no trap
  }, 120_000);

  it("holds when a gitlink appears that the trusted state doesn't have", async () => {
    const { repo, open } = setup(), hold = open();
    await hold.start();
    addSubmodule(repo, "late");
    expect(await hold.check()).toMatchObject({ held: true, files: expect.arrayContaining(["late/.git"]) });
  }, 60_000);
});
