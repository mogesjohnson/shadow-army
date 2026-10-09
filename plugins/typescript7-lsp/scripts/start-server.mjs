import { spawn } from 'node:child_process';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiagnosticsBridge } from './diagnostics-bridge.mjs';

export function projectRoot(env = process.env, cwd = process.cwd()) {
  return resolve(cwd, env.CLAUDE_PROJECT_DIR || cwd);
}

function readPackage(path, description) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${description} at ${path}: ${error.code === 'ENOENT' ? 'not installed; run npm ci in the selected project with optional dependencies enabled' : 'cannot read a valid package.json'}`);
  }
}

export function resolveServer(root, platform = process.platform, arch = process.arch) {
  root = resolve(root);
  const typescript = readPackage(join(root, 'node_modules', 'typescript', 'package.json'), 'Project-local TypeScript');
  if (typescript.name !== 'typescript' || !/^7\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(typescript.version ?? '')) {
    throw new Error(`TypeScript 7 is required in ${root}; found ${typescript.version ?? 'an invalid installation'}. Update that project's TypeScript dependency and run npm ci.`);
  }
  const packageName = `@typescript/typescript-${platform}-${arch}`;
  if (!typescript.optionalDependencies?.[packageName]) {
    throw new Error(`TypeScript ${typescript.version} does not declare a native package for ${platform}-${arch}. Use a supported Node platform and architecture.`);
  }
  const packageDirectory = join(root, 'node_modules', ...packageName.split('/'));
  const native = readPackage(join(packageDirectory, 'package.json'), `Project-local native package ${packageName}`);
  if (native.name !== packageName || native.version !== typescript.version) {
    throw new Error(`Native package ${packageName} must match TypeScript ${typescript.version}; found ${native.version ?? 'an invalid installation'}. Run npm ci in ${root}.`);
  }
  const command = join(packageDirectory, 'lib', platform === 'win32' ? 'tsc.exe' : 'tsc');
  try {
    if (!statSync(command).isFile()) throw new Error('not a file');
    accessSync(command, platform === 'win32' ? constants.F_OK : constants.X_OK);
  } catch {
    throw new Error(`TypeScript's native executable is missing or not executable at ${command}. Run npm ci in ${root} with optional dependencies enabled.`);
  }
  return { root, command, version: typescript.version };
}

export function runServer({ root = projectRoot(), input = process.stdin, output = process.stdout, errors = process.stderr,
  signalSource = process, spawnProcess = spawn, graceMs = 1000 } = {}) {
  const server = resolveServer(root);
  const reportError = message => errors.write(`[typescript7-lsp] ${message}\n`);
  return new Promise(resolveRun => {
    let child;
    try {
      child = spawnProcess(server.command, ['--lsp', '--stdio'], {
        cwd: server.root, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true,
      });
    } catch (error) {
      reportError(`Cannot launch ${server.command}: ${error.message}`);
      resolveRun(1);
      return;
    }
    let stopped = false;
    let finished = false;
    let exitCode;
    let timer;
    const bridge = createDiagnosticsBridge({
      toServer: frame => {
        if (!child.stdin.destroyed && !child.stdin.write(frame)) input.pause();
      },
      toClient: frame => {
        if (!output.destroyed && !output.write(frame)) child.stdout.pause();
      },
      reportError,
    });

    function terminate(signal) {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try { child.kill(signal); } catch (error) { reportError(`Cannot stop the language server: ${error.message}`); }
    }

    function stop(reason, signal) {
      if (stopped || finished) return;
      stopped = true;
      bridge.stop();
      input.pause();
      if (signal) exitCode = 128 + (osConstants.signals[signal] ?? 1);
      else if (reason === 'error') exitCode = 1;
      child.stdin.end();
      if (signal || reason === 'error') terminate(signal ?? 'SIGTERM');
      timer = setTimeout(() => {
        if (reason === 'eof') {
          reportError('Language server did not exit after input closed; terminating it.');
          terminate('SIGTERM');
          timer = setTimeout(() => terminate('SIGKILL'), graceMs);
        } else terminate('SIGKILL');
      }, graceMs);
    }

    function fail(error) {
      reportError(error.message);
      exitCode = 1;
      stop('error');
    }
    const onInput = chunk => { try { bridge.client.push(chunk); } catch (error) { fail(error); } };
    const onNative = chunk => { try { bridge.server.push(chunk); } catch (error) { fail(error); } };
    const onInputEnd = () => { try { bridge.client.end(); stop('eof'); } catch (error) { fail(error); } };
    const onNativeEnd = () => { try { bridge.server.end(); } catch (error) { fail(error); } };
    const onInputError = error => fail(new Error(`Cannot read the LSP client stream: ${error.message}`));
    const onOutputError = error => fail(new Error(`Cannot write to the LSP client stream: ${error.message}`));
    const onInterrupt = () => stop('signal', 'SIGINT');
    const onTerminate = () => stop('signal', 'SIGTERM');
    const onNativeDrain = () => { if (!stopped) input.resume(); };
    const onOutputDrain = () => { if (!finished) child.stdout.resume(); };

    child.on('error', error => fail(new Error(`Cannot launch ${server.command}: ${error.message}`)));
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') fail(new Error(`Cannot write to the native language server: ${error.message}`));
    });
    child.stdout.on('error', error => fail(new Error(`Cannot read the native language server: ${error.message}`)));
    child.stderr.pipe(errors, { end: false });
    child.stdout.on('data', onNative);
    child.stdout.on('end', onNativeEnd);
    child.stdin.on('drain', onNativeDrain);
    input.on('data', onInput);
    input.on('end', onInputEnd);
    input.on('error', onInputError);
    output.on('error', onOutputError);
    output.on('drain', onOutputDrain);
    signalSource.on('SIGINT', onInterrupt);
    signalSource.on('SIGTERM', onTerminate);
    child.on('exit', () => clearTimeout(timer));
    child.on('close', (code, signal) => {
      finished = true;
      bridge.stop();
      clearTimeout(timer);
      input.pause();
      input.off('data', onInput);
      input.off('end', onInputEnd);
      input.off('error', onInputError);
      output.off('error', onOutputError);
      output.off('drain', onOutputDrain);
      signalSource.off('SIGINT', onInterrupt);
      signalSource.off('SIGTERM', onTerminate);
      resolveRun(exitCode ?? (typeof code === 'number' && code >= 0 ? code : 128 + (osConstants.signals[signal] ?? 1)));
    });
    input.resume();
    if (input.readableEnded) onInputEnd();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runServer();
  } catch (error) {
    process.stderr.write(`[typescript7-lsp] ${error.message}\n`);
    process.exitCode = 1;
  }
}
