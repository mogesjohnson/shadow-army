import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, test } from 'vitest';
import { encodeMessage, LspFramer } from './diagnostics-bridge.mjs';
import { projectRoot, resolveServer, runServer } from './start-server.mjs';

const temporary = [];
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

function install({ version = '7.0.2', nativeVersion = version, platform = process.platform, arch = process.arch } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shadow typescript7 lsp '));
  temporary.push(root);
  const packageName = `@typescript/typescript-${platform}-${arch}`;
  const typescript = join(root, 'node_modules', 'typescript', 'package.json');
  const native = join(root, 'node_modules', ...packageName.split('/'), 'package.json');
  for (const path of [typescript, native]) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(typescript, JSON.stringify({ name: 'typescript', version, optionalDependencies: { [packageName]: version } }));
  writeFileSync(native, JSON.stringify({ name: packageName, version: nativeVersion }));
  const command = join(dirname(native), 'lib', platform === 'win32' ? 'tsc.exe' : 'tsc');
  mkdirSync(dirname(command), { recursive: true });
  writeFileSync(command, 'fixture native executable');
  chmodSync(command, 0o755);
  return { root, command };
}

function running(mode = 'echo') {
  const { root, command } = install();
  const fixture = join(root, 'fake-native.mjs');
  const ready = encodeMessage({ jsonrpc: '2.0', method: 'fixture/ready' });
  writeFileSync(fixture, `
    const mode = ${JSON.stringify(mode)};
    const hold = mode === 'hold' || mode === 'ignore';
    const interval = hold ? setInterval(() => {}, 100) : undefined;
    if (mode === 'ignore') process.on('SIGTERM', () => {});
    process.stdin.on('data', bytes => { if (mode === 'echo') process.stdout.write(bytes); });
    process.stdin.on('end', () => { if (!hold) process.exitCode = mode === 'failure' ? 23 : 0; });
    process.stdout.write(Buffer.from(${JSON.stringify([...ready])}));
    process.stderr.write('native stderr\\n');
  `);
  const input = new PassThrough(), output = new PassThrough(), errors = new PassThrough(), signals = new EventEmitter();
  const stdout = [], stderr = [];
  let child, launch;
  const readyPromise = new Promise(resolveReady => {
    const parser = new LspFramer(message => { if (message.method === 'fixture/ready') resolveReady(); });
    output.on('data', bytes => { stdout.push(bytes); parser.push(bytes); });
  });
  errors.on('data', bytes => stderr.push(bytes));
  const done = runServer({ root, input, output, errors, signalSource: signals, graceMs: 80,
    spawnProcess: (binary, args, options) => {
      launch = { binary, args, options };
      child = spawn(process.execPath, [fixture], options);
      return child;
    },
  });
  return { root, command, input, output, signals, done, readyPromise, launch, child,
    stdout: () => Buffer.concat(stdout), stderr: () => Buffer.concat(stderr).toString(), ready };
}

describe('project-local TypeScript 7 resolution', () => {
  test('uses explicit CLAUDE_PROJECT_DIR, preserving spaces, with cwd only when unset', () => {
    const { root, command } = install();
    expect(projectRoot({ CLAUDE_PROJECT_DIR: root }, tmpdir())).toBe(root);
    expect(projectRoot({}, root)).toBe(root);
    expect(resolveServer(root)).toMatchObject({ root, command, version: '7.0.2' });
  });
  test('does not search an ancestor installation or substitute a missing selected project', () => {
    const { root } = install();
    const nested = join(root, 'nested project');
    mkdirSync(nested);
    expect(() => resolveServer(nested)).toThrow(/Project-local TypeScript.*not installed/);
    expect(() => resolveServer(projectRoot({ CLAUDE_PROJECT_DIR: join(root, 'missing') }, root))).toThrow(/not installed/);
  });
  test.each(['6.0.3', '8.0.0', '7.invalid'])('refuses TypeScript %s', version => {
    expect(() => resolveServer(install({ version }).root)).toThrow(/TypeScript 7 is required/);
  });
  test('refuses mismatched native packages and missing native binaries', () => {
    expect(() => resolveServer(install({ nativeVersion: '7.0.1' }).root)).toThrow(/must match TypeScript/);
    const installation = install();
    rmSync(installation.command);
    expect(() => resolveServer(installation.root)).toThrow(/native executable is missing/);
  });
  test('resolves the platform-native executable directly on Windows and POSIX', () => {
    for (const platform of ['win32', 'linux', 'darwin']) {
      const { root, command } = install({ platform, arch: 'x64' });
      expect(resolveServer(root, platform, 'x64').command).toBe(command);
    }
  });
});

describe('native server transport and cleanup', () => {
  test('forwards protocol bytes and stderr, with a direct native launch and no shell', async () => {
    const h = running();
    await h.readyPromise;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'fixture/echo', params: '☃' }));
    const frame = Buffer.concat([Buffer.from(`content-length: ${body.length}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n`), body]);
    h.input.write(frame.subarray(0, 17));
    h.input.end(frame.subarray(17));
    expect(await h.done).toBe(0);
    expect(h.stdout()).toEqual(Buffer.concat([h.ready, frame]));
    expect(h.stderr()).toBe('native stderr\n');
    expect(h.launch).toMatchObject({ binary: h.command, args: ['--lsp', '--stdio'], options: { cwd: h.root, shell: false, windowsHide: true } });
  });
  test('propagates native failures without printing launcher text to stdout', async () => {
    const h = running('failure');
    await h.readyPromise;
    h.input.end();
    expect(await h.done).toBe(23);
    expect(h.stdout()).toEqual(h.ready);
  });
  test.each([['SIGINT', 130], ['SIGTERM', 143]])('forwards %s and waits for the child to stop', async (signal, code) => {
    const h = running('hold');
    await h.readyPromise;
    h.signals.emit(signal);
    expect(await h.done).toBe(code);
    expect(h.child.exitCode !== null || h.child.signalCode !== null).toBe(true);
    expect(h.signals.listenerCount(signal)).toBe(0);
  });
  test('terminates a server that stays alive after client EOF', async () => {
    const h = running('hold');
    await h.readyPromise;
    h.input.end();
    await h.done;
    expect(h.child.exitCode !== null || h.child.signalCode !== null).toBe(true);
    expect(h.stderr()).toMatch(/did not exit after input closed/);
  });
  test.runIf(process.platform !== 'win32')('escalates when a POSIX child ignores SIGTERM', async () => {
    const h = running('ignore');
    await h.readyPromise;
    h.signals.emit('SIGTERM');
    expect(await h.done).toBe(143);
    expect(h.child.signalCode).toBe('SIGKILL');
  });
  test('fails and stops the native child on a truncated client frame', async () => {
    const h = running('hold');
    await h.readyPromise;
    h.input.end('Content-Length: 10\r\n\r\n{}');
    expect(await h.done).toBe(1);
    expect(h.stderr()).toMatch(/middle of a frame/);
    expect(h.stdout()).toEqual(h.ready);
  });
  test('reports native spawn errors on stderr and exits with failure', async () => {
    const { root } = install();
    const input = new PassThrough(), output = new PassThrough(), errors = new PassThrough(), collected = [];
    errors.on('data', bytes => collected.push(bytes));
    const code = await runServer({ root, input, output, errors,
      spawnProcess: (_command, args, options) => spawn(join(root, 'missing native.exe'), args, options) });
    expect(code).toBe(1);
    expect(Buffer.concat(collected).toString()).toMatch(/Cannot launch/);
  });
});
