import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { redact } from "../logs.js";
import { helperPath, parseStat } from "./linux.js";
import { parseTreeFile, treesDir, type Identity, type TreeLine } from "./trees.js";

const run = promisify(execFile);

/** A probe's answer: the start time, `"absent"` when no such process runs, `"unknown"` when it couldn't be told. */
export type Probe = number | "absent" | "unknown";

/**
 * How an end went: `"ended"` once the process was signalled through a handle bound to its identity (or had
 * already gone), `"declined"` when this machine can't bind the signal to the identity, so nothing was sent.
 */
export type EndResult = "ended" | "declined";

/** What the sweep needs from the machine: injected, so it runs on fake processes. */
export interface SweepOps {
  platform: NodeJS.Platform;
  /** The process's start time (creation time on Windows, in Unix milliseconds). */
  probe(pid: number): Promise<Probe>;
  commandOf?(pid: number): Promise<string | undefined>;
  /**
   * Ends the process only if it is still `target` (PO-11): the identity check and the signal are bound to one
   * handle, so a reused pid is never signalled. `tree` ends the harness git command's whole group.
   */
  endIdentity(target: Identity, tree: boolean): Promise<EndResult>;
  /** macOS (PO-17's operations): removes a launchd job, and ends the members of a coalition. */
  removeJob?(label: string): Promise<void>;
  endCoalition?(id: string): Promise<void>;
  wait(ms: number): Promise<void>;
  /** A monotonic clock in milliseconds. */
  now?(): number;
  /** PO-5's checks beyond `lstat`: `defaultTrust` when left out, none when `null` (a test's fake files). */
  trust?: TrustCheck | null;
}

export interface SweptProcess { pid: number; command?: string }
export interface SweepReport {
  /** Entries whose post office still runs: left alone. */
  running: number;
  /** Entries ended and removed. */
  swept: number;
  ended: SweptProcess[];
  /** Processes still running after the limit, or that this machine couldn't end by their identity. */
  left: SweptProcess[];
  /** Entries with a job or coalition this machine can't end. */
  unhandled: number;
  /** Entries kept for the next sweep, each with why. */
  kept: { id: string; reason: string }[];
}

/** PO-10's limit for a tree to be empty, on a monotonic clock, for every entry together. */
export const SWEEP_LIMIT_MS = 10_000;
/** No single process or tool operation may hold the sweep longer than this. */
export const OP_LIMIT_MS = 3_000;
const isProcess = (line: TreeLine): line is Extract<TreeLine, Identity> => "pid" in line && line.kind !== "post-office";

/** The operation's result, or `onLate` once `ms` have passed. */
function bounded<T>(promise: Promise<T>, ms: number, onLate: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((done) => { timer = setTimeout(() => done(onLate), Math.max(0, ms)); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const posix = process.platform !== "win32";

/**
 * PO-5's checks that `lstat` can't make: for each path, why it fails, or `undefined` when it passes. Windows's
 * (`windowsTrust`) reads its owner, any kind of reparse point, and, where `acl` is set, its ACL.
 */
export type TrustCheck = (paths: { path: string; acl: boolean }[]) => Promise<(string | undefined)[]>;

const powershellPath = () => join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
/** Write, append, attributes, delete, a child's delete, the ACL, the owner, generic write or all: rights to change it. */
const WRITE_RIGHTS = "0x500D0156";
/**
 * Windows's PO-5 check, run by PowerShell's absolute path: owned by this user (not Administrators), no reparse point
 * of any kind, and, where `acl` is set, no allow entry that applies to it giving write rights to anyone but this
 * user, SYSTEM or Administrators. A path that can't be read fails.
 */
export const windowsTrust: TrustCheck = async (paths) => {
  if (paths.length === 0) return [];
  const encoded = Buffer.from(JSON.stringify(paths), "utf8").toString("base64");
  const script = `$ErrorActionPreference='Stop'; $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed=@($me,'S-1-5-18','S-1-5-32-544')
foreach ($p in (ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))))) { try {
  if ([IO.File]::GetAttributes($p.path) -band [IO.FileAttributes]::ReparsePoint) { 'a reparse point'; continue }
  $acl=Get-Acl -LiteralPath $p.path; $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($owner -ne $me) { "owned by $owner"; continue }
  if ($p.acl) {
    $open=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' -and -not ($_.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and $allowed -notcontains $_.IdentityReference.Value -and ([int64]$_.FileSystemRights -band ${WRITE_RIGHTS}) } | ForEach-Object { $_.IdentityReference.Value })
    if ($open.Count -gt 0) { "writable by $($open -join ',')"; continue }
  }
  'ok' } catch { 'unreadable' } }`;
  const lines = (await run(powershellPath(), ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true })).stdout.trim().split(/\r?\n/);
  return paths.map((_, index) => lines[index]?.trim() === "ok" ? undefined : lines[index]?.trim() || "unreadable");
};
/** The machine's own check: Windows's, or none where `lstat` shows all PO-5 asks (Linux and macOS). */
export const defaultTrust: TrustCheck | undefined = posix ? undefined : windowsTrust;

/** A plain folder of the owner's own that no other user can write: not a link, junction or reparse point (PO-5). */
async function checkFolder(path: string): Promise<"missing" | "ok"> {
  let stat;
  try { stat = await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`the army's folder ${path} is a link or not a folder`);
  if (posix && (stat.uid !== process.getuid!() || (stat.mode & 0o022) !== 0)) throw new Error(`the army's folder ${path} is not the owner's alone`);
  return "ok";
}

/** A tree entry as read: its lines, or why it couldn't be trusted (then nothing is ended on it, and it is kept). */
export interface VerifiedTree { id: string; lines: TreeLine[]; untrusted?: string }

/**
 * The tree entries under `.shadow/v2/trees/`, read only through PO-5's checked folders: each folder on the way must
 * be a plain folder of the owner's, and each entry a regular file of the owner's with one link that no other user
 * can write, opened without following a link. `trust` adds the checks `lstat` can't make (Windows's owner, reparse
 * points and ACL). A failed folder check throws, so nothing is ended on entries there is no basis to trust; an
 * entry that fails comes back `untrusted`, with no lines.
 */
export async function readVerifiedTrees(root: string, trust: TrustCheck | null | undefined = defaultTrust): Promise<VerifiedTree[]> {
  const folders = [join(root, ".shadow"), join(root, ".shadow", "v2"), treesDir(root)];
  for (const folder of folders) {
    if (await checkFolder(folder) === "missing") return [];
  }
  // `.shadow/` keeps the checkout's ACL; PO-5 narrows the ACL from `.shadow/v2/` down.
  const failed = await trust?.(folders.map((path, index) => ({ path, acl: index > 0 }))) ?? [];
  failed.forEach((reason, index) => { if (reason) throw new Error(`the army's folder ${folders[index]} is not the owner's alone: ${reason}`); });
  const directory = treesDir(root);
  const trees: VerifiedTree[] = [];
  for (const name of (await readdir(directory)).filter((one) => one.endsWith(".jsonl"))) {
    const id = name.slice(0, -".jsonl".length);
    const path = join(directory, name);
    const untrusted = (reason: string) => { trees.push({ id, lines: [], untrusted: reason }); };
    const before = await lstat(path).catch(() => undefined);
    if (!before) continue; // Removed since the listing.
    if (before.isSymbolicLink() || !before.isFile()) { untrusted("a link or not a file"); continue; }
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => undefined);
    if (!handle) { untrusted("couldn't be opened"); continue; }
    try {
      const after = await handle.stat();
      if (after.ino !== before.ino || after.dev !== before.dev) { untrusted("swapped while it was opened"); continue; }
      if (after.nlink !== 1) { untrusted("has another link"); continue; }
      if (posix && (after.uid !== process.getuid!() || (after.mode & 0o022) !== 0)) { untrusted("not the owner's alone"); continue; }
      // Checked while the handle is held: Windows won't let the name be swapped for another file until it closes.
      const [reason] = await trust?.([{ path, acl: true }]) ?? [];
      if (reason) { untrusted(reason); continue; }
      trees.push({ id, lines: parseTreeFile(await handle.readFile("utf8")) });
    } finally { await handle.close(); }
  }
  return trees;
}

type Target = Extract<TreeLine, Identity>;
interface Entry {
  id: string;
  targets: Target[];
  named: Map<number, string | undefined>;
  remaining: Target[];
  declined: Set<number>;
  unknown: Set<number>;
  failed: string[];
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "es"}`;

/**
 * PO-16's sweep: ends every tree whose entry belongs to a post office that is no longer running, judged by the
 * entry's pid and start time. A process is ended only through `endIdentity`, bound to its recorded identity, never
 * for a session or process-group id alone. A probe that can't tell keeps the entry, as does any cleanup that fails.
 * Every entry gets its first attempt before any is polled, and the whole sweep keeps to PO-10's 10 s.
 */
export async function sweepTrees(root: string, ops: SweepOps): Promise<SweepReport> {
  const now = ops.now ?? (() => performance.now());
  const deadline = now() + SWEEP_LIMIT_MS;
  const budget = () => Math.min(OP_LIMIT_MS, deadline - now());
  const probe = (pid: number) => bounded(ops.probe(pid).catch((): Probe => "unknown"), budget(), "unknown" as Probe);
  const report: SweepReport = { running: 0, swept: 0, ended: [], left: [], unhandled: 0, kept: [] };
  const entries: Entry[] = [];

  await Promise.all((await readVerifiedTrees(root, ops.trust === undefined ? defaultTrust : ops.trust)).map(async ({ id, lines, untrusted }) => {
    if (untrusted) { report.kept.push({ id, reason: `the entry isn't the owner's alone (${untrusted}); nothing was ended on it` }); return; }
    const postOffice = lines.find((line) => line.kind === "post-office");
    if (!postOffice || !("pid" in postOffice)) { report.kept.push({ id, reason: "no post office line" }); return; }
    const owner = await probe(postOffice.pid);
    if (owner === postOffice.startTime) { report.running++; return; }
    if (owner === "unknown") { report.kept.push({ id, reason: "the post office's state couldn't be told" }); return; }
    const entry: Entry = { id, targets: [], named: new Map(), remaining: [], declined: new Set(), unknown: new Set(), failed: [] };
    for (const line of lines) {
      if (line.kind !== "job") continue;
      if (!ops.removeJob || !ops.endCoalition) { report.unhandled++; entry.failed.push(`job ${line.label} can't be ended here`); continue; }
      const steps = [[`job ${line.label}`, () => ops.removeJob!(line.label)], [`coalition ${line.coalition}`, () => ops.endCoalition!(line.coalition)]] as const;
      for (const [what, step] of steps) {
        if (!await bounded(step().then(() => true, () => false), budget(), false)) entry.failed.push(`${what} couldn't be ended`);
      }
    }
    // Windows: nothing in the job is left; only a harness git command's entry runs outside it.
    entry.targets = lines.filter(isProcess).filter((line) => ops.platform !== "win32" || line.kind === "git")
      .filter((line, index, all) => all.findIndex((other) => other.pid === line.pid && other.startTime === line.startTime) === index);
    entries.push(entry);
  }));

  /** The entry's targets that still run as recorded; one whose probe can't tell is noted as unknown. */
  const matching = async (entry: Entry): Promise<Target[]> => {
    const states = await Promise.all(entry.targets.map((target) => probe(target.pid)));
    entry.unknown = new Set(entry.targets.filter((_, index) => states[index] === "unknown").map((target) => target.pid));
    return entry.targets.filter((target, index) => states[index] === target.startTime);
  };
  const attempt = async (entry: Entry) => {
    await Promise.all(entry.remaining.filter((target) => !entry.declined.has(target.pid)).map(async (target) => {
      if (!entry.named.has(target.pid)) {
        entry.named.set(target.pid, await bounded(ops.commandOf?.(target.pid).catch(() => undefined) ?? Promise.resolve(undefined), budget(), undefined));
      }
      const result = await bounded(ops.endIdentity(target, target.kind === "git").catch((): EndResult | "failed" => "failed"), budget(), "failed" as const);
      if (result === "declined") entry.declined.add(target.pid);
    }));
  };
  const live = (entry: Entry) => entry.remaining.some((target) => !entry.declined.has(target.pid));

  await Promise.all(entries.map(async (entry) => { entry.remaining = await matching(entry); await attempt(entry); })); // Every first attempt before any polling.
  for (let active = entries; ;) {
    await Promise.all(active.map(async (entry) => { entry.remaining = await matching(entry); }));
    active = active.filter(live);
    if (active.length === 0 || now() >= deadline) break;
    await ops.wait(Math.min(100, Math.max(0, deadline - now())));
    if (now() >= deadline) break;
    await Promise.all(active.map(attempt));
  }

  for (const entry of entries) {
    const still = new Set(entry.remaining.map((target) => target.pid));
    const swept = (pid: number): SweptProcess => ({ pid, ...(entry.named.get(pid) === undefined ? {} : { command: redact(entry.named.get(pid)) as string }) });
    // A process whose last probe couldn't tell is unresolved: reported as left, never as ended.
    for (const pid of entry.named.keys()) (still.has(pid) || entry.unknown.has(pid) ? report.left : report.ended).push(swept(pid));
    for (const pid of entry.unknown) if (!entry.named.has(pid)) report.left.push(swept(pid));
    const declined = [...still].filter((pid) => entry.declined.has(pid)).length;
    if (declined > 0) entry.failed.push(`${plural(declined, "process")} couldn't be ended by identity on this machine; left running`);
    if (still.size > declined) entry.failed.push(`${plural(still.size - declined, "process")} still running after the sweep's ${SWEEP_LIMIT_MS / 1000} s`);
    if (entry.unknown.size > 0) entry.failed.push(`${plural(entry.unknown.size, "process")} whose state couldn't be told`);
    if (entry.failed.length > 0) { report.kept.push({ id: entry.id, reason: entry.failed.join("; ") }); continue; }
    try { await unlink(join(treesDir(root), `${entry.id}.jsonl`)); report.swept++; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") report.swept++;
      else report.kept.push({ id: entry.id, reason: `the entry couldn't be removed: ${(error as NodeJS.ErrnoException).code ?? "error"}` });
    }
  }
  return report;
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Linux's bound end: `sa-contain end <pid> <starttime>` checks the start time and signals through one pidfd. Its
 * exit 0 means it signalled the process (or found it gone or replaced); any other status, or no helper, means it
 * sent nothing, so the end is declined. A group (`tree`) is declined, nothing sent: Linux signals a group by its
 * number alone, which can't be bound to the leader's identity, so the git entry is kept and reported (PO-11).
 */
export async function endThroughHelper(target: Identity, tree: boolean, helper: string = helperPath()): Promise<EndResult> {
  if (tree) return "declined";
  try { await access(helper, constants.X_OK); } catch { return "declined"; }
  const args = ["end", String(target.pid), String(target.startTime)];
  return new Promise<EndResult>((done) => {
    const child = spawn(helper, args, { stdio: ["ignore", "ignore", "ignore", "pipe"] });
    child.once("error", () => done("declined"));
    child.once("close", (code) => done(code === 0 ? "ended" : "declined"));
  });
}

/**
 * The real machine's operations. Windows binds each end to the process's handle (PO-19's process operation is not
 * built yet; this runs PowerShell by its absolute path). Linux probes through `/proc` and ends through the helper's
 * pidfd (`endThroughHelper`); without the helper it declines, since a pid alone may since name another process (PO-11).
 * macOS needs PO-17's helper.
 */
export function systemOps(platform: NodeJS.Platform = process.platform, helper: string = helperPath()): SweepOps {
  if (platform === "linux") {
    return {
      platform, wait: pause,
      probe: async (pid) => {
        let text: string;
        try { text = await readFile(`/proc/${pid}/stat`, "latin1"); } catch (error) {
          return ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "") ? "absent" : "unknown";
        }
        // A zombie (Z) or dead (X) process has ended: only its parent has yet to collect it.
        if ("ZX".includes(text[text.lastIndexOf(")") + 2] ?? "?")) return "absent";
        return parseStat(pid, text)?.startTime ?? "unknown";
      },
      commandOf: async (pid) => (await readFile(`/proc/${pid}/cmdline`, "latin1")).replaceAll("\0", " ").trim(),
      endIdentity: (target, tree) => endThroughHelper(target, tree, helper),
    };
  }
  if (platform === "win32") {
    const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
    const powershell = powershellPath();
    const taskkill = join(system32, "taskkill.exe");
    const ps = async (script: string) => (await run(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true })).stdout.trim();
    const get = (pid: number) => `try { $p = Get-Process -Id ${pid} -ErrorAction Stop } catch [Microsoft.PowerShell.Commands.ProcessCommandException] { 'absent'; exit 0 }`;
    const started = "([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds()";
    return {
      platform, wait: pause,
      probe: async (pid) => {
        try {
          const out = await ps(`${get(pid)}; ${started}`);
          return out === "absent" ? "absent" : /^\d+$/.test(out) ? Number(out) : "unknown";
        } catch { return "unknown"; }
      },
      commandOf: async (pid) => (await ps(`(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`)) || undefined,
      // The handle is opened first and held: the pid can't be reused while it is open, and the start-time check and
      // the kill both go through it. `taskkill /t` ends git's tree while that handle still holds git's pid.
      endIdentity: async (target, tree) => {
        const kill = tree ? `& '${taskkill}' /t /f /pid ${target.pid} | Out-Null` : "$p.Kill()";
        const out = await ps(`${get(target.pid)}; $null = $p.Handle; if (${started} -ne ${target.startTime}) { 'absent'; exit 0 }; ${kill}; 'ended'`);
        if (out !== "ended" && out !== "absent") throw new Error(`unexpected output: ${out.slice(0, 80)}`);
        return "ended";
      },
    };
  }
  throw new Error(`The sweep has no operations for ${platform} yet: macOS needs PO-17's helper (M1b-18).`);
}
