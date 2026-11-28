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
/** The hold's own transitions, without the inspections' rows. */
const holds = (events: HoldEvent[]) => events.filter((event) => ["trusted", "held", "released"].includes(event.event)).map((event) => event.event);

function setup(limits?: { entries?: number; bytes?: number }) {
  const base = temp(), repo = createHostileRepo(base), hooksDir = join(base, "empty-hooks"), events: HoldEvent[] = [];
  mkdirSync(hooksDir);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: repo.globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const gitFor = (where: GitRepo, config: [string, string][] = []) => new HarnessGit({ repo: where, hooksDir, env: withConfig(env, config) });
  const main: GitRepo = { gitDir: repo.gitDir, workTree: repo.root, commonDir: repo.gitDir };
  const statePath = join(base, "log", "hold.json");
  /** `sink.fail`: the log throws EIO, as a full disk would (C36, C37). */
  const sink = { fail: false };
  const log = (event: HoldEvent) => { if (sink.fail) throw Object.assign(new Error("EIO: the log can't be written"), { code: "EIO" }); events.push(event); };
  const open = (wrap?: (repo: GitRepo, runner: GitRunner) => GitRunner) =>
    new HarnessHold({ repo: main, gitFor: (where, config) => (wrap ?? ((_, runner) => runner))(where, gitFor(where, config)), statePath, limits, log });
  return { base, repo, events, hooksDir, main, statePath, open, sink };
}

describe("harness git hold", () => {
  it("trusts the state at the start, and holds on a later change until it is undone", async () => {
    const { repo, events, open } = setup(), hold = open();
    expect(await hold.start()).toEqual({ held: false });
    expect(holds(events)[0]).toBe("trusted");
    expect(await hold.check()).toEqual({ held: false });
    for (const [change, file] of [["config", ".git/config"], ["hook", ".git/hooks/pre-rebase"], ["info", ".git/info/attributes"]] as const) {
      const undo = plantChange(repo, change);
      expect(await hold.check()).toEqual({ held: true, files: [file], line: `Shadow Army: harness git held · ${file} changed · undo it to go on` });
      undo();
      expect(await hold.check()).toEqual({ held: false });
    }
    expect(holds(events)).toEqual(["trusted", "held", "released", "held", "released", "held", "released"]);
    expect(events.find((event) => event.event === "held")).toMatchObject({ files: [".git/config"] });
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
    await hold.setTurnOpen(true);
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
    expect(holds(events.slice(from))).toEqual(["trusted", "held"]);
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
    await expect(hold.register(snap)).rejects.toBeInstanceOf(HarnessGitHeld); // the hold's error wins; the trusted row stays pending
    events.push = push;
    expect(events.filter((event) => event.event === "held").at(-1)).toMatchObject({ files: [".git/config"] }); // logged though the trusted line failed
    expect(await open().start()).toMatchObject({ held: true, files: [".git/config"] });
  }, 60_000);

  it("refuses a registration when a pointer that was absent appears before the scan reads it (C19)", async () => {
    const { base, repo, hooksDir, main, statePath } = setup();
    const env = { ...process.env, GIT_CONFIG_GLOBAL: repo.globalConfig, GIT_CONFIG_NOSYSTEM: "1" };
    let planted = false;
    const hold = new HarnessHold({ repo: main, statePath, gitFor: (where, config = []) => {
      // The scan's first step, after the pointer check: an optional `gitdir` naming another folder appears.
      if (where.gitDir.endsWith("snap") && !planted) { planted = true; writeFileSync(join(where.gitDir, "gitdir"), `${join(temp(), ".git")}\n`); }
      return new HarnessGit({ repo: where, hooksDir, env: withConfig(env, config) });
    } });
    await hold.start();
    const snap = worktree(base, repo);
    rmSync(join(snap.gitDir, "gitdir"));
    await expect(hold.register(snap)).rejects.toThrow(/worktrees\/snap\/gitdir changed while/);
    await expect(hold.run(snap, ["status"])).rejects.toThrow("isn't a repository this hold covers");
  }, 60_000);

  it("holds at a clean start when a logged worktree's pointer is missing or names another folder, and can't accept it (C20)", async () => {
    const { base, repo, open } = setup();
    const cases: [string, (snap: GitRepo) => void, RegExp][] = [
      ["no commondir", (snap) => rmSync(join(snap.gitDir, "commondir")), /worktrees\/snap-0\/commondir$/],
      ["no .git", (snap) => rmSync(join(snap.workTree, ".git")), /snap-1\/\.git$/],
      ["gitdir elsewhere", (snap) => writeFileSync(join(snap.gitDir, "gitdir"), `${join(temp(), ".git")}\n`), /worktrees\/snap-2\/gitdir$/],
    ];
    for (const [i, [name, change, file]] of cases.entries()) {
      const hold = open();
      await hold.start();
      const snap = worktree(base, repo, `snap-${i}`);
      await hold.register(snap);
      change(snap);
      const again = open(); // the record is clean: no hold, turn or command was open
      expect(await again.start(), name).toMatchObject({ held: true, files: expect.arrayContaining([expect.stringMatching(file)]) });
      await expect(again.accept(), name).rejects.toThrow("can't be accepted");
      await again.unregister(snap);
      expect(await again.check(), name).toEqual({ held: false });
    }
  }, 60_000);

  it("leaves a worktree to WSP-10's removal at a clean start only where the record says its removal began (C21)", async () => {
    const { base, repo, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo);
    await hold.register(snap);
    await hold.beginRemoval(snap); // recorded before the folder goes
    rmSync(snap.workTree, { recursive: true, force: true }); // the folder went; its `worktrees/<id>` entry is still there
    expect(await hold.check()).toEqual({ held: false });
    const again = open();
    expect(await again.start()).toEqual({ held: false });
    await expect(again.run(snap, ["status"])).rejects.toThrow("is being removed");
    await again.unregister(snap);
    expect(await again.check()).toEqual({ held: false });
  }, 60_000);

  it("holds, naming the folder, when a registered worktree goes with no removal recorded (C21)", async () => {
    const { base, repo, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo);
    await hold.register(snap);
    rmSync(snap.workTree, { recursive: true, force: true });
    expect(await hold.check()).toMatchObject({ held: true, files: [expect.stringMatching(/snap$/)] });
    const again = open();
    expect(await again.start()).toMatchObject({ held: true, files: [expect.stringMatching(/snap$/)] });
    await expect(again.run(snap, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
    await expect(again.accept()).rejects.toThrow("can't be accepted");
    await again.unregister(snap); // Shadow Army's own removal finishing is what releases it
    expect(await again.check()).toEqual({ held: false });
  }, 60_000);

  it("holds a gone worktree whose recorded removal ended or stopped, in-process and after a restart (C21)", async () => {
    const { base, repo, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo), other = worktree(base, repo, "other");
    await hold.register(snap);
    await hold.register(other);
    await hold.beginRemoval(snap);
    await hold.endRemoval(snap); // the removal failed: its folder is still there
    await hold.beginRemoval(other); // this one stopped with the post office
    const again = open();
    expect(await again.start()).toEqual({ held: false });
    rmSync(snap.workTree, { recursive: true, force: true });
    rmSync(other.workTree, { recursive: true, force: true });
    const held = await again.check();
    expect(held).toMatchObject({ held: true, files: expect.arrayContaining([expect.stringMatching(/snap$/), expect.stringMatching(/other$/)]) });
  }, 60_000);

  it("keeps the saved baseline when a clean start finds a bad pointer, so restoring it alone releases nothing (C22)", async () => {
    const { base, repo, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo), commondir = join(snap.gitDir, "commondir");
    await hold.register(snap);
    const text = readFileSync(commondir);
    rmSync(commondir);
    const undo = plantChange(repo, "config");
    const again = open(); // the record is clean: no hold, turn or command was open
    expect(await again.start()).toMatchObject({ held: true, files: expect.arrayContaining([".git/config", expect.stringMatching(/commondir$/)]) });
    writeFileSync(commondir, text); // the pointer alone is put back
    expect(await again.check()).toMatchObject({ held: true, files: [".git/config"] });
    expect(await open().start()).toMatchObject({ held: true, files: [".git/config"] }); // and after another restart
    undo();
    expect(await again.check()).toEqual({ held: false });
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
    const hold = open((_, runner) => ({ run: async (args, kind, begun) => {
      const result = await runner.run(args, kind, begun);
      if (args[0] === "log") { started(); await gate; } // git ran; its outcome is still to come
      return result;
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

  it("keeps a timeout's hold across a restart until g tries again (WSP-10)", async () => {
    const { main, open } = setup();
    const timing = open((_, runner) => ({ run: async (args, kind) => {
      if (args[0] === "log") throw new HarnessGitHeld("git log timed out twice");
      return runner.run(args, kind);
    } }));
    await timing.start();
    await expect(timing.run(main, ["log"])).rejects.toThrow("timed out twice");
    const again = open();
    await again.start();
    await expect(again.run(main, ["status"])).rejects.toThrow("timed out twice");
    await again.retry();
    expect((await again.run(main, ["status"])).code).toBe(0);
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

describe("persist first: a failed write changes nothing, so a retry writes again (C23, C24)", () => {
  /** The next record write fails: a folder sits where its temporary file goes. Returns the undo. */
  const blockWrite = (statePath: string) => { const at = `${statePath}.${process.pid}.tmp`; mkdirSync(at); return () => rmSync(at, { recursive: true }); };
  const record = (statePath: string) => JSON.parse(readFileSync(statePath, "utf8"));
  const worktree = (base: string, repo: HostileRepo, name: string): GitRepo => {
    plainGit(repo, repo.root, "-c", "core.hooksPath=/nowhere", "worktree", "add", "-q", "--detach", join(base, name));
    return { gitDir: join(repo.gitDir, "worktrees", name), workTree: join(base, name), commonDir: repo.gitDir };
  };

  it("retries a removal's end, and an unregistration, after their write fails, and a restart holds the gone folder (C23)", async () => {
    const { base, repo, statePath, open } = setup(), hold = open();
    await hold.start();
    const snap = worktree(base, repo, "snap"), other = worktree(base, repo, "other");
    await hold.register(snap); await hold.register(other);
    await hold.beginRemoval(snap);
    let unblock = blockWrite(statePath);
    await expect(hold.endRemoval(snap)).rejects.toThrow();
    await expect(hold.unregister(other)).rejects.toThrow();
    unblock();
    await hold.endRemoval(snap); await hold.unregister(other); // the retries write
    expect(record(statePath).removing).toBeUndefined();
    expect(record(statePath).repos).toHaveLength(2);
    rmSync(snap.workTree, { recursive: true, force: true });
    expect(await open().start()).toMatchObject({ held: true, files: [expect.stringMatching(/snap$/)] });
    unblock = blockWrite(statePath); // the same for the turn marker: a failed write leaves it closed
    await expect(hold.setTurnOpen(true)).rejects.toThrow();
    unblock(); await hold.retry();
    expect(record(statePath).turnOpen).toBeUndefined();
  }, 60_000);

  it("records a timeout as it's caught, so a restart during the after-check is held until g tries again (C24)", async () => {
    const { main, statePath, open } = setup();
    let release!: () => void, checking!: () => void, timedOut = false;
    const gate = new Promise<void>((done) => { release = done; }), pending = new Promise<void>((done) => { checking = done; });
    const hold = open((_, runner) => ({ run: async (args, kind) => {
      if (args[0] === "log") { timedOut = true; throw new HarnessGitHeld("git log timed out twice"); }
      if (timedOut) { checking(); await gate; } // the after-check's scan waits here
      return runner.run(args, kind);
    } }));
    await hold.start();
    const running = hold.run(main, ["log"]);
    await pending;
    expect(record(statePath)).toMatchObject({ running: true, timeout: "git log timed out twice" });
    const again = open(); // the post office stopped during the after-check
    await again.start();
    await expect(again.run(main, ["status"])).rejects.toThrow("timed out twice");
    release(); await expect(running).rejects.toThrow("timed out twice");
    const unblock = blockWrite(statePath);
    await expect(again.retry()).rejects.toThrow();
    unblock();
    await expect(again.run(main, ["status"])).rejects.toThrow("timed out twice"); // still held: retry() wrote nothing
  }, 60_000);

  it("holds a restart that finds a command's outcome unrecorded, though its timeout's write failed, until g tries again (C25)", async () => {
    const { main, statePath, open } = setup();
    let unblock = () => {};
    const hold = open((_, runner) => ({ run: async (args, kind) => {
      if (args[0] === "log") { unblock = blockWrite(statePath); throw new HarnessGitHeld("git log timed out twice"); }
      return runner.run(args, kind);
    } }));
    await hold.start();
    // The timeout's write fails, and so does the after-check's write-ahead, so it scans nothing (C27).
    await expect(hold.run(main, ["log"])).rejects.toThrow();
    expect(record(statePath)).toMatchObject({ running: true });
    expect(record(statePath).timeout).toBeUndefined(); // the timeout's write failed
    unblock();
    const again = open(); // the post office stopped during the after-check; the metadata is unchanged
    await again.start();
    await expect(again.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
    const third = open(); await third.start(); // the record the restart wrote still holds
    await expect(third.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
    await third.retry();
    expect((await third.run(main, ["status"])).code).toBe(0);
    await expect(hold.run(main, ["status"])).rejects.toThrow("timed out twice"); // held in memory
    await hold.check(); // and its next write records it
    expect(record(statePath).timeout).toBe("git log timed out twice");
  }, 60_000);

  it("keeps a hold the after-check found though its write and the finally's fail, so a later write records it (C26)", async () => {
    const { base, repo, main, statePath, open } = setup();
    let unblock = () => {}, ran = false;
    const hold = open((_, runner) => ({ run: async (args, kind) => {
      // The after-check's write-ahead succeeds; the block lands at its scan's first git, so the hold's write fails.
      if (ran && args[0] === "config") { ran = false; unblock = blockWrite(statePath); }
      const result = await runner.run(args, kind);
      if (args[0] === "status") { appendFileSync(join(repo.gitDir, "info", "exclude"), "\n*.secret\n"); ran = true; }
      return result;
    } }));
    await hold.start();
    const other = worktree(base, repo, "other");
    await hold.register(other);
    await hold.beginRemoval(other);
    await expect(hold.run(main, ["status"])).rejects.toThrow();
    expect(hold.held).toBe(true);
    unblock();
    await hold.endRemoval(other); // an unrelated write, once storage recovers
    expect(record(statePath)).toMatchObject({ held: { files: [".git/info/exclude"] } });
    expect(record(statePath).running).toBeUndefined();
    expect(await open().start()).toMatchObject({ held: true, files: [".git/info/exclude"] });
  }, 60_000);

  it("records an inspection before its scan, so a restart after its hold's write failed is held (C27)", async () => {
    const { repo, main, statePath, open } = setup();
    let unblock = () => {}, armed = false;
    const hold = open((_, runner) => ({ run: async (args, kind) => {
      if (armed && args[0] === "config") { armed = false; unblock = blockWrite(statePath); } // the scan's write, not the write-ahead
      return runner.run(args, kind);
    } }));
    await hold.start();
    appendFileSync(join(repo.gitDir, "info", "exclude"), "\n*.secret\n");
    // Codex's repro: the first write fails, so nothing is scanned and nothing is held that disk lacks.
    unblock = blockWrite(statePath);
    await expect(hold.run(main, ["status"])).rejects.toThrow();
    expect(hold.held).toBe(false);
    unblock();
    // The write-ahead succeeds and the hold's write fails: the record says an inspection was pending.
    armed = true;
    await expect(hold.run(main, ["status"])).rejects.toThrow();
    expect(hold.held).toBe(true);
    expect(record(statePath)).toMatchObject({ checking: true });
    unblock();
    const again = open();
    expect(await again.start()).toMatchObject({ held: true, files: [".git/info/exclude"] });
    await expect(again.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
  }, 60_000);

  it("queues a command called during another's before-check behind it, so the first one's timeout stops it (C28)", async () => {
    const { main, open } = setup();
    let release!: () => void, paused!: () => void, pause = false;
    const gate = new Promise<void>((done) => { release = done; }), waiting = new Promise<void>((done) => { paused = done; });
    const hold = open((_, runner) => ({ run: async (args, kind, started) => {
      if (args[0] === "log") throw new HarnessGitHeld("git log timed out twice");
      if (pause && args[0] === "config") { pause = false; paused(); await gate; } // A's before-scan waits here
      return runner.run(args, kind, started);
    } }));
    await hold.start();
    pause = true;
    const a = hold.run(main, ["log"]);
    await waiting;
    const b = hold.run(main, ["status"]); // queued: it can't check or gate until A's git has ended or started
    release();
    await expect(a).rejects.toThrow("timed out twice");
    await expect(b).rejects.toThrow("timed out twice");
  }, 60_000);

  it("logs a hold's event when a later write, retry()'s, first records it, before its release (C29)", async () => {
    const { repo, main, events, statePath, open } = setup();
    const exclude = join(repo.gitDir, "info", "exclude"), original = readFileSync(exclude, "utf8");
    let unblock = () => {}, ran = false;
    const hold = open((_, runner) => ({ run: async (args, kind) => {
      if (ran && args[0] === "config") { ran = false; unblock = blockWrite(statePath); } // the after-check's hold write fails
      const result = await runner.run(args, kind);
      if (args[0] === "status") { appendFileSync(exclude, "\n*.secret\n"); ran = true; }
      return result;
    } }));
    await hold.start();
    await expect(hold.run(main, ["status"])).rejects.toThrow(); // and the finally's write
    unblock();
    expect(holds(events)).toEqual(["trusted"]);
    await hold.retry(); // the first write that succeeds
    expect(record(statePath)).toMatchObject({ held: { files: [".git/info/exclude"] } });
    expect(record(statePath).unlogged).toBeUndefined();
    writeFileSync(exclude, original);
    expect(await hold.check()).toEqual({ held: false });
    expect(holds(events)).toEqual(["trusted", "held", "released"]);
    expect(events.find((event) => event.event === "held")).toMatchObject({ files: [".git/info/exclude"] });
  }, 60_000);

  it("queues a command behind an older one's before-check, so its hold isn't released by that scan (self-review)", async () => {
    const { repo, main, events, open } = setup();
    let release!: () => void, paused!: () => void, pause = false, ran = 0;
    const gate = new Promise<void>((done) => { release = done; }), waiting = new Promise<void>((done) => { paused = done; });
    const hold = open((_, runner) => ({ run: async (args, kind, started) => {
      if (pause && args[0] === "ls-files") { pause = false; paused(); await gate; } // B's scan has read info/ clean
      if (args[0] === "log") ran++;
      return runner.run(args, kind, started);
    } }));
    await hold.start();
    pause = true;
    const b = hold.run(main, ["log", "-1"]);
    await waiting;
    appendFileSync(join(repo.gitDir, "info", "exclude"), "\n*.secret\n");
    const a = hold.run(main, ["status"]); // queued behind B's before-check, so its scan sees the change
    release();
    await expect(a).rejects.toBeInstanceOf(HarnessGitHeld);
    await expect(b).rejects.toBeInstanceOf(HarnessGitHeld); // its after-check holds; nothing released the hold
    expect(ran).toBe(1); // B's git ran on its clean scan, before A's check: the change landed mid-scan
    expect(holds(events)).toEqual(["trusted", "held"]);
  }, 60_000);

  it("logs a restart's unlogged hold once, though the restart finds the same files (self-review)", async () => {
    const { repo, events, statePath, open } = setup(), hold = open();
    await hold.start();
    plantChange(repo, "hook");
    const held = await hold.check();
    writeFileSync(statePath, JSON.stringify({ ...record(statePath), unlogged: [{ files: held.held ? held.files : [], reason: "changed" }] }));
    const from = events.length;
    expect(await open().start()).toMatchObject({ held: true });
    expect(events.slice(from).filter((event) => event.event === "held")).toHaveLength(1);
  }, 60_000);

  it("says a restart held by a timeout or an unrecorded outcome is held, with the line to show (self-review)", async () => {
    const { main, statePath, open } = setup();
    const timing = open((_, runner) => ({ run: async (args, kind) => {
      if (args[0] === "log") throw new HarnessGitHeld("git log timed out twice");
      return runner.run(args, kind);
    } }));
    await timing.start();
    await expect(timing.run(main, ["log"])).rejects.toThrow("timed out twice");
    expect(await open().start()).toEqual({ held: true, files: [], line: "Shadow Army: harness git held · git log timed out twice · g tries again" });
    writeFileSync(statePath, JSON.stringify({ ...record(statePath), timeout: undefined, running: true }));
    expect(await open().start()).toMatchObject({ held: true, line: expect.stringContaining("may have timed out") });
  }, 60_000);

  it("logs a hold whose first write failed once a later write records it (self-review)", async () => {
    const { repo, events, statePath, open } = setup(), hold = open();
    await hold.start();
    plantChange(repo, "hook");
    const unblock = blockWrite(statePath);
    await expect(hold.check()).rejects.toThrow();
    unblock();
    expect(await hold.check()).toMatchObject({ held: true });
    expect(holds(events)).toEqual(["trusted", "held"]);
  }, 60_000);

  // Review 143 (C31-C40): one queue for every operation, write-ahead at start and registration, every transition audited.
  it("keeps the inspection marker when a check's scan rejects, through an unrelated write, so a restart holds (C31)", async () => {
    const { base, repo, main, statePath, open } = setup();
    let failing = false;
    const hold = open((_, runner) => ({ run: async (args, kind, started) => {
      if (failing && args[0] === "config") { failing = false; throw Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" }); }
      return runner.run(args, kind, started);
    } }));
    await hold.start();
    const snap = worktree(base, repo, "snap");
    await hold.register(snap);
    await hold.beginRemoval(snap);
    appendFileSync(join(repo.gitDir, "info", "exclude"), "\n*.secret\n");
    failing = true;
    await expect(hold.check()).rejects.toThrow("EAGAIN");
    expect(record(statePath)).toMatchObject({ checking: true });
    await hold.endRemoval(snap); // an unrelated write records no outcome, so the marker stays
    expect(record(statePath)).toMatchObject({ checking: true });
    const again = open();
    expect(await again.start()).toMatchObject({ held: true, files: [".git/info/exclude"] });
    await expect(again.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
  }, 60_000);

  it("keeps a hold registration found though its save fails, and the record says an inspection is pending (C32)", async () => {
    const { base, repo, main, statePath, open } = setup();
    let unblock = () => {}, armed = false;
    const snap = worktree(base, repo, "snap");
    const hold = open((where, runner) => ({ run: async (args, kind, started) => {
      const result = await runner.run(args, kind, started);
      if (armed && where.workTree === snap.workTree && args[0] === "ls-files") { armed = false; unblock = blockWrite(statePath); } // the scan's last git
      return result;
    } }));
    await hold.start();
    appendFileSync(join(repo.gitDir, "info", "exclude"), "\n*.secret\n");
    armed = true;
    await expect(hold.register(snap)).rejects.toThrow();
    expect(hold.held).toBe(true);
    unblock();
    expect(record(statePath)).toMatchObject({ checking: true });
    expect(record(statePath).repos).toHaveLength(1); // the registration itself rolled back
    await expect(hold.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
    const again = open();
    expect(await again.start()).toMatchObject({ held: true, files: [".git/info/exclude"] });
    await expect(again.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
  }, 60_000);

  it("saves a start's inspection before it reads, so a hold whose save failed is held after a restart (C33)", async () => {
    const { base, repo, main, statePath, open } = setup(), first = open();
    await first.start();
    const snap = worktree(base, repo, "snap");
    await first.register(snap);
    // While no post office runs: the worktree's commondir is bad, and the shared exclude file changed.
    const commondir = join(snap.gitDir, "commondir"), pointer = readFileSync(commondir, "utf8");
    writeFileSync(commondir, `${join(base, "elsewhere")}\n`);
    appendFileSync(join(repo.gitDir, "info", "exclude"), "\n*.secret\n");
    let unblock = () => {}, armed = true;
    const second = open((_, runner) => ({ run: async (args, kind, started) => {
      if (armed && args[0] === "config") { armed = false; unblock = blockWrite(statePath); } // after the write-ahead
      return runner.run(args, kind, started);
    } }));
    await expect(second.start()).rejects.toThrow();
    expect(second.held).toBe(true);
    unblock();
    expect(record(statePath)).toMatchObject({ checking: true });
    writeFileSync(commondir, pointer); // only the pointer repaired
    const third = open();
    expect(await third.start()).toMatchObject({ held: true, files: [".git/info/exclude"] });
    await expect(third.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
  }, 60_000);

  it("clears the inspection marker once its outcome is written, though the log threw while draining (C36)", async () => {
    const { repo, statePath, open, sink } = setup();
    let unblock = () => {}, armed = false;
    const hold = open((_, runner) => ({ run: async (args, kind, started) => {
      if (armed && args[0] === "config") { armed = false; unblock = blockWrite(statePath); } // the hold's write fails
      return runner.run(args, kind, started);
    } }));
    await hold.start();
    const undo = plantChange(repo, "hook");
    armed = true;
    await expect(hold.check()).rejects.toThrow(); // its held event is pending
    unblock();
    sink.fail = true;
    await expect(hold.check()).rejects.toThrow("EIO"); // the scan ran and its outcome was written, then the log threw
    expect(record(statePath)).toMatchObject({ held: { files: [".git/hooks/pre-rebase"] } });
    expect(record(statePath).checking).toBeUndefined();
    sink.fail = false;
    undo();
    expect(await hold.check()).toEqual({ held: false });
    expect(record(statePath).checking).toBeUndefined();
    expect(record(statePath).unlogged).toBeUndefined();
    plantChange(repo, "config"); // the owner's edit while stopped is trusted, not taken for an interrupted check
    expect(await open().start()).toEqual({ held: false });
  }, 60_000);

  it("logs a release found at the start, a release whose log threw, and a timeout's hold and its retry (C37)", async () => {
    const { main, repo, events, open, sink } = setup();
    let hold = open();
    await hold.start();
    let undo = plantChange(repo, "hook");
    expect(await hold.check()).toMatchObject({ held: true });
    undo(); // undone while no post office runs
    expect(await open().start()).toEqual({ held: false });
    expect(holds(events)).toEqual(["trusted", "held", "released"]);
    hold = open(); await hold.start();
    undo = plantChange(repo, "hook");
    await hold.check();
    undo();
    sink.fail = true;
    await expect(hold.check()).rejects.toThrow("EIO"); // released on disk; its row is pending
    sink.fail = false;
    expect(await hold.check()).toEqual({ held: false });
    expect(holds(events).slice(3)).toEqual(["trusted", "held", "released"]);
    const from = events.length;
    const timing = open((_, runner) => ({ run: async (args, kind, started) => {
      if (args[0] === "log") throw new HarnessGitHeld("git log timed out twice");
      return runner.run(args, kind, started);
    } }));
    await timing.start();
    await expect(timing.run(main, ["log"])).rejects.toThrow("timed out twice");
    await timing.retry();
    expect(holds(events.slice(from))).toEqual(["trusted", "held", "released"]);
    expect(events.slice(from).filter((event) => event.event !== "trusted" && event.reason)).toMatchObject([{ event: "held", reason: "git log timed out twice" }, { event: "released" }]);
  }, 60_000);

  it("holds a registration when a shared file the other tuple trusted was removed before it (C39)", async () => {
    const { base, repo, main, statePath, open } = setup(), hold = open();
    await hold.start();
    rmSync(join(repo.gitDir, "info", "exclude"));
    const snap = worktree(base, repo, "snap");
    await expect(hold.register(snap)).rejects.toBeInstanceOf(HarnessGitHeld);
    expect(record(statePath)).toMatchObject({ held: { files: [".git/info/exclude"] } });
    const again = open();
    expect(await again.start()).toMatchObject({ held: true, files: [".git/info/exclude"] });
    await expect(again.run(main, ["status"])).rejects.toBeInstanceOf(HarnessGitHeld);
  }, 60_000);

  it("runs an unregistration called during a command's before-check after its git started, and refuses a gone worktree (C40)", async () => {
    const { base, repo, statePath, open } = setup();
    const snap = worktree(base, repo, "snap");
    let unregistered: Promise<void> | undefined, during = false, registered: boolean | undefined;
    const hold: HarnessHold = open((_, runner) => ({ run: async (args, kind, started) => {
      if (during && args[0] === "ls-files") { during = false; unregistered = hold.unregister(snap); await new Promise((done) => setTimeout(done, 50)); }
      if (args[0] === "log") registered = record(statePath).repos.some((other: GitRepo) => other.workTree === snap.workTree);
      return runner.run(args, kind, started);
    } }));
    await hold.start();
    await hold.register(snap);
    during = true;
    expect((await hold.run(snap, ["log", "-1"])).code).toBe(0);
    expect(registered).toBe(true); // git ran in a tuple still registered
    await unregistered;
    expect(record(statePath).repos).toHaveLength(1);
    // Codex's second repro: during the before-check, the removal is marked, the folder deleted and the tuple
    // unregistered. Both calls queue behind the launch, whose gate, run again, finds the folder gone: git never runs.
    const other = worktree(base, repo, "other");
    let removal: Promise<void>[] = [], removing = false, ran = false;
    const second: HarnessHold = open((where, runner) => ({ run: async (args, kind, started) => {
      if (args[0] === "log") ran = true;
      const result = await runner.run(args, kind, started);
      if (removing && where.workTree === other.workTree && args[0] === "ls-files") {
        removing = false;
        removal = [Promise.resolve(second.beginRemoval(other))];
        rmSync(other.workTree, { recursive: true, force: true });
        removal.push(second.unregister(other));
        await new Promise((done) => setTimeout(done, 50));
      }
      return result;
    } }));
    await second.start();
    await second.register(other);
    removing = true;
    await expect(second.run(other, ["log", "-1"])).rejects.toThrow(/is (being removed|gone)/);
    expect(ran).toBe(false);
    await Promise.all(removal);
    expect(record(statePath).repos).toHaveLength(1);
  }, 60_000);
});
