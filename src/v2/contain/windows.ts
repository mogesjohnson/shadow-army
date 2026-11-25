import { execFile, spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { delimiter, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Writable, type Readable } from "node:stream";
import { windowsIdentity, type Identity } from "./trees.js";

export interface ProcessExit { code: number | null; signal: NodeJS.Signals | null }
export interface ManagedProcess {
  readonly pid: number;
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  /** Root CLI exit, even while descendants remain in the session's containment. */
  readonly exited: Promise<ProcessExit>;
  /**
   * Session teardown, not turn teardown: persistent CLI services belong to the session.
   * By default (PO-7) it forwards stdin EOF and gives the CLI the exit grace, timed from when EOF
   * actually reached it. `grace: false` (a lost connection, a failed start, a root that already
   * exited) ends the whole tree at once, as loss of the owner does (PO-10).
   */
  close(options?: { grace?: boolean }): Promise<void>;
  /** PO-9: the process that holds the containment, once it has started. */
  readonly guardian?: Identity;
  /**
   * PO-11: every live process in the containment, each with an identity a reused pid can't match.
   * Windows returns a TreeListing; the Linux driver's /proc walk still returns a plain array.
   */
  list?(): Promise<TreeListing | Identity[]>;
}

/**
 * PO-11's listing, typed so that missing evidence never reads as an empty tree. "listed" is a
 * successful query (empty only when the job really is). "ended" only once the guardian has
 * confirmed teardown. "incomplete" is any other outcome: a query that failed or timed out, a
 * process whose identity could not be read, a malformed reply, or a lost control pipe. It carries
 * the identities of the last complete listing.
 */
export type TreeListing =
  | { status: "listed"; processes: Identity[] }
  | { status: "ended" }
  | { status: "incomplete"; reason: string; lastVerified: Identity[] };

/** Reads one supervisor "list" reply. Exported for its tests. */
export function listingFrom(event: { processes?: unknown; unverified?: unknown; message?: string }, lastVerified: Identity[]): TreeListing {
  const incomplete = (reason: string): TreeListing => ({ status: "incomplete", reason, lastVerified });
  if (!Array.isArray(event.processes)) return incomplete(`Windows process listing failed: ${event.message ?? "no processes"}`);
  const processes = event.processes.map(identityFrom);
  if (!processes.every((one): one is Identity => one !== undefined)) return incomplete("Windows process listing returned a malformed entry");
  if (Array.isArray(event.unverified) && event.unverified.length > 0) return incomplete(`Windows process listing could not read the identity of pid ${event.unverified.join(", ")}`);
  return { status: "listed", processes };
}

/** How long a listing may take before it is reported incomplete. */
const LIST_TIMEOUT_MS = 10_000;

/** The supervisor names a process by its pid and exact creation time, a FILETIME sent as a string (PO-11). */
const identityFrom = (value: unknown): Identity | undefined => {
  const { pid, creationTime } = (value ?? {}) as { pid?: unknown; creationTime?: unknown };
  return windowsIdentity(pid, creationTime);
};
export interface ManagedProcessOptions {
  file: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** How long the CLI gets to exit after stdin EOF before its tree is ended. Defaults to PO-10's 10 s; tests inject less. */
  exitGraceMs?: number;
  /** Tests only: the supervisor holds each listing this long, to prove close and owner loss are not delayed by one. */
  listDelayMs?: number;
}

/** PO-10: once the CLI has exited, or 10 seconds after it was asked to, every process still in the tree is killed. */
export const DEFAULT_EXIT_GRACE_MS = 10_000;

export function exitGraceFor(options: Pick<ManagedProcessOptions, "exitGraceMs">): number {
  const value = options.exitGraceMs ?? DEFAULT_EXIT_GRACE_MS;
  if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFF) throw new RangeError(`exitGraceMs must be a whole number of milliseconds, got ${String(value)}`);
  return value;
}


/** Windows containment driver: a kill-on-close Job Object, reached through the PO-12 table in index.ts. */
export async function spawnManagedProcess(options: ManagedProcessOptions): Promise<ManagedProcess> {
  return spawnWindows(options);
}

async function resolveWindowsCommand(file: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const extensions = extname(file) ? [""] : ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")];
  const directories = isAbsolute(file) || /[\\/]/.test(file) ? [""] : [cwd, ...pathValue.split(delimiter)];
  for (const directory of directories) for (const extension of extensions) {
    const candidate = directory ? join(directory, `${file}${extension}`) : resolve(cwd, `${file}${extension}`);
    try { await access(candidate); return candidate; } catch { /* Try the next executable suffix. */ }
  }
  throw Object.assign(new Error(`could not find executable ${file}`), { code: "ENOENT" });
}

/** Windows argv quoting for native executables, including embedded quotes and trailing backslashes. */
function windowsArgument(value: string): string {
  return `"${value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

function windowsCommand(file: string, args: string[], env: NodeJS.ProcessEnv): { file: string; commandLine: string } {
  if (!/\.(cmd|bat)$/i.test(file)) return { file, commandLine: [file, ...args].map(windowsArgument).join(" ") };
  if ([file, ...args].some((value) => /[\r\n\0]/.test(value))) throw new Error("batch arguments cannot contain line breaks or NUL");
  // npm's .cmd shims invoke a second command interpreter. Escape for both passes, as cross-spawn does.
  const escape = (value: string, double: boolean) => {
    let quoted = windowsArgument(value).replace(/([()%!^"<>&|])/g, "^$1");
    if (double) quoted = quoted.replace(/([()%!^"<>&|])/g, "^$1");
    return quoted;
  };
  const command = [escape(file, false), ...args.map((value) => escape(value, true))].join(" ");
  const comspec = env.ComSpec ?? env.COMSPEC ?? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe");
  return { file: comspec, commandLine: `${windowsArgument(comspec)} /d /s /v:off /c "${command}"` };
}

async function spawnWindows(options: ManagedProcessOptions): Promise<ManagedProcess> {
  const env = options.env ?? process.env;
  const command = windowsCommand(await resolveWindowsCommand(options.file, options.cwd, env), options.args ?? [], env);
  const exitGraceMs = exitGraceFor(options);
  const pipeName = `shadow-army-${randomUUID()}`;
  const token = randomUUID();
  const supervisor = (await supervisorBinary()).path;
  let control: Socket | undefined;
  let treeClosed = false;
  let rootPid: number | undefined;
  let guardian: Identity | undefined;
  let ended = false;
  let listSequence = 0;
  const listings = new Map<string, (listing: TreeListing) => void>();
  let lastVerified: Identity[] = [];
  let settleExit!: (exit: ProcessExit) => void;
  const exited = new Promise<ProcessExit>((done) => { settleExit = done; });
  let started!: () => void;
  let failed!: (error: Error) => void;
  const ready = new Promise<void>((done, fail) => { started = done; failed = fail; });
  const server = createServer((socket) => {
    let buffer = "";
    let authenticated = false;
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.on("data", (data: string) => {
      buffer += data;
      // A listing of a large tree is one long line; only an unauthenticated peer is held to 16 KiB.
      if (buffer.length > (authenticated ? 4_194_304 : 16_384)) { socket.destroy(); return; }
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let event: { token?: string; kind?: string; pid?: number; code?: number; message?: string; id?: string; guardian?: unknown; processes?: unknown; unverified?: unknown };
        try { event = JSON.parse(line); } catch { socket.destroy(); return; }
        if (!authenticated) {
          if (control || event.token !== token) { socket.destroy(); return; }
          authenticated = true; control = socket;
        }
        if (event.kind === "started" && typeof event.pid === "number") {
          rootPid = event.pid;
          guardian = identityFrom(event.guardian);
          started();
        } else if (event.kind === "list" && typeof event.id === "string") {
          const waiting = listings.get(event.id);
          listings.delete(event.id);
          if (!waiting) continue;
          const listing = listingFrom(event, lastVerified);
          if (listing.status === "listed") lastVerified = listing.processes;
          waiting(listing);
        }
        else if (event.kind === "exited") settleExit({ code: event.code ?? null, signal: null });
        else if (event.kind === "closed") treeClosed = true;
        else if (event.kind === "error") failed(new Error(event.message ?? "Windows process containment failed"));
      }
    });
  });
  const endedOrIncomplete = (): TreeListing => treeClosed ? { status: "ended" }
    : { status: "incomplete", reason: "Windows supervisor stopped without confirming the tree ended", lastVerified };
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(`\\\\.\\pipe\\${pipeName}`, done); });
    child = spawn(supervisor, [], {
      cwd: options.cwd, env, windowsHide: true, stdio: "pipe",
    });
    const wrapper = child;
    let diagnostic = "";
    const captureDiagnostic = (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-4_096); };
    wrapper.stderr.on("data", captureDiagnostic);
    wrapper.stdin.on("error", () => {});
    wrapper.once("error", failed);
    const wrapperClosed = new Promise<void>((done) => wrapper.once("close", () => {
      // Only a guardian that confirmed teardown ("closed") proves the tree ended; any other exit
      // leaves the listing incomplete, with the last verified identities.
      ended = true;
      for (const waiting of listings.values()) waiting(endedOrIncomplete());
      listings.clear();
      settleExit({ code: wrapper.exitCode, signal: wrapper.signalCode });
      failed(new Error(`Windows supervisor exited before launch${diagnostic ? `: ${diagnostic}` : ""}`));
      done();
    }));
    wrapper.stdin.write(`${JSON.stringify({ ...command, cwd: options.cwd, pipeName, token, exitGraceMs, ...(options.listDelayMs ? { listDelayMs: options.listDelayMs } : {}) })}\n`);
    const launchTimer = setTimeout(() => failed(new Error(`Windows supervisor did not launch within 15 seconds${diagnostic ? `: ${diagnostic}` : ""}`)), 15_000);
    try { await ready; } finally { clearTimeout(launchTimer); }
    wrapper.stderr.off("data", captureDiagnostic);
    let closing: Promise<void> | undefined;
    return {
      pid: rootPid!, stdin: wrapper.stdin, stdout: wrapper.stdout, stderr: wrapper.stderr, exited, guardian,
      list() {
        if (ended || treeClosed) return Promise.resolve(endedOrIncomplete());
        if (!control || control.destroyed) return Promise.resolve({ status: "incomplete", reason: "Windows supervisor control pipe is closed", lastVerified });
        const id = String(++listSequence);
        const socket = control;
        return new Promise<TreeListing>((done) => {
          const timer = setTimeout(() => {
            listings.delete(id);
            done({ status: "incomplete", reason: `Windows process listing took over ${LIST_TIMEOUT_MS} ms`, lastVerified });
          }, LIST_TIMEOUT_MS);
          timer.unref();
          listings.set(id, (listing) => { clearTimeout(timer); done(listing); });
          socket.write(`list ${id}\n`);
        });
      },
      close({ grace = true }: { grace?: boolean } = {}) {
        if (closing && !grace) control?.write("kill\n"); // Escalates a graceful close in progress.
        return closing ??= (async () => {
          // The supervisor may wait up to a grace for EOF to reach a CLI that is not reading,
          // then the grace itself, then its tree-empty wait; this timer is only the last resort.
          const killed = setTimeout(() => wrapper.kill(), (grace ? 2 * exitGraceMs : 0) + 15_000);
          if (!grace) control?.write("kill\n");
          wrapper.stdin.end();
          if (grace) control?.write("close\n");
          try { await wrapperClosed; } finally {
            clearTimeout(killed); control?.destroy(); server.close();
          }
          if (!treeClosed) throw new Error("Windows supervisor ended without confirming session process-tree cleanup");
        })();
      },
    };
  } catch (error) {
    control?.destroy(); server.close();
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise<void>((done) => { child!.once("close", done); setTimeout(done, exitGraceMs).unref(); });
    }
    throw error;
  }
}

// Embedded in the compiled module: published dist/ needs no source-tree script or native package.
// Compiled once per source version into the owner's cache (supervisorBinary). Bootstrap is read
// from stdin and never passed to the CLI; session credentials cannot enter argv.
const SUPERVISOR_SOURCE = String.raw`
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;
public static class ShadowJobSupervisor {
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; public int bInheritHandle; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved, desktop, title; public int x,y,xSize,ySize,xChars,yChars,fill,flags; public short show,reserved2; public IntPtr reservedPtr,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long processTime,jobTime; public uint flags; public UIntPtr min,max; public uint activeLimit; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref EXTENDED_LIMIT info,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out ACCOUNTING info,uint length,IntPtr result);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SECURITY_ATTRIBUTES security,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr GetStdHandle(int which);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string file,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFOEX startup,out PROCESS_INFORMATION process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,IntPtr info,uint length,IntPtr result);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
  [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();
  public static int Main() { return Run(); }
  static void Check(bool value) { if(!value) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  // JobGate keeps the job handle open while a listing reads it; WriteGate keeps report lines whole.
  // They are separate so that teardown's reports never wait on a listing's enumeration.
  static readonly object JobGate=new object(),WriteGate=new object(); static StreamWriter Events;
  static void Emit(string line) { lock(WriteGate) { Events.WriteLine(line); } }
  // PO-11: the exact creation time (FILETIME) from GetProcessTimes on a PROCESS_QUERY_LIMITED_INFORMATION
  // handle. It is sent as a string: milliseconds can't tell a reused pid from the original, and a JSON
  // number past 2^53 loses ticks. 0 when the process is known not to
  // be a live member: it is gone (ERROR_INVALID_PARAMETER), it has ended (its exit time or exit code is
  // set) or, given a job, it is not in it (its pid was reused). -1 when a query failed, so that
  // missing evidence is never read as an absent member.
  static long StartTimeOf(uint pid,IntPtr job) {
    IntPtr handle=OpenProcess(0x1000,false,pid); if(handle==IntPtr.Zero) return Marshal.GetLastWin32Error()==87 ? 0 : -1;
    try {
      bool inside; if(job!=IntPtr.Zero) { if(!IsProcessInJob(handle,job,out inside)) return -1; if(!inside) return 0; }
      // Termination is asynchronous: the exit code is set before the exit time, so either one means ended.
      uint code; if(!GetExitCodeProcess(handle,out code)) return -1; if(code!=259) return 0;
      long creation,exit,kernel,user; if(!GetProcessTimes(handle,out creation,out exit,out kernel,out user)) return -1; if(exit!=0) return 0;
      return creation>0 ? creation : -1;
    } finally { CloseHandle(handle); }
  }
  // Every live process in the job (JobObjectBasicProcessIdList), each with its identity; a pid
  // whose identity could not be read goes to unverified instead of being dropped.
  static List<object> JobProcesses(IntPtr job,List<uint> unverified) {
    var found=new List<object>(); if(job==IntPtr.Zero) throw new Exception("the session job is closed");
    for(int capacity=64;;capacity*=4) {
      int bytes=8+capacity*IntPtr.Size; IntPtr buffer=Marshal.AllocHGlobal(bytes);
      try {
        if(!QueryInformationJobObject(job,3,buffer,(uint)bytes,IntPtr.Zero)) { int error=Marshal.GetLastWin32Error(); if(error==234 && capacity<65536) continue; throw new Win32Exception(error); }
        int assigned=Marshal.ReadInt32(buffer,0),listed=Marshal.ReadInt32(buffer,4);
        if(assigned>listed && capacity<65536) continue;
        if(assigned>listed) throw new Exception("the job holds more processes than one listing can read");
        for(int i=0;i<listed;i++) { uint pid=(uint)Marshal.ReadIntPtr(buffer,8+i*IntPtr.Size).ToInt64(); long start=StartTimeOf(pid,job); if(start>0) found.Add(new { pid=pid,creationTime=start.ToString(System.Globalization.CultureInfo.InvariantCulture) }); else if(start<0) unverified.Add(pid); }
        return found;
      } finally { Marshal.FreeHGlobal(buffer); }
    }
  }
  public static int Run() {
    IntPtr job=IntPtr.Zero,read=IntPtr.Zero,write=IntPtr.Zero,attributes=IntPtr.Zero,jobPointer=IntPtr.Zero;
    PROCESS_INFORMATION process=new PROCESS_INFORMATION();
    NamedPipeClientStream pipe=null; StreamWriter events=null;
    var serializer=new JavaScriptSerializer();
    try {
      Stream input=Console.OpenStandardInput(); var header=new MemoryStream(); int next;
      while((next=input.ReadByte())!=-1 && next!=10) { if(header.Length>=1048576) throw new Exception("bootstrap too large"); header.WriteByte((byte)next); }
      var config=serializer.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(header.ToArray()));
      pipe=new NamedPipeClientStream(".",(string)config["pipeName"],PipeDirection.InOut,PipeOptions.Asynchronous); pipe.Connect(10000);
      events=new StreamWriter(pipe,new UTF8Encoding(false),1024,true); events.AutoFlush=true; Events=events;
      var stop=new ManualResetEvent(false); var eofForwarded=new ManualResetEvent(false); int shutdownReason=0;
      int listDelay=config.ContainsKey("listDelayMs") ? Convert.ToInt32(config["listDelayMs"]) : 0;
      int listing=0;
      var control=new Thread(delegate() {
        try { var reader=new StreamReader(pipe,Encoding.UTF8,false,1024,true); string line; while((line=reader.ReadLine())!=null) {
          // "list <id>" asks for the job's processes (PO-11); "kill" (a lost connection) ends the
          // tree at once; any other line ("close") asks for a graceful exit.
          if(line.StartsWith("list ")) {
            string id=line.Substring(5);
            // One listing at a time, on its own thread: this thread keeps reading close, kill and owner loss.
            if(Interlocked.CompareExchange(ref listing,1,0)!=0) { Emit(new JavaScriptSerializer().Serialize(new { kind="list",id=id,message="another listing is still running" })); continue; }
            var lister=new Thread(delegate() {
              var replies=new JavaScriptSerializer(); string reply;
              try {
                if(listDelay>0) Thread.Sleep(listDelay);
                var unverified=new List<uint>(); List<object> found;
                lock(JobGate) { found=JobProcesses(job,unverified); }
                reply=replies.Serialize(new { kind="list",id=id,processes=found,unverified=unverified });
              } catch(Exception error) { reply=replies.Serialize(new { kind="list",id=id,message=error.Message }); }
              Interlocked.Exchange(ref listing,0);
              try { Emit(reply); } catch {}
            }); lister.IsBackground=true; lister.Start();
            continue;
          }
          if(line=="kill") Interlocked.Exchange(ref shutdownReason,2); else Interlocked.CompareExchange(ref shutdownReason,1,0);
          stop.Set(); } } catch {}
        // Control EOF means the owner disappeared; it must contain the job immediately.
        Interlocked.Exchange(ref shutdownReason,2); stop.Set();
      }); control.IsBackground=true; control.Start();
      job=CreateJobObject(IntPtr.Zero,null); Check(job!=IntPtr.Zero);
      var limits=new EXTENDED_LIMIT(); limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE, never BREAKAWAY_OK.
      Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT))));
      var security=new SECURITY_ATTRIBUTES(); security.nLength=Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); security.bInheritHandle=1;
      Check(CreatePipe(out read,out write,ref security,0)); Check(SetHandleInformation(write,1,0));
      var startup=new STARTUPINFOEX(); startup.startup.cb=Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.startup.flags=0x100; startup.startup.input=read; startup.startup.output=GetStdHandle(-11); startup.startup.error=GetStdHandle(-12);
      IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size); attributes=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(attributes,1,0,ref size));
      jobPointer=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobPointer,job);
      Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x2000D),jobPointer,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero)); startup.attributes=attributes;
      // JOB_LIST assigns containment atomically during creation. No unassigned suspended-process window.
      Check(CreateProcess((string)config["file"],new StringBuilder((string)config["commandLine"]),IntPtr.Zero,IntPtr.Zero,true,0x08080004,IntPtr.Zero,(string)config["cwd"],ref startup,out process));
      Check(ResumeThread(process.thread)!=0xFFFFFFFF); CloseHandle(process.thread); process.thread=IntPtr.Zero; CloseHandle(read); read=IntPtr.Zero;
      // The guardian is this process: it holds the job's only handle (PO-9).
      uint guardian=GetCurrentProcessId();
      Emit(serializer.Serialize(new { token=config["token"],kind="started",pid=process.pid,guardian=new { pid=guardian,creationTime=StartTimeOf(guardian,IntPtr.Zero).ToString(System.Globalization.CultureInfo.InvariantCulture) } }));
      IntPtr inputWrite=write; write=IntPtr.Zero;
      var pump=new Thread(delegate() {
        bool ended=false;
        try { using(var output=new FileStream(new SafeFileHandle(inputWrite,true),FileAccess.Write,4096,false)) { var buffer=new byte[4096]; int count; while((count=input.Read(buffer,0,buffer.Length))>0) { output.Write(buffer,0,count); output.Flush(); } ended=true; } } catch {}
        // The CLI's stdin handle is closed here either way: from now on it has been asked to exit.
        eofForwarded.Set();
        if(ended) { Interlocked.CompareExchange(ref shutdownReason,1,0); stop.Set(); }
      }); pump.IsBackground=true; pump.Start();
      bool rootExited=false;
      while(!stop.WaitOne(20)) {
        if(!rootExited && WaitForSingleObject(process.process,0)==0) { uint code; Check(GetExitCodeProcess(process.process,out code)); rootExited=true; Emit(serializer.Serialize(new { kind="exited",code=code })); }
      }
      // Native stdin EOF runs the CLI's own shutdown hooks. Ordinary close gives that exit
      // up to the grace (PO-10: ten seconds unless the owner injected less), timed from when the
      // pump has actually closed the CLI's stdin: the control command can outrun the input pipe.
      // A CLI that never drains its stdin is asked at the latest one grace after the close.
      // "kill" and loss of the owner's control pipe always bypass the grace.
      if(!rootExited && Interlocked.CompareExchange(ref shutdownReason,0,0)!=2) {
        uint grace=config.ContainsKey("exitGraceMs") ? Convert.ToUInt32(config["exitGraceMs"]) : 10000;
        uint began=(uint)Environment.TickCount;
        while(!eofForwarded.WaitOne(0) && WaitForSingleObject(process.process,20)!=0 && (uint)((uint)Environment.TickCount-began)<grace && Interlocked.CompareExchange(ref shutdownReason,0,0)!=2) {}
        began=(uint)Environment.TickCount;
        while(WaitForSingleObject(process.process,20)!=0 && (uint)((uint)Environment.TickCount-began)<grace && Interlocked.CompareExchange(ref shutdownReason,0,0)!=2) {}
      }
      if(!rootExited && WaitForSingleObject(process.process,0)==0) { uint code; Check(GetExitCodeProcess(process.process,out code)); rootExited=true; Emit(serializer.Serialize(new { kind="exited",code=code })); }
      Check(TerminateJobObject(job,1));
      bool empty=false; for(int attempt=0;attempt<500;attempt++) { ACCOUNTING accounting; Check(QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero)); if(accounting.active==0) { empty=true; break; } Thread.Sleep(20); }
      if(!empty) throw new Exception("session job did not empty within 10 seconds");
      if(!rootExited) { uint code; Check(GetExitCodeProcess(process.process,out code)); Emit(serializer.Serialize(new { kind="exited",code=code })); }
      Emit(serializer.Serialize(new { kind="closed" }));
      return 0;
    } catch(Exception error) {
      if(events!=null) { try { Emit(serializer.Serialize(new { kind="error",message=error.Message })); } catch {} }
      Console.Error.WriteLine("Windows process containment: "+error.Message); return 1;
    } finally {
      // Under the gate, so a listing never queries a closed (or reused) handle.
      lock(JobGate) { if(job!=IntPtr.Zero) CloseHandle(job); job=IntPtr.Zero; }
      if(process.thread!=IntPtr.Zero) CloseHandle(process.thread); if(process.process!=IntPtr.Zero) CloseHandle(process.process);
      if(read!=IntPtr.Zero) CloseHandle(read); if(write!=IntPtr.Zero) CloseHandle(write);
      if(attributes!=IntPtr.Zero) { DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); } if(jobPointer!=IntPtr.Zero) Marshal.FreeHGlobal(jobPointer);
      if(events!=null) events.Dispose(); if(pipe!=null) pipe.Dispose();
    }
  }
}
`;

const SOURCE_HASH = createHash("sha256").update(SUPERVISOR_SOURCE).digest("hex");
/** Names this source version's files in the cache: `<key>.json` (the record) and `<key>-<sha256>.exe`. */
const SUPERVISOR_KEY = SOURCE_HASH.slice(0, 32);
const COMPILE_SCRIPT = "$ErrorActionPreference = 'Stop'\nAdd-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition ([IO.File]::ReadAllText($args[0])) -OutputAssembly $args[1] -OutputType ConsoleApplication\n";
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** The supervisor cache: `shadow-army\supervisor` under this user's local application data, as Windows names it. */
export async function defaultSupervisorCache(session?: SweepSession): Promise<string> {
  const root = await localAppData(session);
  if (!root) throw new Error("Windows supervisor cache refused: this user's local application data folder could not be read");
  return join(root, "shadow-army", "supervisor");
}

/**
 * The supervisor binary for this source, verified on every call: its record must name this source's
 * hash and its bytes must hash to the record. A missing, stale or tampered binary is recompiled;
 * a failed compile throws, so unverified code is never run. The cache is a trust boundary (C1): it must
 * resolve inside this user's local application data, and it, every folder above it up to that root, and
 * the binary must be owned by this user and changeable by nobody else but SYSTEM and administrators.
 * Otherwise this throws and nothing starts. Code running as this same user is out of scope: it could
 * replace the CLI or node itself.
 */
export async function supervisorBinary(cache?: string): Promise<{ path: string; compiled: boolean }> {
  const session = openSweepSession(); // Started only if a check below is not already settled.
  try {
    const folder = await guardedCache(cache, session);
    const cached = await verifiedSupervisor(folder);
    if (cached) return { path: await guardedBinary(cached, session), compiled: false };
    let pending = compiling.get(folder);
    if (!pending) {
      pending = compileSupervisor(folder).finally(() => compiling.delete(folder));
      compiling.set(folder, pending);
    }
    return { path: await guardedBinary(await pending, session), compiled: true };
  } finally { session.close(); }
}
/** One compile per cache at a time in this process: parallel spawns share it. */
const compiling = new Map<string, Promise<string>>();
/** Caches and binaries already found guarded in this process; only this user or an administrator can loosen them. */
const guardedCaches = new Map<string, string>();
const guardedBinaries = new Set<string>();

async function guardedCache(requested: string | undefined, session: SweepSession): Promise<string> {
  const key = requested ?? "";
  const known = guardedCaches.get(key);
  if (known) return known;
  const refuse = (why: string) => new Error(`Windows supervisor cache refused: ${why}`);
  const rootPath = await localAppData(session);
  if (!rootPath) throw refuse("this user's local application data folder could not be read");
  const root = await realpath(rootPath);
  const folder = resolve(requested ?? join(root, "shadow-army", "supervisor"));
  const inside = (path: string) => { const rest = relative(root, path); return rest !== "" && !rest.startsWith("..") && !isAbsolute(rest) ? rest : undefined; };
  if (!inside(folder)) throw refuse(`${folder} is not inside ${root}`);
  await mkdir(folder, { recursive: true });
  const real = await realpath(folder); // A junction or link out of the root is caught here.
  const rest = inside(real);
  if (!rest) throw refuse(`${folder} resolves to ${real}, outside ${root}`);
  let at = root;
  for (const path of [root, ...rest.split(sep).map((part) => (at = join(at, part)))]) {
    if (!await guardedForCurrentUser(path, session)) throw refuse(`${path} is not owned by this user, or someone else can change it`);
  }
  guardedCaches.set(key, real);
  return real;
}

async function guardedBinary(binary: string, session: SweepSession): Promise<string> {
  if (guardedBinaries.has(binary)) return binary;
  if (!await guardedForCurrentUser(binary, session)) throw new Error(`Windows supervisor cache refused: ${binary} is not owned by this user, or someone else can change it`);
  guardedBinaries.add(binary);
  return binary;
}

async function verifiedSupervisor(cache: string): Promise<string | undefined> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(join(cache, `${SUPERVISOR_KEY}.json`), "utf8")); } catch { return undefined; }
  // Any non-object (null included) is a cache miss, never a throw (C3).
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const record = parsed as { source?: unknown; sha256?: unknown };
  if (record.source !== SOURCE_HASH || typeof record.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.sha256)) return undefined;
  const binary = join(cache, `${SUPERVISOR_KEY}-${record.sha256}.exe`);
  let bytes: Buffer;
  try { bytes = await readFile(binary); } catch { return undefined; }
  if (sha256(bytes) === record.sha256) return binary;
  await rm(binary, { force: true }).catch(() => {}); // Tampered: never run it, and drop it if we can.
  return undefined;
}

async function compileSupervisor(cache: string): Promise<string> {
  await mkdir(cache, { recursive: true });
  const work = await mkdtemp(join(cache, "build-"));
  try {
    const source = join(work, "supervisor.cs"), output = join(work, "supervisor.exe"), script = join(work, "compile.ps1");
    await writeFile(source, SUPERVISOR_SOURCE, "utf8");
    await writeFile(script, COMPILE_SCRIPT, "utf8");
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    await new Promise<void>((done, fail) => execFile(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, source, output],
      { windowsHide: true, timeout: 120_000 }, (error, _stdout, stderr) => error ? fail(new Error(`Windows supervisor did not compile: ${String(stderr).slice(-2_048) || error.message}`)) : done()));
    const hash = sha256(await readFile(output));
    // Content-addressed: a binary another process is running is never replaced, only added beside.
    const binary = join(cache, `${SUPERVISOR_KEY}-${hash}.exe`);
    await rename(output, binary);
    const record = join(work, "record.json");
    await writeFile(record, JSON.stringify({ source: SOURCE_HASH, sha256: hash }), "utf8");
    await rename(record, join(cache, `${SUPERVISOR_KEY}.json`)).catch(() => {}); // A parallel compile's record is as good.
    if (sha256(await readFile(binary)) !== hash) throw new Error("Windows supervisor changed while it was being cached");
    // Other source versions' files stay (C2): another installed version sharing this profile may be verifying,
    // publishing or running them, and nothing here can rule that out.
    return binary;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// PO-16's sweep on Windows. Each call opens the process once and checks it, and ends it, through that one handle:
// a pid reused between the check and the end can't receive the end (taskkill takes a bare pid). A tree also ends
// each child of the checked process, each checked on its own handle: its parent pid, and a creation time after
// the parent's. "absent" when no such process runs; "unknown" when a query failed, never read as absent.
// TerminateProcess only starts an exit, so each exit is confirmed by waiting on the same handle. "incomplete" when
// a descendant could not be listed, opened, ended or confirmed: the parent alone is no evidence of an empty tree.
const SWEEP_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
public static class ShadowSweep {
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot,ref ENTRY entry);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot,ref ENTRY entry);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process,int kind,ref BASIC info,int length,IntPtr returned);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ENTRY { public uint size,usage,pid; public IntPtr heap; public uint module,threads,parent; public int priority; public uint flags; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string file; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC { public IntPtr exit,peb,affinity,priority,pid,parent; }
  static string Open(uint pid,uint access,out IntPtr handle,out long creation) {
    creation=0; handle=OpenProcess(access,false,pid);
    if(handle==IntPtr.Zero) return Marshal.GetLastWin32Error()==87 ? "absent" : "unknown";
    uint code; long exit,kernel,user;
    if(!GetExitCodeProcess(handle,out code)) return "unknown"; if(code!=259) return "absent";
    if(!GetProcessTimes(handle,out creation,out exit,out kernel,out user)) return "unknown";
    return exit!=0 ? "absent" : null;
  }
  public static string Owned(string path) {
    FileSystemSecurity security=System.IO.Directory.Exists(path) ? (FileSystemSecurity)System.IO.Directory.GetAccessControl(path,AccessControlSections.Owner) : System.IO.File.GetAccessControl(path,AccessControlSections.Owner);
    IdentityReference owner=security.GetOwner(typeof(SecurityIdentifier)); WindowsIdentity me=WindowsIdentity.GetCurrent();
    // An elevated token's files are owned by its default owner (Administrators), not its user.
    return owner!=null && (owner.Equals(me.User) || owner.Equals(me.Owner)) ? "owned" : "other";
  }
  // Write, append, attributes, delete, delete-child, change-permissions, take-ownership, GENERIC_ALL and GENERIC_WRITE.
  const int Changes=0x000D0156|0x10000000|0x40000000;
  // "guarded" when this user owns the path and only it, SYSTEM and administrators may change or replace it.
  public static string Guarded(string path) {
    if(Owned(path)!="owned") return "other";
    FileSystemSecurity security=System.IO.Directory.Exists(path) ? (FileSystemSecurity)System.IO.Directory.GetAccessControl(path,AccessControlSections.Access) : System.IO.File.GetAccessControl(path,AccessControlSections.Access);
    WindowsIdentity me=WindowsIdentity.GetCurrent();
    foreach(FileSystemAccessRule rule in security.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
      if(rule.AccessControlType!=AccessControlType.Allow || (rule.PropagationFlags&PropagationFlags.InheritOnly)!=0 || ((int)rule.FileSystemRights&Changes)==0) continue;
      SecurityIdentifier sid=(SecurityIdentifier)rule.IdentityReference;
      if(sid.Equals(me.User) || sid.Equals(me.Owner) || sid.IsWellKnown(WellKnownSidType.LocalSystemSid) || sid.IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid)) continue;
      return "open";
    }
    return "guarded";
  }
  // This user's local application data folder as Windows names it, not as %LOCALAPPDATA% says (base64 UTF-8).
  public static string Root() {
    return Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData,Environment.SpecialFolderOption.DoNotVerify)));
  }
  public static string Probe(uint pid) {
    IntPtr handle; long creation; string state=Open(pid,0x1000,out handle,out creation);
    try { return state ?? creation.ToString(CultureInfo.InvariantCulture); } finally { if(handle!=IntPtr.Zero) CloseHandle(handle); }
  }
  // SYNCHRONIZE, PROCESS_QUERY_LIMITED_INFORMATION and PROCESS_TERMINATE: checked, ended and waited on one handle.
  const uint EndAccess=0x101001;
  public static string End(uint pid,long expected,bool tree) {
    IntPtr handle; long creation; string state=Open(pid,EndAccess,out handle,out creation);
    try {
      if(state!=null) return state; if(creation!=expected) return "different";
      bool complete=!tree || EndChildren(pid,creation);
      if(!Terminated(handle)) return "unknown";
      return complete ? "ended" : "incomplete";
    } finally { if(handle!=IntPtr.Zero) CloseHandle(handle); }
  }
  // Ends the process on its handle and waits there for the exit: true only once it has exited.
  static bool Terminated(IntPtr handle) { TerminateProcess(handle,1); return WaitForSingleObject(handle,3000)==0; }
  static bool EndChildren(uint parent,long after) {
    List<uint> children=Children(parent); if(children==null) return false;
    bool complete=true; foreach(uint child in children) complete&=EndChild(child,parent,after); return complete;
  }
  // True when the pid is no descendant (gone, created before its parent, or another parent's) or was ended and confirmed.
  static bool EndChild(uint pid,uint parent,long after) {
    IntPtr handle; long creation; string state=Open(pid,EndAccess,out handle,out creation);
    try {
      if(state=="absent") return true; if(state!=null) return false;
      BASIC info=new BASIC();
      if(NtQueryInformationProcess(handle,0,ref info,Marshal.SizeOf(info),IntPtr.Zero)!=0) return false;
      if(creation<after || info.parent.ToInt64()!=parent) return true;
      bool complete=EndChildren(pid,creation);
      return Terminated(handle) && complete;
    } finally { if(handle!=IntPtr.Zero) CloseHandle(handle); }
  }
  // Every pid whose parent is this one; null when the processes could not be listed.
  static List<uint> Children(uint parent) {
    List<uint> found=new List<uint>(); IntPtr snapshot=CreateToolhelp32Snapshot(2,0); if(snapshot==new IntPtr(-1)) return null;
    try {
      ENTRY entry=new ENTRY(); entry.size=(uint)Marshal.SizeOf(typeof(ENTRY));
      bool more=Process32FirstW(snapshot,ref entry); if(!more) return null;
      for(;more;more=Process32NextW(snapshot,ref entry)) if(entry.parent==parent && entry.pid!=parent) found.Add(entry.pid);
    } finally { CloseHandle(snapshot); }
    return found;
  }
}
'@
`;

const isWindowsPid = (pid: number): boolean => Number.isSafeInteger(pid) && pid > 0 && pid <= 0xffff_ffff;
/** PowerShell by its absolute path under the system root, never by a name the PATH resolves (PO-16). */
async function systemPowerShell(): Promise<string> {
  const root = process.env.SystemRoot;
  if (!root || !/^[A-Za-z]:\\/.test(root)) throw new Error("the system root is not an absolute path");
  const path = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("PowerShell is not a plain file");
  return path;
}
// One line in, one answer line out: the helper is compiled once per session, never once per call (C10).
const SWEEP_LOOP = String.raw`
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $part = $line.Split(' ')
  try {
    $answer = switch ($part[0]) {
      'probe' { [ShadowSweep]::Probe([uint32]$part[1]) }
      'end' { [ShadowSweep]::End([uint32]$part[1], [long]$part[2], $part[3] -eq '1') }
      'owned' { [ShadowSweep]::Owned([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part[1]))) }
      'guarded' { [ShadowSweep]::Guarded([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part[1]))) }
      'root' { 'root ' + [ShadowSweep]::Root() }
      default { 'unknown' }
    }
  } catch { $answer = 'unknown' }
  [Console]::Out.WriteLine([string]$answer); [Console]::Out.Flush()
}
`;
/** A call's limit, the helper's start and compile included: past it the session is ended and answers "unknown". */
export const SWEEP_CALL_LIMIT_MS = 15_000;

/** One PowerShell helper for a whole sweep: calls run one at a time, each bounded; `close` ends the process. */
export interface SweepSession {
  call(line: string): Promise<string>;
  /** The helper's pid once started (for tests). */
  readonly pid: number | undefined;
  close(): void;
}

export function openSweepSession(callLimitMs = SWEEP_CALL_LIMIT_MS): SweepSession {
  let child: ChildProcess | undefined;
  let ended = false;
  let pending: ((answer: string) => void) | undefined;
  let buffered = "";
  let queue: Promise<unknown> = Promise.resolve();
  // A failure, an exit or a timeout ends the session: the pending call and every later one answer "unknown".
  const stop = () => { ended = true; child?.kill(); const answer = pending; pending = undefined; answer?.("unknown"); };
  const start = async (): Promise<ChildProcess | undefined> => {
    if (child || ended) return child;
    const script = Buffer.from(`${SWEEP_HELPER}\n${SWEEP_LOOP}`, "utf16le").toString("base64");
    child = spawn(await systemPowerShell(), ["-NoProfile", "-NonInteractive", "-EncodedCommand", script], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    child.on("error", stop).on("exit", stop);
    child.stdin!.on("error", stop);
    child.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
      buffered += chunk;
      for (let at = buffered.indexOf("\n"); at >= 0; at = buffered.indexOf("\n")) {
        const line = buffered.slice(0, at).trim();
        buffered = buffered.slice(at + 1);
        const answer = pending; pending = undefined; answer?.(line);
      }
    });
    // A session left open never holds the process alive; a pending call's timer does while it waits.
    child.unref(); (child.stdin as unknown as { unref?(): void }).unref?.(); (child.stdout as unknown as { unref?(): void }).unref?.();
    return child;
  };
  const send = async (line: string): Promise<string> => {
    const helper = await start().catch(() => { ended = true; return undefined; });
    if (ended || !helper) return "unknown";
    return new Promise<string>((done) => {
      const timer = setTimeout(stop, callLimitMs);
      pending = (answer) => { clearTimeout(timer); done(answer); };
      helper.stdin!.write(`${line}\n`);
    });
  };
  return {
    call: (line) => { const answer = queue.then(() => send(line)); queue = answer.catch(() => {}); return answer; },
    get pid() { return child?.pid; },
    close: stop,
  };
}
/** Through the sweep's session, or a session of its own for this one call. */
async function ask(session: SweepSession | undefined, line: string): Promise<string> {
  const own = session ?? openSweepSession();
  try { return await own.call(line); } finally { if (!session) own.close(); }
}

/**
 * A process's exact creation time (a FILETIME string); `undefined` when no such process runs; `null` when the
 * probe failed. Unknown is never read as absent: the sweep keeps the record and reports it.
 */
export async function probeWindowsProcess(pid: number, session?: SweepSession): Promise<string | undefined | null> {
  // A pid Windows can't hold is a bad record, not a process known to have ended: unknown.
  if (!isWindowsPid(pid)) return null;
  const result = await ask(session, `probe ${pid}`);
  return result === "absent" ? undefined : /^[1-9]\d*$/.test(result) ? result : null;
}

/** Whether this user (or an elevated token's default owner) owns the path; a failed check is not ownership. */
export async function ownedByCurrentUser(path: string, session?: SweepSession): Promise<boolean> {
  return await ask(session, `owned ${Buffer.from(path, "utf8").toString("base64")}`) === "owned";
}

/** Whether this user owns the path and nobody else but SYSTEM and administrators can change or replace it. */
export async function guardedForCurrentUser(path: string, session?: SweepSession): Promise<boolean> {
  return await ask(session, `guarded ${Buffer.from(path, "utf8").toString("base64")}`) === "guarded";
}

/** This user's local application data folder from Windows, not from %LOCALAPPDATA%; `undefined` when unread. */
async function localAppData(session?: SweepSession): Promise<string | undefined> {
  const answer = /^root ([A-Za-z0-9+/]+=*)$/.exec(await ask(session, "root"));
  const path = answer && Buffer.from(answer[1]!, "base64").toString("utf8");
  return path && isAbsolute(path) ? path : undefined;
}

export type WindowsEnd = "ended" | "incomplete" | "absent" | "different" | "unknown";
/** Ends the process only while its exact creation time (a FILETIME string) is the recorded one, through the checked handle. */
export async function endWindowsProcess(pid: number, creationTime: string | undefined, tree: boolean, session?: SweepSession): Promise<WindowsEnd> {
  // An old millisecond record has no exact identity: nothing is ended on its evidence.
  if (!isWindowsPid(pid) || creationTime === undefined || !/^[1-9]\d{0,18}$/.test(creationTime) || BigInt(creationTime) >= 2n ** 63n) return "unknown";
  const result = await ask(session, `end ${pid} ${creationTime} ${tree ? 1 : 0}`);
  return (["ended", "incomplete", "absent", "different"] as const).find((one) => one === result) ?? "unknown";
}
