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
  /**
   * The process's start time (creation time on Windows, in Unix milliseconds). Each operation that runs a tool stops
   * it when `signal` aborts, and settles only once it has stopped.
   */
  probe(pid: number, signal?: AbortSignal): Promise<Probe>;
  commandOf?(pid: number, signal?: AbortSignal): Promise<string | undefined>;
  /**
   * Ends the process only if it is still `target` (PO-11): the identity check and the signal are bound to one
   * handle, so a reused pid is never signalled. `tree` ends the harness git command's whole group.
   */
  endIdentity(target: Identity, tree: boolean, signal?: AbortSignal): Promise<EndResult>;
  /** macOS (PO-17's operations): removes a launchd job, and ends the members of a coalition. */
  removeJob?(label: string): Promise<void>;
  endCoalition?(id: string): Promise<void>;
  wait(ms: number): Promise<void>;
  /** A monotonic clock in milliseconds. */
  now?(): number;
  /** The machine's own record checks when left out; a test's checks on fake files, or none when `null`. */
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

/** How long a late operation gets to stop once it is aborted; kept out of every budget, so the sweep stays in 10 s. */
export const STOP_GRACE_MS = 500;
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * The operation's result. `"skipped"` when the budget was spent before it started (nothing is started then);
 * `"late"` when it ran past `ms`: it is aborted and given `STOP_GRACE_MS` to stop, and its effect stays unknown.
 */
async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number): Promise<{ value: T } | "late" | "skipped"> {
  if (ms <= 0) return "skipped";
  const control = new AbortController();
  const running = operation(control.signal).then((value) => ({ value }));
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"late">((done) => { timer = setTimeout(() => done("late"), ms); });
  const first = await Promise.race([running, late]).finally(() => clearTimeout(timer));
  if (first !== "late") return first;
  control.abort();
  await Promise.race([running.catch(() => {}), pause(STOP_GRACE_MS)]);
  return "late";
}

const posix = process.platform !== "win32";

/**
 * Extra PO-5 checks by path, for a test's fake files only: the machine's own checks are `lstat`'s (Linux and
 * macOS) and `windowsTrees`'s, which checks each object through the handle it reads from.
 */
export type TrustCheck = (paths: { path: string; acl: boolean }[]) => Promise<(string | undefined)[]>;

const systemRoot = (env: NodeJS.ProcessEnv = process.env) => env.SystemRoot ?? "C:\\Windows";
const powershellPath = () => join(systemRoot(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
/**
 * Windows PowerShell's environment with only its own modules (review 30 C10): a PowerShell 7 parent's `PSModulePath`
 * leads Windows PowerShell to modules it can't load, and every check then fails as unreadable.
 */
export function powershellEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(Object.entries(env).filter(([key]) => key.toUpperCase() !== "PSMODULEPATH"));
  return { ...kept, PSModulePath: join(systemRoot(env), "System32", "WindowsPowerShell", "v1.0", "Modules") };
}
const powershell = async (script: string, signal?: AbortSignal) =>
  (await run(powershellPath(), ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, env: powershellEnv(), signal, maxBuffer: 64 << 20 })).stdout;

/**
 * Opens each object without delete sharing and without following a reparse point, so while it is held its name can't
 * be moved, deleted or swapped; checks it on that handle (no reparse point, one link, owned by this user, and, where
 * `acl` is set, no allow entry that applies to it giving write rights to anyone but this user, SYSTEM or
 * Administrators); and reads a record's bytes from the same handle. Folder handles stay held until the end.
 */
const TREE_READER = String.raw`using System; using System.Collections.Generic; using System.IO; using System.Runtime.InteropServices;
using System.Security.AccessControl; using System.Security.Principal; using Microsoft.Win32.SafeHandles;
public static class SaTreeRead {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
  struct Info { public uint Attributes, C1, C2, A1, A2, W1, W2, Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow; }
  class Rule : AccessRule {
    public Rule(IdentityReference id, int mask, bool inherited, InheritanceFlags i, PropagationFlags p, AccessControlType t) : base(id, mask, inherited, i, p, t) {}
    public int Mask { get { return AccessMask; } }
  }
  class Sec : NativeObjectSecurity {
    public Sec(SafeHandle h, bool folder) : base(folder, ResourceType.FileObject, h, AccessControlSections.Owner | AccessControlSections.Access) {}
    public override Type AccessRightType { get { return typeof(int); } }
    public override Type AccessRuleType { get { return typeof(Rule); } }
    public override Type AuditRuleType { get { return typeof(AuditRule); } }
    public override AccessRule AccessRuleFactory(IdentityReference id, int mask, bool inherited, InheritanceFlags i, PropagationFlags p, AccessControlType t) { return new Rule(id, mask, inherited, i, p, t); }
    public override AuditRule AuditRuleFactory(IdentityReference id, int mask, bool inherited, InheritanceFlags i, PropagationFlags p, AuditFlags f) { throw new NotSupportedException(); }
  }
  static readonly string Me = WindowsIdentity.GetCurrent().User.Value;
  // Read and write sharing only; no reparse point followed (a folder also needs backup semantics).
  static SafeFileHandle Open(string path, bool folder) {
    return CreateFileW(path, folder ? 0x20081u : 0x80000000u, 3u, IntPtr.Zero, 3u, folder ? 0x02200000u : 0x00200000u, IntPtr.Zero);
  }
  // Write, append, attributes, delete, a child's delete, the ACL, the owner, generic write or all: rights to change it.
  const int WriteRights = 0x500D0156;
  static string Check(SafeFileHandle h, bool folder, bool acl) {
    Info info;
    if (!GetFileInformationByHandle(h, out info)) return "unreadable";
    if ((info.Attributes & 0x400) != 0) return "a reparse point";
    if (((info.Attributes & 0x10) != 0) != folder) return folder ? "not a folder" : "a link or not a file";
    if (!folder && info.Links != 1) return "has another link";
    var sec = new Sec(h, folder);
    string owner = sec.GetOwner(typeof(SecurityIdentifier)).Value;
    if (owner != Me) return "owned by " + owner;
    if (!acl) return null;
    var open = new List<string>();
    foreach (Rule rule in sec.GetAccessRules(true, true, typeof(SecurityIdentifier))) {
      string sid = rule.IdentityReference.Value;
      if (rule.AccessControlType == AccessControlType.Allow && (rule.PropagationFlags & PropagationFlags.InheritOnly) == 0
        && sid != Me && sid != "S-1-5-18" && sid != "S-1-5-32-544" && (rule.Mask & WriteRights) != 0) open.Add(sid);
    }
    return open.Count > 0 ? "writable by " + string.Join(",", open) : null;
  }
  // "missing", "folder <index> <reason>", or per record "<name>\tok\t<base64>", "<name>\tgone" or "<name>\tno\t<reason>".
  public static List<string> Read(string[] folders, int holdMs) {
    var lines = new List<string>(); var held = new List<SafeFileHandle>();
    try {
      for (int i = 0; i < folders.Length; i++) {
        var h = Open(folders[i], true);
        if (h.IsInvalid) { int code = Marshal.GetLastWin32Error(); lines.Add(code == 2 || code == 3 ? "missing" : "folder " + i + " couldn't be opened (" + code + ")"); return lines; }
        held.Add(h);
        string why = Check(h, true, i > 0); // .shadow keeps the checkout's ACL; PO-5 narrows it from .shadow/v2 down.
        if (why != null) { lines.Add("folder " + i + " " + why); return lines; }
      }
      foreach (string path in Directory.GetFiles(folders[folders.Length - 1], "*.jsonl")) {
        string name = Path.GetFileName(path);
        try {
          using (var h = Open(path, false)) {
            if (h.IsInvalid) { int code = Marshal.GetLastWin32Error(); lines.Add(code == 2 ? name + "\tgone" : name + "\tno\tcouldn't be opened (" + code + ")"); continue; }
            string why = Check(h, false, true);
            if (why != null) { lines.Add(name + "\tno\t" + why); continue; }
            if (holdMs > 0) System.Threading.Thread.Sleep(holdMs);
            using (var stream = new FileStream(h, FileAccess.Read)) { var bytes = new MemoryStream(); stream.CopyTo(bytes); lines.Add(name + "\tok\t" + Convert.ToBase64String(bytes.ToArray())); }
          }
        } catch (Exception e) { lines.Add(name + "\tno\tunreadable (" + e.GetType().Name + ")"); }
      }
    } finally { foreach (var h in held) h.Dispose(); }
    return lines;
  }
}`;

/**
 * Windows's PO-5 read (review 30 C1): checks and reads every record through one handle each, in one Windows
 * PowerShell run (`TREE_READER`). A failed folder throws; a record that fails comes back `untrusted`; only a record
 * Windows reports not found counts as gone. `signal` stops the run; `holdMs` pauses between a record's check and its
 * read (a test's seam).
 */
export async function windowsTrees(root: string, signal?: AbortSignal, holdMs = 0): Promise<VerifiedTree[]> {
  const folders = [join(root, ".shadow"), join(root, ".shadow", "v2"), treesDir(root)];
  const decoded = (text: string) => `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(text, "utf8").toString("base64")}'))`;
  const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition (${decoded(TREE_READER)}); [SaTreeRead]::Read([string[]](ConvertFrom-Json (${decoded(JSON.stringify(folders))})), ${Math.max(0, Math.floor(holdMs))})`;
  const lines = (await powershell(script, signal)).split(/\r?\n/).filter(Boolean);
  if (lines[0] === "missing") return [];
  const trees: VerifiedTree[] = [];
  for (const line of lines) {
    const folder = /^folder (\d) (.+)$/.exec(line);
    if (folder) throw new Error(`the army's folder ${folders[Number(folder[1])]} is not the owner's alone: ${folder[2]}`);
    const [name = "", state, detail] = line.split("\t");
    if (!name.endsWith(".jsonl")) throw new Error(`unexpected output from the record check: ${line.slice(0, 80)}`);
    const id = name.slice(0, -".jsonl".length);
    if (state === "gone") continue;
    trees.push(state === "ok" ? { id, lines: parseTreeFile(Buffer.from(detail ?? "", "base64").toString("utf8")) } : { id, lines: [], untrusted: detail || "unreadable" });
  }
  return trees;
}

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
 * can write, opened without following a link. On Windows, with no `trust` given, `windowsTrees` reads them; a test's
 * `trust` adds checks to its fake files. A failed folder check throws, so nothing is ended on entries there is no
 * basis to trust; an entry that fails, or isn't reached before `signal`, comes back `untrusted`, with no lines. Only
 * an entry confirmed gone (`ENOENT`) is left out (review 30 C11).
 */
export async function readVerifiedTrees(root: string, trust?: TrustCheck | null, signal?: AbortSignal): Promise<VerifiedTree[]> {
  if (!posix && trust === undefined) return windowsTrees(root, signal);
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
    const failure = (error: unknown) => `couldn't be read (${(error as NodeJS.ErrnoException).code ?? "error"})`;
    if (signal?.aborted) { untrusted("not checked within the sweep's limit"); continue; }
    let before;
    try { before = await lstat(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") untrusted(failure(error)); // ENOENT: removed since the listing.
      continue;
    }
    if (before.isSymbolicLink() || !before.isFile()) { untrusted("a link or not a file"); continue; }
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => undefined);
    if (!handle) { untrusted("couldn't be opened"); continue; }
    try {
      const after = await handle.stat();
      if (after.ino !== before.ino || after.dev !== before.dev) { untrusted("swapped while it was opened"); continue; }
      if (after.nlink !== 1) { untrusted("has another link"); continue; }
      if (posix && (after.uid !== process.getuid!() || (after.mode & 0o022) !== 0)) { untrusted("not the owner's alone"); continue; }
      const [reason] = await trust?.([{ path, acl: true }]) ?? [];
      if (reason) { untrusted(reason); continue; }
      trees.push({ id, lines: parseTreeFile(await handle.readFile("utf8")) });
    } catch (error) { untrusted(failure(error)); } finally { await handle.close().catch(() => {}); }
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
  /** Processes whose end ran past its limit: whether it signalled them is unknown, so they stay unresolved. */
  unresolved: Set<number>;
  failed: string[];
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "es"}`;

/**
 * PO-16's sweep: ends every tree whose entry belongs to a post office that is no longer running, judged by the
 * entry's pid and start time. A process is ended only through `endIdentity`, bound to its recorded identity, never
 * for a session or process-group id alone. A probe that can't tell keeps the entry, as does any cleanup that fails.
 * Every entry gets its first attempt before any is polled, and the whole sweep, reading the entries included, keeps
 * to PO-10's 10 s: no operation starts once the budget is spent, and one that runs late is stopped (review 30 C5).
 */
export async function sweepTrees(root: string, ops: SweepOps): Promise<SweepReport> {
  const now = ops.now ?? (() => performance.now());
  const deadline = now() + SWEEP_LIMIT_MS - STOP_GRACE_MS;
  const budget = () => Math.min(OP_LIMIT_MS, deadline - now());
  const probe = async (pid: number): Promise<Probe> => {
    const result = await bounded((signal) => ops.probe(pid, signal).catch((): Probe => "unknown"), budget());
    return typeof result === "string" ? "unknown" : result.value;
  };
  const report: SweepReport = { running: 0, swept: 0, ended: [], left: [], unhandled: 0, kept: [] };
  const entries: Entry[] = [];

  const reading = await bounded((signal) => readVerifiedTrees(root, ops.trust, signal), deadline - now());
  if (typeof reading === "string") throw new Error(`the army's tree entries couldn't be checked within the sweep's ${SWEEP_LIMIT_MS / 1000} s; nothing was ended`);
  await Promise.all(reading.value.map(async ({ id, lines, untrusted }) => { try {
    if (untrusted) { report.kept.push({ id, reason: `the entry isn't the owner's alone (${untrusted}); nothing was ended on it` }); return; }
    const postOffice = lines.find((line) => line.kind === "post-office");
    if (!postOffice || !("pid" in postOffice)) { report.kept.push({ id, reason: "no post office line" }); return; }
    const owner = await probe(postOffice.pid);
    if (owner === postOffice.startTime) { report.running++; return; }
    if (owner === "unknown") { report.kept.push({ id, reason: "the post office's state couldn't be told" }); return; }
    const entry: Entry = { id, targets: [], named: new Map(), remaining: [], declined: new Set(), unknown: new Set(), unresolved: new Set(), failed: [] };
    for (const line of lines) {
      if (line.kind !== "job") continue;
      if (!ops.removeJob || !ops.endCoalition) { report.unhandled++; entry.failed.push(`job ${line.label} can't be ended here`); continue; }
      const steps = [[`job ${line.label}`, () => ops.removeJob!(line.label)], [`coalition ${line.coalition}`, () => ops.endCoalition!(line.coalition)]] as const;
      for (const [what, step] of steps) {
        const done = await bounded(() => step().then(() => true, () => false), budget());
        if (typeof done === "string" || !done.value) entry.failed.push(`${what} couldn't be ended`);
      }
    }
    // Windows: nothing in the job is left; only a harness git command's entry runs outside it.
    entry.targets = lines.filter(isProcess).filter((line) => ops.platform !== "win32" || line.kind === "git")
      .filter((line, index, all) => all.findIndex((other) => other.pid === line.pid && other.startTime === line.startTime) === index);
    entries.push(entry);
  } catch (error) { report.kept.push({ id, reason: `the entry couldn't be handled: ${(error as Error).message}` }); } })); // One bad entry never stops the others.

  /** The entry's targets that still run as recorded; one whose probe can't tell is noted as unknown. */
  const matching = async (entry: Entry): Promise<Target[]> => {
    const states = await Promise.all(entry.targets.map((target) => probe(target.pid)));
    entry.unknown = new Set(entry.targets.filter((_, index) => states[index] === "unknown").map((target) => target.pid));
    return entry.targets.filter((target, index) => states[index] === target.startTime);
  };
  const open = (entry: Entry, target: Target) => !entry.declined.has(target.pid) && !entry.unresolved.has(target.pid);
  const attempt = async (entry: Entry) => {
    await Promise.all(entry.remaining.filter((target) => open(entry, target)).map(async (target) => {
      if (!entry.named.has(target.pid)) {
        const command = await bounded((signal) => ops.commandOf?.(target.pid, signal).catch(() => undefined) ?? Promise.resolve(undefined), budget());
        entry.named.set(target.pid, typeof command === "string" ? undefined : command.value);
      }
      const result = await bounded((signal) => ops.endIdentity(target, target.kind === "git", signal).catch((): EndResult | "failed" => "failed"), budget());
      if (result === "late") entry.unresolved.add(target.pid);
      else if (result !== "skipped" && result.value === "declined") entry.declined.add(target.pid);
    }));
  };
  const live = (entry: Entry) => entry.remaining.some((target) => open(entry, target));

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
    // A process whose last probe couldn't tell, or whose end ran late, is unresolved: reported as left, never as ended.
    const unsure = new Set([...entry.unknown, ...entry.unresolved]);
    for (const pid of entry.named.keys()) (still.has(pid) || unsure.has(pid) ? report.left : report.ended).push(swept(pid));
    for (const pid of unsure) if (!entry.named.has(pid)) report.left.push(swept(pid));
    const declined = [...still].filter((pid) => entry.declined.has(pid)).length;
    const running = [...still].filter((pid) => !entry.declined.has(pid) && !entry.unresolved.has(pid)).length;
    if (declined > 0) entry.failed.push(`${plural(declined, "process")} couldn't be ended by identity on this machine; left running`);
    if (running > 0) entry.failed.push(`${plural(running, "process")} still running after the sweep's ${SWEEP_LIMIT_MS / 1000} s`);
    if (entry.unresolved.size > 0) entry.failed.push(`${plural(entry.unresolved.size, "process")} whose end didn't finish within its limit`);
    if (entry.unknown.size > 0) entry.failed.push(`${plural(entry.unknown.size, "process")} whose state couldn't be told`);
    if (entry.failed.length > 0) { report.kept.push({ id: entry.id, reason: entry.failed.join("; ") }); continue; }
    try { await unlink(join(treesDir(root), `${entry.id}.jsonl`)); report.swept++; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") report.swept++;
      else report.kept.push({ id: entry.id, reason: `the entry couldn't be removed: ${(error as NodeJS.ErrnoException).code ?? "error"}` });
    }
  }
  return report;
}

/**
 * Linux's bound end: `sa-contain end <pid> <starttime>` checks the start time and signals through one pidfd. Its
 * exit 0 means it signalled the process (or found it gone or replaced); any other status, or no helper, means it
 * sent nothing, so the end is declined. A group (`tree`) is declined, nothing sent: Linux signals a group by its
 * number alone, which can't be bound to the leader's identity, so the git entry is kept and reported (PO-11).
 * `signal` kills the helper; the promise settles only once it has exited.
 */
export async function endThroughHelper(target: Identity, tree: boolean, helper: string = helperPath(), signal?: AbortSignal): Promise<EndResult> {
  if (tree) return "declined";
  try { await access(helper, constants.X_OK); } catch { return "declined"; }
  const args = ["end", String(target.pid), String(target.startTime)];
  return new Promise<EndResult>((done) => {
    const child = spawn(helper, args, { stdio: ["ignore", "ignore", "ignore", "pipe"] });
    const stop = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", stop, { once: true });
    child.once("error", () => { if (child.pid === undefined) done("declined"); }); // Never started.
    child.once("close", (code) => { signal?.removeEventListener("abort", stop); done(code === 0 && !signal?.aborted ? "ended" : "declined"); });
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
      commandOf: async (pid, signal) => (await readFile(`/proc/${pid}/cmdline`, { encoding: "latin1", signal })).replaceAll("\0", " ").trim(),
      endIdentity: (target, tree, signal) => endThroughHelper(target, tree, helper, signal),
    };
  }
  if (platform === "win32") {
    const taskkill = join(systemRoot(), "System32", "taskkill.exe");
    // `signal` kills PowerShell; `execFile` settles only once it has exited.
    const ps = async (script: string, signal?: AbortSignal) => (await powershell(script, signal)).trim();
    const get = (pid: number) => `try { $p = Get-Process -Id ${pid} -ErrorAction Stop } catch [Microsoft.PowerShell.Commands.ProcessCommandException] { 'absent'; exit 0 }`;
    const started = "([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds()";
    return {
      platform, wait: pause,
      probe: async (pid, signal) => {
        try {
          const out = await ps(`${get(pid)}; ${started}`, signal);
          return out === "absent" ? "absent" : /^\d+$/.test(out) ? Number(out) : "unknown";
        } catch { return "unknown"; }
      },
      commandOf: async (pid, signal) => (await ps(`(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`, signal)) || undefined,
      // The handle is opened first and held: the pid can't be reused while it is open, and the start-time check and
      // the kill both go through it. `taskkill /t` ends git's tree while that handle still holds git's pid.
      endIdentity: async (target, tree, signal) => {
        const kill = tree ? `& '${taskkill}' /t /f /pid ${target.pid} | Out-Null` : "$p.Kill()";
        const out = await ps(`${get(target.pid)}; $null = $p.Handle; if (${started} -ne ${target.startTime}) { 'absent'; exit 0 }; ${kill}; 'ended'`, signal);
        if (out !== "ended" && out !== "absent") throw new Error(`unexpected output: ${out.slice(0, 80)}`);
        return "ended";
      },
    };
  }
  throw new Error(`The sweep has no operations for ${platform} yet: macOS needs PO-17's helper (M1b-18).`);
}
