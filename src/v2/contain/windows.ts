import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";
import { Writable, type Readable } from "node:stream";

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
}
export interface ManagedProcessOptions {
  file: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** How long the CLI gets to exit after stdin EOF before its tree is ended. Defaults to PO-10's 10 s; tests inject less. */
  exitGraceMs?: number;
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
  const directory = await mkdtemp(join(tmpdir(), "shadow-job-"));
  const script = join(directory, "supervisor.ps1");
  await writeFile(script, WINDOWS_SUPERVISOR, { encoding: "utf8", mode: 0o600 });
  let control: Socket | undefined;
  let treeClosed = false;
  let rootPid: number | undefined;
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
      if (buffer.length > 16_384) { socket.destroy(); return; }
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let event: { token?: string; kind?: string; pid?: number; code?: number; message?: string };
        try { event = JSON.parse(line); } catch { socket.destroy(); return; }
        if (!authenticated) {
          if (control || event.token !== token) { socket.destroy(); return; }
          authenticated = true; control = socket;
        }
        if (event.kind === "started" && typeof event.pid === "number") { rootPid = event.pid; started(); }
        else if (event.kind === "exited") settleExit({ code: event.code ?? null, signal: null });
        else if (event.kind === "closed") treeClosed = true;
        else if (event.kind === "error") failed(new Error(event.message ?? "Windows process containment failed"));
      }
    });
  });
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(`\\\\.\\pipe\\${pipeName}`, done); });
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    child = spawn(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
      cwd: options.cwd, env, windowsHide: true, stdio: "pipe",
    });
    const wrapper = child;
    let diagnostic = "";
    const captureDiagnostic = (chunk: Buffer) => { diagnostic = (diagnostic + chunk.toString()).slice(-4_096); };
    wrapper.stderr.on("data", captureDiagnostic);
    wrapper.stdin.on("error", () => {});
    wrapper.once("error", failed);
    const wrapperClosed = new Promise<void>((done) => wrapper.once("close", () => {
      settleExit({ code: wrapper.exitCode, signal: wrapper.signalCode });
      failed(new Error(`Windows supervisor exited before launch${diagnostic ? `: ${diagnostic}` : ""}`));
      done();
    }));
    wrapper.stdin.write(`${JSON.stringify({ ...command, cwd: options.cwd, pipeName, token, exitGraceMs })}\n`);
    const launchTimer = setTimeout(() => failed(new Error(`Windows supervisor did not launch within 15 seconds${diagnostic ? `: ${diagnostic}` : ""}`)), 15_000);
    try { await ready; } finally { clearTimeout(launchTimer); }
    wrapper.stderr.off("data", captureDiagnostic);
    let closing: Promise<void> | undefined;
    return {
      pid: rootPid!, stdin: wrapper.stdin, stdout: wrapper.stdout, stderr: wrapper.stderr, exited,
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
            await rm(directory, { recursive: true, force: true });
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
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

// Embedded in the compiled module: published dist/ needs no source-tree script or native package.
// Bootstrap is read from stdin and never passed to the CLI; session credentials cannot enter argv.
const WINDOWS_SUPERVISOR = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
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
  static void Check(bool value) { if(!value) throw new Win32Exception(Marshal.GetLastWin32Error()); }
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
      events=new StreamWriter(pipe,new UTF8Encoding(false),1024,true); events.AutoFlush=true;
      var stop=new ManualResetEvent(false); var eofForwarded=new ManualResetEvent(false); int shutdownReason=0;
      var control=new Thread(delegate() {
        // "close" asks for a graceful exit; "kill" (a lost connection) ends the tree at once.
        try { var reader=new StreamReader(pipe,Encoding.UTF8,false,1024,true); string line; while((line=reader.ReadLine())!=null) { if(line=="kill") Interlocked.Exchange(ref shutdownReason,2); else Interlocked.CompareExchange(ref shutdownReason,1,0); stop.Set(); } } catch {}
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
      events.WriteLine(serializer.Serialize(new { token=config["token"],kind="started",pid=process.pid }));
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
        if(!rootExited && WaitForSingleObject(process.process,0)==0) { uint code; Check(GetExitCodeProcess(process.process,out code)); rootExited=true; events.WriteLine(serializer.Serialize(new { kind="exited",code=code })); }
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
      if(!rootExited && WaitForSingleObject(process.process,0)==0) { uint code; Check(GetExitCodeProcess(process.process,out code)); rootExited=true; events.WriteLine(serializer.Serialize(new { kind="exited",code=code })); }
      Check(TerminateJobObject(job,1));
      bool empty=false; for(int attempt=0;attempt<500;attempt++) { ACCOUNTING accounting; Check(QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero)); if(accounting.active==0) { empty=true; break; } Thread.Sleep(20); }
      if(!empty) throw new Exception("session job did not empty within 10 seconds");
      if(!rootExited) { uint code; Check(GetExitCodeProcess(process.process,out code)); events.WriteLine(serializer.Serialize(new { kind="exited",code=code })); }
      events.WriteLine(serializer.Serialize(new { kind="closed" }));
      return 0;
    } catch(Exception error) {
      if(events!=null) { try { events.WriteLine(serializer.Serialize(new { kind="error",message=error.Message })); } catch {} }
      Console.Error.WriteLine("Windows process containment: "+error.Message); return 1;
    } finally {
      if(job!=IntPtr.Zero) CloseHandle(job);
      if(process.thread!=IntPtr.Zero) CloseHandle(process.thread); if(process.process!=IntPtr.Zero) CloseHandle(process.process);
      if(read!=IntPtr.Zero) CloseHandle(read); if(write!=IntPtr.Zero) CloseHandle(write);
      if(attributes!=IntPtr.Zero) { DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); } if(jobPointer!=IntPtr.Zero) Marshal.FreeHGlobal(jobPointer);
      if(events!=null) events.Dispose(); if(pipe!=null) pipe.Dispose();
    }
  }
}
'@
exit ([ShadowJobSupervisor]::Run())
`;
