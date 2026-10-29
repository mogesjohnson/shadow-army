// P-17 runner for Windows: how Claude Code ends a mod's spawned child.
// Model API pointed at a dead port, so no prompt can reach a model.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const B = 'C:\\Users\\johns\\AppData\\Local\\Temp\\sa-p1617'
const OUT = join(B, 'p17-win')
mkdirSync(OUT, { recursive: true })
const only = process.argv[2]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

function cleanEnv(extra) {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|AI_AGENT)/i.test(k) && !/_proxy$/i.test(k)) env[k] = v
  return { ...env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', ...extra }
}

const userMsg = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n'
const cases = {
  'p-exit': { p: true },
  'stream-close': { steps: async (cc) => { await wait(6000); cc.stdin.end() } },
  'stream-save': { watch: true, steps: async (cc, d) => { await wait(6000); appendFileSync(join(d, 'mod', 'hooks', 'register.js'), '\n// saved\n'); await wait(8000); cc.stdin.end() } },
  'stream-reload-plugins': { steps: async (cc) => { await wait(6000); cc.stdin.write(userMsg('/reload-plugins')); await wait(8000); cc.stdin.end() } },
  'taskkill-soft': { steps: async (cc, d, log) => { await wait(6000); log.taskkill = spawnSync('taskkill', ['/pid', String(cc.pid)], { encoding: 'utf8' }); log.taskkill = (log.taskkill.stdout + log.taskkill.stderr).trim(); await wait(4000); if (cc.exitCode === null) { log.forcedAfter = true; spawnSync('taskkill', ['/f', '/pid', String(cc.pid)]) } } },
  'taskkill-force': { steps: async (cc, d, log) => { await wait(6000); log.taskkill = spawnSync('taskkill', ['/f', '/pid', String(cc.pid)], { encoding: 'utf8' }); log.taskkill = (log.taskkill.stdout + log.taskkill.stderr).trim() } },
}

const results = []
for (const [name, c] of Object.entries(cases)) {
  if (only && only !== name) continue
  const d = join(OUT, name)
  rmSync(d, { recursive: true, force: true })
  mkdirSync(join(d, 'ws'), { recursive: true })
  cpSync(join(B, 'mod'), join(d, 'mod'), { recursive: true })
  const childLog = join(d, 'child.jsonl')
  const env = cleanEnv({
    P1617_MODE: 'p17', P1617_MODLOG: join(d, 'mod.jsonl'),
    P17_CHILD: JSON.stringify([process.execPath, join(B, 'child.mjs'), childLog]),
    ...(c.watch ? { CLAUDE_CODE_PLUGIN_DIR_WATCH: '1' } : {}),
  })
  const args = c.p
    ? ['-p', '/p1617', '--plugin-dir', join(d, 'mod'), '--debug-file', join(d, 'debug.log')]
    : ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--plugin-dir', join(d, 'mod'), '--debug-file', join(d, 'debug.log')]
  const log = { case: name }
  const t0 = Date.now()
  const cc = spawn('claude', args, { cwd: join(d, 'ws'), env, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  cc.stdout.on('data', (b) => { out += b })
  cc.stderr.on('data', (b) => { out += b })
  const exited = new Promise((r) => cc.on('exit', (code, sig) => r({ code, sig, t: Date.now() })))
  if (c.p) cc.stdin.end()
  else await c.steps(cc, d, log)
  const ex = await Promise.race([exited, wait(60000).then(() => null)])
  if (!ex) { log.hung = true; spawnSync('taskkill', ['/f', '/t', '/pid', String(cc.pid)]) }
  await wait(4000)
  const ch = readJsonl(childLog)
  const start = ch.find((e) => e.ev === 'start')
  const childPid = start?.pid
  log.childAliveAfter4s = childPid ? alive(childPid) : null
  if (childPid && log.childAliveAfter4s) spawnSync('taskkill', ['/f', '/pid', String(childPid)])
  const mod = readJsonl(join(d, 'mod.jsonl'))
  const end = mod.find((e) => e.ev === 'session.end')
  const hbs = ch.filter((e) => e.ev === 'hb')
  const lastHb = hbs.at(-1)?.t
  const rel = (t) => (t && ex ? t - ex.t : null)
  Object.assign(log, {
    claudePid: cc.pid, exit: ex && { code: ex.code, sig: ex.sig, msAfterStart: ex.t - t0 },
    childPid, childPpid: start?.ppid,
    sessionEnd: end ? { reason: end.reason, msBeforeClaudeExit: ex ? ex.t - end.t : null } : null,
    spawned: mod.find((e) => e.ev === 'spawned' || e.ev === 'spawn-error'),
    sessionStarts: mod.filter((e) => e.ev === 'session.start').length,
    childEvents: ch.filter((e) => e.ev !== 'hb' && e.ev !== 'start').map((e) => ({ ev: e.ev, name: e.name, code: e.code, msVsClaudeExit: rel(e.t), msVsSessionEnd: end ? e.t - end.t : null })),
    lastHb: { msVsClaudeExit: rel(lastHb), msVsSessionEnd: end && lastHb ? lastHb - end.t : null },
    hbPpidChanged: [...new Set(hbs.map((h) => h.ppid))],
    outTail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 300),
  })
  results.push(log)
  console.log(JSON.stringify(log))
}
writeFileSync(join(OUT, only ? `summary-${only}.json` : 'summary.json'), JSON.stringify(results, null, 2))
