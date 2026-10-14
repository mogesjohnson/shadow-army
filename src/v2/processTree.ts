import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";
import { PassThrough, Writable, type Readable } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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
}
export interface ManagedProcessOptions {
  file: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

const notFound = (error: unknown) => (error as NodeJS.ErrnoException).code === "ESRCH";
const execute = promisify(execFile);
let nativeBridge: Promise<string> | undefined;
async function processSupervisor(): Promise<string> {
  return nativeBridge ??= (async () => {
    const script = fileURLToPath(new URL("../../scripts/build-process-supervisor.mjs", import.meta.url));
    const { stdout } = await execute(process.execPath, [script], { timeout: 35_000, maxBuffer: 65536 });
    const built = JSON.parse(stdout) as { path?: string };
    if (!built.path || !isAbsolute(built.path)) throw new Error("Native session containment returned no executable.");
    return built.path;
  })();
}

/** Kernel ownership: Linux subreaper, macOS job coalition, Windows kill-on-close Job Object. */
export async function spawnManagedProcess(options: ManagedProcessOptions): Promise<ManagedProcess> {
  return process.platform === "win32" ? spawnWindows(options) : process.platform === "darwin" ? spawnDarwin(options) : spawnPosix(options);
}

async function spawnPosix(options: ManagedProcessOptions): Promise<ManagedProcess> {
  if (process.platform !== "linux") throw new Error("Session process containment currently supports Windows, Linux, and macOS.");
  const supervisor = await processSupervisor();
  // The guardian owns this group for its entire life. It survives native root exit, and IPC EOF
  // lets it tear down the group even when the post office is killed without running finally.
  // prctl is set before exec, so the Node guardian inherits the kernel's subreaper identity.
  const guardian = spawn(supervisor, ["launch", process.execPath, "-e", POSIX_GUARDIAN], {
    cwd: options.cwd, env: options.env, detached: true, stdio: ["pipe", "pipe", "pipe", "ipc"],
  }) as ChildProcessWithoutNullStreams;
  const group = guardian.pid;
  let groupSignalled = false;
  const killGroup = () => {
    if (!group || groupSignalled) return;
    try { process.kill(-group, "SIGKILL"); } catch (error) { if (!notFound(error)) throw error; }
    groupSignalled = true;
  };
  let settleExit!: (exit: ProcessExit) => void;
  const exited = new Promise<ProcessExit>((done) => { settleExit = done; });
  let started!: () => void;
  let failed!: (error: Error) => void;
  const ready = new Promise<void>((done, fail) => { started = done; failed = fail; });
  let pid: number | undefined;
  let contained = false, containmentError: Error | undefined;
  guardian.on("message", (message: unknown) => {
    if (!message || typeof message !== "object") return;
    const event = message as { kind?: string; pid?: number; code?: number | null; signal?: NodeJS.Signals | null; message?: string };
    if (event.kind === "started" && typeof event.pid === "number") { pid = event.pid; started(); }
    else if (event.kind === "exited") settleExit({ code: event.code ?? null, signal: event.signal ?? null });
    else if (event.kind === "error") failed(new Error(event.message ?? "POSIX process guardian failed"));
    else if (event.kind === "closed") contained = true;
    else if (event.kind === "containment_error") containmentError = new Error(event.message ?? "Linux session descendants did not end.");
  });
  guardian.stdin.on("error", () => {});
  guardian.once("error", (error) => { settleExit({ code: null, signal: null }); failed(error); });
  guardian.once("exit", (code, signal) => {
    // A guardian fault while the office is alive also ends its owned group, before a restart.
    try { killGroup(); } catch (error) { failed(error as Error); }
    settleExit({ code, signal }); failed(new Error("POSIX process guardian exited before launch"));
  });
  const guardianClosed = new Promise<void>((done) => guardian.once("close", () => done()));
  guardian.stdin.write(`${JSON.stringify({ file: options.file, args: options.args ?? [], cwd: options.cwd })}\n`);
  const launchTimer = setTimeout(() => failed(new Error("POSIX process guardian did not launch within 10 seconds")), 10_000);
  try { await ready; } catch (error) { killGroup(); await guardianClosed; throw error; } finally { clearTimeout(launchTimer); }
  let closing: Promise<void> | undefined;
  return {
    pid: pid!, stdin: guardian.stdin, stdout: guardian.stdout, stderr: guardian.stderr, exited,
    close() {
      return closing ??= (async () => {
        const fallback = setTimeout(killGroup, 15_000);
        guardian.stdin.end();
        if (guardian.connected) guardian.send({ kind: "close" }, () => {});
        else killGroup();
        try {
          await guardianClosed;
          if (!contained) throw containmentError ?? new Error("Linux session guardian ended without verifying that every descendant stopped.");
        } finally { clearTimeout(fallback); }
      })();
    },
  };
}

// Only this fixed source enters argv. Native launch data travels through a bounded stdin header;
// the remaining bytes stream to native stdin with backpressure and without text decoding.
const POSIX_GUARDIAN = String.raw`
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
let native, header = Buffer.alloc(0), stopping = false, closing = false, nativeExited = false, grace, forced;
function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(grace); clearTimeout(forced);
  // The kernel reparents orphaned descendants to this subreaper even after setsid, double-fork,
  // or env clearing. Kill direct children first; their remaining children are then adopted here.
  // Reading and signaling run in one JS callback, before libuv can reap/reuse these child PIDs.
  const began = Date.now();
  function drain() {
    let children;
    try { children = readFileSync('/proc/self/task/'+process.pid+'/children','utf8').trim().split(/\s+/).filter(Boolean).map(Number); }
    catch (error) { fail(error.message); return; }
    // Adopted children unknown to libuv can remain zombies until this guardian exits.
    // They have already exited and cannot fork or write; only live children need signals.
    children = children.filter(pid => {
      try {
        const stat = readFileSync('/proc/'+pid+'/stat','utf8');
        return stat.slice(stat.lastIndexOf(')')+2).split(' ')[0] !== 'Z';
      } catch (error) { if(error.code==='ENOENT') return false; throw error; }
    });
    if (!children.length) {
      if (process.connected) process.send({kind:'closed'},()=>process.exit(0));
      else process.exit(0);
      return;
    }
    for (const pid of children) {
      try { process.kill(pid,'SIGKILL'); } catch (error) { if(error.code!=='ESRCH') { fail(error.message); return; } }
    }
    if (Date.now()-began>=10000) { fail('Linux session descendants did not empty within 10 seconds'); return; }
    setTimeout(drain,10); // Let libuv reap killed children before testing the next adopted generation.
  }
  function fail(message) {
    if(process.connected) process.send({kind:'containment_error',message},()=>process.exit(1));
    else process.exit(1);
  }
  drain();
}
function notify(event, then) {
  if (!process.connected) { stop(); return; }
  process.send(event, (error) => { if (error) stop(); else if (then) then(); });
}
function close() {
  if (closing || stopping) return;
  closing = true;
  if (!native) { stop(); return; }
  if (nativeExited) {
    notify({ kind: 'exited', code: native.exitCode, signal: native.signalCode }, stop); return;
  }
  // Preserve the native EOF/SessionEnd path before containing stubborn services. SIGTERM
  // gives a CLI that ignores EOF one final cleanup opportunity; owner death skips this grace.
  native.stdin.end();
  grace = setTimeout(() => {
    try { native.kill('SIGTERM'); } catch {}
    forced = setTimeout(stop, 500);
  }, 2000);
}
function forward(bytes) {
  if (!closing && bytes.length && !native.stdin.destroyed && !native.stdin.write(bytes)) {
    process.stdin.pause(); native.stdin.once('drain', () => process.stdin.resume());
  }
}
process.on('disconnect', stop);
process.on('message', (event) => { if (event && event.kind === 'close') close(); });
process.on('SIGTERM', stop); process.on('SIGINT', stop); process.on('SIGHUP', stop);
process.stdin.on('error', stop);
process.stdin.on('end', close);
process.stdin.on('data', (bytes) => {
  if (native) { forward(bytes); return; }
  const newline = bytes.indexOf(10);
  if (header.length + (newline < 0 ? bytes.length : newline) > 1048576) {
    notify({ kind: 'error', message: 'POSIX guardian bootstrap exceeded 1 MiB' }, stop); return;
  }
  if (newline < 0) { header = Buffer.concat([header, bytes]); return; }
  try {
    const config = JSON.parse(Buffer.concat([header, bytes.subarray(0, newline)]).toString('utf8'));
    header = Buffer.alloc(0);
    // This root joins the guardian's group; it must not detach into another group.
    native = spawn(config.file, config.args, { cwd: config.cwd, detached: false, stdio: ['pipe', 'inherit', 'inherit'] });
    native.stdin.on('error', () => {});
    native.once('spawn', () => notify({ kind: 'started', pid: native.pid }));
    native.once('error', (error) => notify({ kind: 'error', message: error.message }, stop));
    native.once('exit', (code, signal) => {
      nativeExited = true;
      notify({ kind: 'exited', code, signal }, closing ? stop : undefined);
    });
    forward(bytes.subarray(newline + 1));
  } catch (error) { notify({ kind: 'error', message: error.message }, stop); }
});
if (!process.connected) stop();
`;

interface DarwinIdentity { pid: number; unique: string; version: number; coalition: string; status: number }
async function darwinNative<T>(bridge: string, args: string[]): Promise<T> {
  const { stdout } = await execute(bridge, args, { timeout: 12_000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}

async function spawnDarwin(options: ManagedProcessOptions): Promise<ManagedProcess> {
  const bridge = await processSupervisor();
  const own = await darwinNative<DarwinIdentity>(bridge, ["query", String(process.pid)]);
  const label = `com.shadow-army.session.${randomUUID()}`;
  const nonce = randomBytes(32).toString("hex");
  const temporary = await mkdtemp(join(tmpdir(), "shadow-darwin-session-"));
  const bootstrap = join(temporary, "bootstrap.json");
  const stdout = new PassThrough(), stderr = new PassThrough();
  const server = createServer();
  let socket: Socket | undefined, coalition: string | undefined, rootPid: number | undefined;
  let exitSettled = false, readySettled = false, closing: Promise<void> | undefined;
  let settleExit!: (exit: ProcessExit) => void, start!: () => void, fail!: (error: Error) => void;
  const exited = new Promise<ProcessExit>((done) => { settleExit = (value) => { if (!exitSettled) { exitSettled = true; done(value); } }; });
  const ready = new Promise<void>((done, reject) => { start = () => { readySettled = true; done(); }; fail = (error) => { if (!readySettled) reject(error); }; });
  let containReady!: () => void;
  const readyToContain = new Promise<void>((done) => { containReady = done; });
  const closedSocket = new Promise<void>((done) => server.once("close", () => done()));
  const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  async function removeJob() {
    try { await execute("/bin/launchctl", ["remove", label], { timeout: 5_000, maxBuffer: 65536 }); }
    catch (error) { if ((error as { code?: number }).code !== 3) throw error; }
  }
  async function contain() {
    // Stop demand/restarts before scanning. The kernel coalition identity remains valid after
    // its leader is gone, and IDs are never reused. Only this nonce job is removed.
    let removalError: unknown;
    try { await removeJob(); } catch (error) { removalError = error; }
    if (coalition) await darwinNative(bridge, ["close", coalition]);
    else if (removalError) throw removalError;
    if (removalError) throw removalError;
  }
  server.on("connection", (candidate) => {
    if (socket) { candidate.destroy(); return; }
    let pending = "", authenticated = false;
    const authenticationTimer = setTimeout(() => candidate.destroy(), 10_000);
    candidate.setEncoding("utf8");
    candidate.on("error", () => {});
    candidate.on("close", () => {
      clearTimeout(authenticationTimer);
      if (socket === candidate) {
        containReady(); settleExit({ code: null, signal: null });
        fail(new Error("macOS session bridge closed before native launch."));
      }
    });
    candidate.on("data", (bytes: string) => {
      pending += bytes;
      if (pending.length > 2 * 1024 * 1024) { candidate.destroy(); return; }
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        let event: { kind?: string; nonce?: string; pid?: number; code?: number | null; signal?: NodeJS.Signals | null; stream?: string; data?: string; message?: string };
        try { event = JSON.parse(line); } catch { candidate.destroy(); return; }
        if (!authenticated) {
          if (event.kind !== "hello" || event.nonce !== nonce || !Number.isSafeInteger(event.pid) || !event.pid || event.pid <= 1) { candidate.destroy(); return; }
          authenticated = true; socket = candidate; clearTimeout(authenticationTimer);
          void (async () => {
            const { stdout: registration } = await execute("/bin/launchctl", ["list", label], { timeout: 5_000, maxBuffer: 65536 });
            const jobPid = /"PID"\s*=\s*([1-9]\d*)/.exec(registration)?.[1];
            if (!jobPid || Number(jobPid) !== event.pid) throw new Error("Session bridge did not come from its registered launchd job.");
            const identity = await darwinNative<DarwinIdentity>(bridge, ["query", String(event.pid)]);
            const candidateCoalition = identity.coalition;
            if (candidateCoalition === own.coalition || candidateCoalition === "1") throw new Error("launchd did not create an isolated session coalition.");
            const members = await darwinNative<DarwinIdentity[]>(bridge, ["members", candidateCoalition]);
            if (members.length !== 1 || members[0]?.unique !== identity.unique) throw new Error("Session coalition contained another process before native launch.");
            coalition = candidateCoalition;
            candidate.write(`${JSON.stringify({ kind: "launch", config: { file: options.file, args: options.args ?? [], cwd: options.cwd, env: options.env ?? process.env, bridge, coalition, label } })}\n`);
          })().catch((error: Error) => { fail(error); candidate.destroy(); });
          continue;
        }
        if (event.kind === "started" && typeof event.pid === "number") { rootPid = event.pid; start(); }
        else if (event.kind === "exited") settleExit({ code: event.code ?? null, signal: event.signal ?? null });
        else if (event.kind === "contain_ready") containReady();
        else if (event.kind === "error") { fail(new Error(event.message ?? "macOS session guardian failed")); containReady(); }
        else if (event.kind === "data" && typeof event.data === "string") {
          const stream = event.stream === "stderr" ? stderr : stdout;
          if (!stream.write(Buffer.from(event.data, "base64"))) {
            candidate.pause(); stream.once("drain", () => candidate.resume());
          }
        }
      }
    });
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("macOS session bridge has no loopback port.");
  await writeFile(bootstrap, JSON.stringify({ port: address.port, nonce }), { mode: 0o600 });
  let launchTimer: NodeJS.Timeout | undefined;
  try {
    await execute("/bin/launchctl", ["submit", "-l", label, "--", process.execPath, "-e", DARWIN_GUARDIAN, bootstrap], { timeout: 10_000, maxBuffer: 65536 });
    launchTimer = setTimeout(() => fail(new Error("macOS session guardian did not launch within 15 seconds.")), 15_000);
    await ready;
  } catch (error) {
    try { await contain(); } finally { socket?.destroy(); server.close(); stdout.end(); stderr.end(); await rm(temporary, { recursive: true, force: true }); }
    throw error;
  } finally { if (launchTimer) clearTimeout(launchTimer); }
  const stdin = new Writable({
    write(chunk, _encoding, done) {
      if (!socket || socket.destroyed) { done(new Error("macOS native session is closed.")); return; }
      socket.write(`${JSON.stringify({ kind: "stdin", data: Buffer.from(chunk).toString("base64") })}\n`, done);
    },
    final(done) { if (socket && !socket.destroyed) socket.write('{"kind":"stdin_end"}\n', done); else done(); },
  });
  stdin.on("error", () => {});
  return {
    pid: rootPid!, stdin, stdout, stderr, exited,
    close() {
      return closing ??= (async () => {
        stdin.end();
        if (socket && !socket.destroyed) socket.write('{"kind":"close"}\n');
        await Promise.race([readyToContain, pause(3_000)]);
        try { await contain(); }
        finally {
          socket?.destroy(); server.close(); await closedSocket;
          stdout.end(); stderr.end(); settleExit({ code: null, signal: null });
          await rm(temporary, { recursive: true, force: true });
        }
      })();
    },
  };
}

// The private bootstrap contains a session-only bridge nonce. The post office's credential
// never enters this file, the launchd job arguments, this connection, or the native environment.
const DARWIN_GUARDIAN = String.raw`
const {readFileSync,unlinkSync}=require('node:fs');
const {createConnection}=require('node:net');
const {spawn}=require('node:child_process');
const bootstrap=process.argv[1], setup=JSON.parse(readFileSync(bootstrap,'utf8'));
unlinkSync(bootstrap);
let native,config,closed=false,nativeExited=false,nativeClosed=false,closing=false,grace,forced,pending='';
const socket=createConnection({host:'127.0.0.1',port:setup.port});
function emit(event,then){if(socket.destroyed)return;socket.write(JSON.stringify(event)+'\n',then);}
function readyToContain(){clearTimeout(grace);clearTimeout(forced);emit({kind:'contain_ready'});}
function orphanCleanup(){
 if(closed)return;closed=true;clearTimeout(grace);clearTimeout(forced);
 if(!config){process.exit(1);return;}
 const helper=spawn(config.bridge,['close-own',config.coalition,config.label],{stdio:'ignore'});
 helper.once('error',()=>process.exit(1));helper.unref();
 // Stay alive until the helper has stopped/reaped every other coalition member, including us.
 setInterval(()=>{},1000);
}
function close(){
 if(closing)return;closing=true;
 if(!native||nativeClosed){readyToContain();return;}
 native.stdin.end();
 grace=setTimeout(()=>{try{native.kill('SIGTERM');}catch{}forced=setTimeout(readyToContain,500);},2000);
}
socket.on('connect',()=>emit({kind:'hello',nonce:setup.nonce,pid:process.pid}));
socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('close',orphanCleanup);
socket.on('data',bytes=>{
 pending+=bytes;if(pending.length>2097152){socket.destroy();return;}
 let newline;while((newline=pending.indexOf('\n'))>=0){
  const line=pending.slice(0,newline);pending=pending.slice(newline+1);
  let event;try{event=JSON.parse(line);}catch{socket.destroy();return;}
  if(event.kind==='launch'&&!native){
   config=event.config;
   native=spawn(config.file,config.args,{cwd:config.cwd,env:config.env,stdio:['pipe','pipe','pipe']});
   native.stdin.on('error',()=>{});
   native.once('spawn',()=>emit({kind:'started',pid:native.pid}));
   native.once('error',error=>emit({kind:'error',message:error.message}));
   for(const [name,stream] of [['stdout',native.stdout],['stderr',native.stderr]]){
    stream.on('data',bytes=>{if(!socket.write(JSON.stringify({kind:'data',stream:name,data:bytes.toString('base64')})+'\n')){stream.pause();socket.once('drain',()=>stream.resume());}});
   }
   native.once('exit',(code,signal)=>{nativeExited=true;emit({kind:'exited',code,signal});});
   native.once('close',()=>{nativeClosed=true;if(closing)readyToContain();});
  }else if(event.kind==='stdin'&&native&&!closing){if(!native.stdin.write(Buffer.from(event.data,'base64'))){socket.pause();native.stdin.once('drain',()=>socket.resume());}}
  else if(event.kind==='stdin_end'||event.kind==='close')close();
 }
});
`;

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
      pid: rootPid!, stdin: wrapper.stdin, stdout: wrapper.stdout, stderr: wrapper.stderr, exited,
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
