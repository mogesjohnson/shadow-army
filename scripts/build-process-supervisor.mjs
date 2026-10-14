import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compile only our checked-in OS bridge. A missing compiler fails before any model process starts.
const source = fileURLToPath(new URL('../native/process-supervisor.c', import.meta.url));
if (!['linux', 'darwin'].includes(process.platform)) throw new Error('The native POSIX process bridge is only built on Linux/macOS.');
const digest = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 24);
const cache = join(tmpdir(), `shadow-process-native-${process.getuid()}-${process.platform}-${process.arch}-${digest}`);
await mkdir(cache, { recursive: true, mode: 0o700 });
const directory = await stat(cache);
if (directory.uid !== process.getuid() || (directory.mode & 0o077) !== 0) throw new Error('Native process cache must be private to its owner.');
const binary = join(cache, 'process-supervisor');
async function run(file, args) {
  return await new Promise((done, fail) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', diagnostic = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-65536); });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-65536); });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); fail(new Error(`Native process bridge command timed out: ${basename(file)}`)); }, 30000);
    child.once('error', error => { clearTimeout(timeout); fail(error); });
    child.once('close', code => { clearTimeout(timeout); code === 0 ? done(output) : fail(new Error(diagnostic.trim() || `${basename(file)} exited ${code}`)); });
  });
}
try { await run(binary, ['check']); } catch {
  const temporary = join(cache, `process-supervisor-${process.pid}`);
  try {
    await run(process.env.CC || 'cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', source, '-o', temporary]);
    await chmod(temporary, 0o700); await rename(temporary, binary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw new Error(`Session process containment requires a working C compiler (cc or CC) and the platform SDK: ${error.message}`);
  }
}
const capabilities = JSON.parse(await run(binary, ['check']));
await writeFile(join(cache, 'source.sha256'), digest, { mode: 0o600 });
process.stdout.write(JSON.stringify({ path: binary, capabilities }) + '\n');
