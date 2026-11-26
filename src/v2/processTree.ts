import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath as realpathCallback } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Writable, type Readable } from "node:stream";

export interface ProcessExit { code: number | null; signal: NodeJS.Signals | null }
export interface ManagedProcess {
  readonly pid: number;
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  /** Root CLI exit, even while descendants remain in the session's containment. */
  readonly exited: Promise<ProcessExit>;
  /** Session teardown, not turn teardown: persistent CLI services belong to the session. */
  close(): Promise<void>;
  /** CH-1: the PATH entries left out of the lookup and the child's PATH. */
  readonly droppedPath: string[];
}
export interface ManagedProcessOptions {
  file: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}


/**
 * Kernel ownership: a kill-on-close Job Object. Windows only (M1a): Linux and macOS are
 * "Not tested" (D-34), so they fail clearly instead of running containment nobody has checked.
 */
export async function spawnManagedProcess(options: ManagedProcessOptions): Promise<ManagedProcess> {
  if (process.platform !== "win32") {
    throw new Error(`Session process containment is Windows only in M1a; ${process.platform} is not tested (D-34).`);
  }
  return spawnWindows(options);
}

// Real path with links, junctions and 8.3 short names followed (GetFinalPathNameByHandle on Windows).
const realpath = promisify(realpathCallback.native);
const comparable = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;
// Outside means a whole leading ".." segment: a child folder named "..bin" is still inside.
const inside = (path: string, root: string) => { const rel = relative(root, path); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };

/** The soldier's folder, its repository's checkout and every worktree of it, read from git's own files (no git run). */
async function repositoryFolders(cwd: string): Promise<string[]> {
  const folders = [cwd];
  try {
    let gitDir = join(cwd, ".git");
    if ((await stat(gitDir)).isFile()) {
      const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(await readFile(gitDir, "utf8"));
      if (!pointer) return folders;
      gitDir = resolve(cwd, pointer[1]!);
    }
    const common = await readFile(join(gitDir, "commondir"), "utf8").then((text) => resolve(gitDir, text.trim()), () => gitDir);
    folders.push(dirname(common));
    for (const entry of await readdir(join(common, "worktrees")).catch(() => [] as string[])) {
      const linked = (await readFile(join(common, "worktrees", entry, "gitdir"), "utf8").catch(() => "")).trim();
      if (linked) folders.push(dirname(resolve(common, "worktrees", entry, linked)));
    }
  } catch { /* Not a repository: the folder itself is still excluded. */ }
  return folders;
}

/**
 * CH-1: the CLI's PATH is the caller's less every relative or empty entry, every entry that can't be
 * resolved, and every entry in the folder, its checkout or a worktree, compared by real path.
 */
async function trustedPath(cwd: string, env: NodeJS.ProcessEnv): Promise<{ kept: string[]; dropped: string[]; roots: string[] }> {
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  const roots = (await Promise.all((await repositoryFolders(cwd)).map((folder) => realpath(folder).catch(() => resolve(folder))))).map(comparable);
  const kept: string[] = [], dropped: string[] = [];
  for (const entry of pathValue.split(delimiter)) {
    const real = entry && isAbsolute(entry) ? await realpath(entry).catch(() => undefined) : undefined;
    if (real && !roots.some((root) => inside(comparable(real), root))) kept.push(entry); else dropped.push(entry);
  }
  return { kept, dropped, roots };
}

async function resolveWindowsCommand(file: string, cwd: string, env: NodeJS.ProcessEnv, path: string[]): Promise<string> {
  // A bare name is looked up only in trusted PATH entries, with each PATHEXT suffix in order, never with none.
  // A configured command is an absolute path; a relative one would come from the soldier's folder.
  if (!isAbsolute(file) && /[\\/]/.test(file)) throw Object.assign(new Error(`executable ${file} must be a bare name or an absolute path`), { code: "ENOENT" });
  const extensions = extname(file) ? [""] : (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  for (const directory of isAbsolute(file) ? [""] : path) for (const extension of extensions) {
    const candidate = directory ? join(directory, `${file}${extension}`) : `${file}${extension}`;
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
  const inherited = options.env ?? process.env;
  const path = await trustedPath(options.cwd, inherited);
  const pathKey = Object.keys(inherited).find((key) => key.toLowerCase() === "path") ?? "Path";
  // cmd.exe would otherwise search the current folder before PATH for every name a shim runs.
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(inherited).filter(([key]) => key.toLowerCase() !== "path" && key.toLowerCase() !== "nodefaultcurrentdirectoryinexepath")),
    [pathKey]: path.kept.join(delimiter), NoDefaultCurrentDirectoryInExePath: "1" };
  const executable = await resolveWindowsCommand(options.file, options.cwd, env, path.kept);
  // CH-1: the selected file itself, links followed, must also lie outside the checkout and its worktrees.
  const realExecutable = comparable(await realpath(executable).catch(() => resolve(executable)));
  if (path.roots.some((root) => inside(realExecutable, root))) throw Object.assign(new Error(`executable ${executable} is inside the soldier's repository`), { code: "EACCES" });
  const command = windowsCommand(executable, options.args ?? [], env);
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
    wrapper.stdin.write(`${JSON.stringify({ ...command, cwd: options.cwd, pipeName, token })}\n`);
    const launchTimer = setTimeout(() => failed(new Error(`Windows supervisor did not launch within 15 seconds${diagnostic ? `: ${diagnostic}` : ""}`)), 15_000);
    try { await ready; } finally { clearTimeout(launchTimer); }
    wrapper.stderr.off("data", captureDiagnostic);
    let closing: Promise<void> | undefined;
    return {
      pid: rootPid!, stdin: wrapper.stdin, stdout: wrapper.stdout, stderr: wrapper.stderr, exited, droppedPath: path.dropped,
      close() {
        return closing ??= (async () => {
          const killed = setTimeout(() => wrapper.kill(), 15_000);
          wrapper.stdin.end();
          control?.write("close\n");
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
      await new Promise<void>((done) => { child!.once("close", done); setTimeout(done, 2_000).unref(); });
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
      var stop=new ManualResetEvent(false); int shutdownReason=0;
      var control=new Thread(delegate() {
        try { var reader=new StreamReader(pipe,Encoding.UTF8,false,1024,true); while(reader.ReadLine()!=null) { Interlocked.CompareExchange(ref shutdownReason,1,0); stop.Set(); } } catch {}
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
        if(ended) { Interlocked.CompareExchange(ref shutdownReason,1,0); stop.Set(); }
      }); pump.IsBackground=true; pump.Start();
      bool rootExited=false;
      while(!stop.WaitOne(20)) {
        if(!rootExited && WaitForSingleObject(process.process,0)==0) { uint code; Check(GetExitCodeProcess(process.process,out code)); rootExited=true; events.WriteLine(serializer.Serialize(new { kind="exited",code=code })); }
      }
      // Native stdin EOF runs the CLI's own shutdown hooks. Ordinary close gives that exit
      // up to two seconds; loss of the owner's control pipe always bypasses the grace.
      if(!rootExited && Interlocked.CompareExchange(ref shutdownReason,0,0)!=2) {
        uint began=(uint)Environment.TickCount;
        while(WaitForSingleObject(process.process,20)!=0 && (uint)((uint)Environment.TickCount-began)<2000 && Interlocked.CompareExchange(ref shutdownReason,0,0)!=2) {}
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
