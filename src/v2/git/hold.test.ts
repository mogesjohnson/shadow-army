import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HarnessGit, HarnessGitHeld, HarnessGitTimeout } from "./harness.js";
import { changedFiles, HarnessHold, withConfig, type GitRepo, type GitRunner, type HoldEvent } from "./hold.js";
import { addSubmodule, createHostileRepo, plainGit, plantChange, type HostileRepo } from "./hostileRepo.testutil.js";

const folders: string[] = [];
const temp = () => { const folder = mkdtempSync(join(tmpdir(), "sa-hold-")); folders.push(folder); return folder; };
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const filter = '[filter "evil"]\n\tclean = evil-clean\n';
const posixOnly = it.skipIf(process.platform === "win32");

function setup(limits?: { entries?: number; bytes?: number }) {
  const base = temp(), repo = createHostileRepo(base), hooksDir = join(base, "empty-hooks"), events: HoldEvent[] = [];
  mkdirSync(hooksDir);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: repo.globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const gitFor = (where: GitRepo, config: [string, string][] = []) => new HarnessGit({ repo: where, hooksDir, env: withConfig(env, config) });
  const main: GitRepo = { gitDir: repo.gitDir, workTree: repo.root, commonDir: repo.gitDir };
  const statePath = join(base, "log", "hold.json");
  const open = (wrap?: (repo: GitRepo, runner: GitRunner) => GitRunner) =>
    new HarnessHold({ repo: main, gitFor: (where, config) => (wrap ?? ((_, runner) => runner))(where, gitFor(where, config)), statePath, limits, log: (event) => events.push(event) });
  return { base, repo, events, hooksDir, main, statePath, open };
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

  it("keeps a filter that runs, set when the post office started, and holds nothing for a `git push -u` that succeeds", async () => {
    const { base, repo, hooksDir, main, open } = setup();
    const marker = join(base, "markers", "filter");
    appendFileSync(join(repo.gitDir, "config"), `[filter "evil"]\n\tclean = "echo ran >> '${marker.replace(/\\/g, "/")}'; cat"\n`);
    mkdirSync(join(repo.gitDir, "info"), { recursive: true });
    appendFileSync(join(repo.gitDir, "info", "attributes"), "*.txt filter=evil\n");
    const hold = open();
    expect(await hold.start()).toEqual({ held: false });
    writeFileSync(join(repo.root, "new.txt"), "x\n");
    plainGit(repo, repo.root, "add", "new.txt");
    expect(existsSync(marker)).toBe(true); // the filter is live
    const remote = join(temp(), "remote.git");
    plainGit(repo, repo.root, "init", "-q", "--bare", remote);
    plainGit(repo, repo.root, "remote", "add", "origin", remote);
    plainGit(repo, repo.root, "-c", `core.hooksPath=${hooksDir}`, "push", "-q", "-u", "origin", "HEAD");
    const branch = plainGit(repo, repo.root, "branch", "--show-current").trim();
    expect(plainGit(repo, repo.root, "config", `branch.${branch}.remote`).trim()).toBe("origin");
    expect(await hold.check()).toEqual({ held: false });
    expect((await hold.run(main, ["status", "--porcelain"], "guard")).code).toBe(0);
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
    const { repo, main, open } = setup(), hold = open();
    await hold.start();
    expect((await hold.run(main, ["status", "--porcelain"], "guard")).code).toBe(0);
    await expect(hold.run(main, ["config", "filter.evil.clean", "x"])).rejects.toThrow("harness git held · Shadow Army: harness git held · .git/config changed");
    await expect(hold.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
    plainGit(repo, repo.root, "config", "--unset", "filter.evil.clean");
    expect((await hold.run(main, ["status"])).code).toBe(0);
    expect(repo.ran()).toEqual([]);
  }, 60_000);

  it("names the files that differ", () => {
    expect(changedFiles({ "config .git/config": "a", "x": "1" }, { "config .git/config": "b", "y": "2" })).toEqual([".git/config", "x", "y"]);
  });
});

describe("the command's own repository (C2)", () => {
  it("runs git only in a repository the hold covers, and compares a registered worktree's metadata", async () => {
    const { base, repo, open } = setup(), hold = open();
    await hold.start();
    const tree = join(base, "snap");
    plainGit(repo, repo.root, "-c", "core.hooksPath=/nowhere", "worktree", "add", "-q", "--detach", tree);
    const gitDir = join(repo.gitDir, "worktrees", "snap"), snap: GitRepo = { gitDir, workTree: tree, commonDir: repo.gitDir };
    await expect(hold.run(snap, ["status"])).rejects.toThrow("isn't a repository this hold covers");
    await hold.register(snap);
    expect((await hold.run(snap, ["status", "--porcelain"], "guard")).code).toBe(0);
    appendFileSync(join(gitDir, "commondir"), "\n../../../elsewhere");
    expect(await hold.check()).toMatchObject({ held: true, files: [expect.stringMatching(/worktrees\/snap\/commondir$/)] });
    expect(await open().start()).toMatchObject({ held: true }); // the registered worktree is kept across a restart
    await hold.unregister(snap);
    expect(await hold.check()).toEqual({ held: false });
  }, 60_000);
});

describe("registration trusts only the new repository's own state (C13)", () => {
  const worktree = (base: string, repo: HostileRepo, name = "snap"): GitRepo => {
    const tree = join(base, name);
    plainGit(repo, repo.root, "-c", "core.hooksPath=/nowhere", "worktree", "add", "-q", "--detach", tree);
    return { gitDir: join(repo.gitDir, "worktrees", name), workTree: tree, commonDir: repo.gitDir };
  };

  for (const [change, file] of [["config", ".git/config"], ["hook", ".git/hooks/pre-rebase"]] as const) {
    it(`stays held when the shared ${change} changes before a worktree's registration finishes`, async () => {
      const { base, repo, open } = setup(), hold = open();
      await expect(open().register(worktree(base, repo, "early"))).rejects.toThrow("only once"); // before start, nothing is trusted
      await hold.start();
      const snap = worktree(base, repo), undo = plantChange(repo, change);
      await expect(hold.register(snap)).rejects.toBeInstanceOf(HarnessGitHeld);
      expect(await open().start()).toMatchObject({ held: true, files: [file] }); // a restart straight after keeps it
      expect(await hold.check()).toMatchObject({ held: true, files: [file] });
      undo();
      expect(await hold.check()).toEqual({ held: false });
    }, 60_000);
  }

  it("checks a known repository that registers again against its baseline, and holds on a change", async () => {
    const { base, repo, main, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo);
    await hold.register(snap);
    await hold.register(snap); // unchanged: nothing to hold
    expect(await hold.check()).toEqual({ held: false });
    appendFileSync(join(snap.gitDir, "commondir"), "\n../../../elsewhere");
    await expect(hold.register(snap)).rejects.toBeInstanceOf(HarnessGitHeld);
    expect(await hold.check()).toMatchObject({ held: true, files: [expect.stringMatching(/worktrees\/snap\/commondir$/)] });
    plantChange(repo, "config");
    await expect(hold.register(main)).rejects.toBeInstanceOf(HarnessGitHeld); // the folder's own checkout too
  }, 60_000);
});

describe("a new registration's pointers, overlap and record (C15, C16, C17)", () => {
  const worktree = (base: string, repo: HostileRepo, name = "snap"): GitRepo => {
    const tree = join(base, name);
    plainGit(repo, repo.root, "-c", "core.hooksPath=/nowhere", "worktree", "add", "-q", "--detach", tree);
    return { gitDir: join(repo.gitDir, "worktrees", name), workTree: tree, commonDir: repo.gitDir };
  };

  it("refuses a worktree whose `.git`, `commondir` or `gitdir` is missing or names another folder (C15)", async () => {
    const { base, repo, open } = setup(), hold = open();
    await hold.start();
    const cases: [string, (snap: GitRepo) => void, string][] = [
      ["no commondir", (snap) => rmSync(join(snap.gitDir, "commondir")), "is missing"],
      ["commondir elsewhere", (snap) => writeFileSync(join(snap.gitDir, "commondir"), `${temp()}\n`), "not the registered"],
      ["gitdir elsewhere", (snap) => writeFileSync(join(snap.gitDir, "gitdir"), `${join(temp(), ".git")}\n`), "not the registered"],
      [".git elsewhere", (snap) => { rmSync(join(snap.workTree, ".git")); writeFileSync(join(snap.workTree, ".git"), `gitdir: ${temp()}\n`); }, "not the registered"],
      ["no .git", (snap) => rmSync(join(snap.workTree, ".git")), "is missing"],
    ];
    for (const [name, change, message] of cases) {
      const snap = worktree(base, repo, name.replace(/\W/g, "-"));
      change(snap);
      await expect(hold.register(snap), name).rejects.toThrow(message);
      await expect(hold.run(snap, ["status"]), name).rejects.toThrow("isn't a repository this hold covers");
    }
    expect(await hold.check()).toEqual({ held: false });
  }, 60_000);

  it("checks the later of two overlapping registrations against the first one's baseline (C16)", async () => {
    const { base, repo, events, open } = setup();
    let changed = false;
    const hold = open((where, runner) => ({ run: async (args, kind) => {
      // The first scan's last step: the worktree's own info/ changes before the second scan reads it.
      if (args[0] === "ls-files" && where.gitDir.endsWith("snap") && !changed) { changed = true; mkdirSync(join(where.gitDir, "info"), { recursive: true }); writeFileSync(join(where.gitDir, "info", "exclude"), "x\n"); }
      return runner.run(args, kind);
    } }));
    await hold.start();
    const snap = worktree(base, repo), from = events.length;
    const [first, second] = await Promise.allSettled([hold.register(snap), hold.register(snap)]);
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({ status: "rejected", reason: expect.any(HarnessGitHeld) });
    expect(events.slice(from).map((event) => event.event)).toEqual(["trusted", "held"]);
    expect(await hold.check()).toMatchObject({ held: true, files: [expect.stringMatching(/worktrees\/snap\/info\/exclude$/)] });
    await hold.accept();
    const other = worktree(base, repo, "other");
    await Promise.all([hold.register(other), hold.unregister(other)]); // in the order called
    await expect(hold.run(other, ["status"])).rejects.toThrow("isn't a repository this hold covers");
  }, 60_000);

  it("records a hold found while registering with the baseline, so a log that throws can't leave it trusted (C17)", async () => {
    const { base, repo, events, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo);
    plantChange(repo, "config");
    const push = events.push;
    events.push = (...items: HoldEvent[]) => { if (items.some((event) => event.event === "trusted")) throw new Error("log failed"); return push.apply(events, items); };
    await expect(hold.register(snap)).rejects.toThrow("log failed");
    events.push = push;
    expect(events.at(-1)).toMatchObject({ event: "held", files: [".git/config"] }); // logged though the trusted line failed
    expect(await open().start()).toMatchObject({ held: true, files: [".git/config"] });
  }, 60_000);
});

describe("a repository's whole identity (C9)", () => {
  it("runs only in a registered repository's own working tree and common folder, with the paths it registered", async () => {
    const { base, repo, main, open } = setup(), given: GitRepo[] = [];
    const hold = open((where, runner) => ({ run: async (args, kind) => { if (args[0] === "status") given.push(where); return runner.run(args, kind); } }));
    await hold.start();
    const tree = join(base, "snap");
    plainGit(repo, repo.root, "-c", "core.hooksPath=/nowhere", "worktree", "add", "-q", "--detach", tree);
    const snap: GitRepo = { gitDir: join(repo.gitDir, "worktrees", "snap"), workTree: tree, commonDir: repo.gitDir };
    await hold.register(snap);
    await expect(hold.run({ ...snap, workTree: repo.root }, ["status"])).rejects.toThrow("isn't a repository this hold covers");
    await expect(hold.run({ ...main, commonDir: snap.gitDir }, ["status"])).rejects.toThrow("isn't a repository this hold covers");
    await expect(hold.register({ ...snap, workTree: repo.root })).rejects.toThrow("already registered");
    given.length = 0;
    await hold.run({ ...snap, workTree: join(tree, "..", "snap", ".") + "/" }, ["status", "--porcelain"]);
    expect(given).toEqual([snap]); expect(given[0]).toBe(snap); // the stored tuple, not the caller's spelling
  }, 60_000);
});

describe("commands that overlap (C10)", () => {
  it("keeps the interrupted-command marker until the last command's after-check", async () => {
    const { main, statePath, open } = setup();
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((done) => { release = done; }), waiting = new Promise<void>((done) => { started = done; });
    const hold = open((_, runner) => ({ run: async (args, kind) => {
      if (args[0] === "log") { started(); await gate; }
      return runner.run(args, kind);
    } }));
    await hold.start();
    const slow = hold.run(main, ["log", "-1", "--oneline"]);
    await waiting;
    await hold.run(main, ["status", "--porcelain"]);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toMatchObject({ running: true });
    release(); await slow;
    expect(JSON.parse(readFileSync(statePath, "utf8")).running).toBeUndefined();
  }, 60_000);
});

describe("the hold's own record (C3, C4)", () => {
  it("holds when the last record exists but can't be read, until the owner accepts", async () => {
    const { statePath, open } = setup();
    await open().start();
    writeFileSync(statePath, readFileSync(statePath, "utf8").slice(0, 20)); // a write cut short
    const hold = open();
    expect(await hold.start()).toMatchObject({ held: true, files: [expect.stringMatching(/hold\.json$/)] });
    expect(await hold.check()).toMatchObject({ held: true });
    await hold.accept();
    expect(await hold.check()).toEqual({ held: false });
    expect(readdirSync(dirname(statePath))).toEqual(["hold.json"]); // written whole, by rename
  }, 60_000);

  it("compares after a command that throws, and keeps its error", async () => {
    const { repo, main, open } = setup();
    const failing = open((_, runner) => ({ run: async (args, kind) => {
      const result = await runner.run(args, kind);
      if (args[0] !== "status") return result;
      plantChange(repo, "config"); throw new HarnessGitTimeout("other", 1);
    } }));
    await failing.start();
    await expect(failing.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitTimeout);
    expect(await failing.check()).toMatchObject({ held: true, files: [".git/config"] });
  }, 60_000);

  it("keeps the last trusted state for a post office that starts while a command was running", async () => {
    const { repo, main, open } = setup();
    let restart: Promise<unknown> | undefined;
    const crashing = open((_, runner) => ({ run: async (args, kind) => {
      if (args[0] === "status") { plantChange(repo, "hook"); restart = open().start(); await restart; } // the post office dies mid-command
      return runner.run(args, kind);
    } }));
    await crashing.start();
    await crashing.run(main, ["status"]).catch(() => {});
    expect(await restart).toMatchObject({ held: true, files: [".git/hooks/pre-rebase"] });
  }, 60_000);
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

  it("follows gitlinks at any depth, and holds when a submodule's index can't be listed (C1)", async () => {
    const { repo, open } = setup();
    const names = Array.from({ length: 10 }, (_, i) => `d${i + 1}`);
    let root = repo.root;
    for (const name of names) root = addSubmodule({ ...repo, root } as HostileRepo, name);
    const hold = open();
    await hold.start();
    appendFileSync(join(root, ".git", "config"), filter);
    const deepest = await hold.check();
    expect(deepest.held && deepest.files).toEqual([`${names.join("/")}/.git/config`]);
    writeFileSync(join(root, ".git", "config"), readFileSync(join(root, ".git", "config"), "utf8").replace(filter, ""));
    expect(await hold.check()).toEqual({ held: false });
    writeFileSync(join(repo.root, "d1", ".git", "index"), "not an index");
    expect(await hold.check()).toMatchObject({ held: true, files: ["d1/.git/index"], line: expect.stringContaining("can't be inspected") });
  }, 180_000);

  posixOnly("reads a gitlink whose path holds a newline (C1)", async () => {
    const { repo, open } = setup();
    const folder = addSubmodule(repo, "odd\nname");
    const hold = open();
    await hold.start();
    appendFileSync(join(folder, ".git", "config"), filter);
    expect(await hold.check()).toMatchObject({ held: true, files: ["odd\nname/.git/config"] });
  }, 60_000);

  it("lets a guard command see a change that a nested submodule's `.gitmodules` ignores (C5)", async () => {
    const { repo, main, open } = setup();
    const sub = addSubmodule(repo, "sub");
    addSubmodule({ ...repo, root: sub } as HostileRepo, "de=ep");
    for (const [key, value] of [["path", "de=ep"], ["ignore", "all"]]) plainGit(repo, sub, "config", "-f", ".gitmodules", `submodule.de=ep.${key}`, value!);
    plainGit(repo, sub, "add", ".gitmodules"); plainGit(repo, sub, "commit", "-q", "-m", "ignore");
    plainGit(repo, repo.root, "add", "sub"); plainGit(repo, repo.root, "-c", "core.hooksPath=/nowhere", "commit", "-q", "--no-gpg-sign", "-m", "sub");
    const hold = open();
    await hold.start();
    writeFileSync(join(sub, "de=ep", "file.txt"), "changed\n");
    expect((await hold.run(main, ["status", "--porcelain"], "guard")).stdout).toContain("sub");
  }, 120_000);
});

describe("the metadata scan (C6)", () => {
  it("holds, naming the folder, when hooks/ holds more entries than the scan allows", async () => {
    const { repo, open } = setup({ entries: 40 }), hold = open();
    expect(await hold.start()).toEqual({ held: false });
    for (let i = 0; i < 40; i++) writeFileSync(join(repo.gitDir, "hooks", `extra-${i}`), "x");
    expect(await hold.check()).toMatchObject({ held: true, files: [".git/hooks"], line: expect.stringContaining("can't be inspected") });
  }, 60_000);

  posixOnly("holds, without opening it, for a FIFO in info/", async () => {
    const { repo, open } = setup(), hold = open();
    await hold.start();
    mkdirSync(join(repo.gitDir, "info"), { recursive: true });
    execFileSync("mkfifo", [join(repo.gitDir, "info", "pipe")]);
    expect(await hold.check()).toMatchObject({ held: true, files: [".git/info/pipe"], line: expect.stringContaining("can't be inspected") });
  }, 60_000);
});
