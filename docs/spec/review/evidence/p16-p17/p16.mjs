// P-16 runner for Windows. For each case: start listeners A and B, run
// `claude -p /p1617 --plugin-dir mod` in a fresh folder (model API pointed at a
// dead port, so no model call), then record which listener saw x-probe.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const B = 'C:\\Users\\johns\\AppData\\Local\\Temp\\sa-p1617'
const MOD = join(B, 'mod')
const OUT = join(B, 'p16-win')
mkdirSync(OUT, { recursive: true })
const only = process.argv[2]

function cleanEnv(extra) {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|AI_AGENT)/i.test(k) || /_proxy$/i.test(k)) continue
    env[k] = v
  }
  return { ...env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', ...extra }
}

const cases = [
  { name: 'base' },
  { name: 'shell-HTTP_PROXY', shell: (b) => ({ HTTP_PROXY: `http://127.0.0.1:${b}` }) },
  { name: 'shell-HTTPS_PROXY', shell: (b) => ({ HTTPS_PROXY: `http://127.0.0.1:${b}` }) },
  { name: 'shell-http_proxy-lower', shell: (b) => ({ http_proxy: `http://127.0.0.1:${b}` }) },
  { name: 'settings-HTTP_PROXY', settings: (b) => ({ HTTP_PROXY: `http://127.0.0.1:${b}` }) },
  { name: 'settings-HTTPS_PROXY', settings: (b) => ({ HTTPS_PROXY: `http://127.0.0.1:${b}` }) },
  { name: 'shell-HTTP_PROXY+NO_PROXY', shell: (b) => ({ HTTP_PROXY: `http://127.0.0.1:${b}`, NO_PROXY: '127.0.0.1,localhost' }) },
  { name: 'pipe-socketPath', pipe: true },
]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
let port = 47610
for (const c of cases) {
  if (only && c.name !== only) continue
  const a = port++, b = port++
  const id = randomUUID()
  const dir = join(OUT, c.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const ws = join(dir, 'ws')
  mkdirSync(join(ws, '.claude'), { recursive: true })
  if (c.settings) writeFileSync(join(ws, '.claude', 'settings.json'), JSON.stringify({ env: c.settings(b) }, null, 2))
  const lis = spawn('python', [join(B, 'listen.py'), String(a), String(b), join(dir, 'listen.jsonl')], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise((r) => lis.stdout.once('data', r))
  let pipeName = null, pipeSrv = null
  if (c.pipe) {
    pipeName = `\\\\.\\pipe\\p16-${id.slice(0, 8)}`
    pipeSrv = net.createServer((s) => {
      s.once('data', (d) => {
        writeFileSync(join(dir, 'pipe.txt'), d.toString('latin1'))
        s.end('HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nPIPE')
      })
    }).listen(pipeName)
  }
  const env = cleanEnv({
    P1617_MODE: 'p16', P16_A: String(a), P16_ID: id, P1617_MODLOG: join(dir, 'mod.jsonl'),
    ...(pipeName ? { P16_SOCK: pipeName } : {}),
    ...(c.shell ? c.shell(b) : {}),
  })
  const t0 = Date.now()
  const r = spawnSync('claude', ['-p', '/p1617', '--plugin-dir', MOD, '--debug-file', join(dir, 'debug.log')], {
    cwd: ws, env, input: '', encoding: 'utf8', timeout: 90000, shell: false,
  })
  const ms = Date.now() - t0
  await wait(500)
  lis.kill()
  pipeSrv?.close()
  const lines = existsSync(join(dir, 'listen.jsonl')) ? readFileSync(join(dir, 'listen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
  const probeHits = lines.filter((l) => (l.headers || []).some((h) => h.toLowerCase() === `x-probe: ${id}`))
  const connects = lines.filter((l) => l.listener === 'B' && /^CONNECT /i.test(l.line || '')).map((l) => l.line)
  const res = {
    case: c.name, a, b, ms, exit: r.status, signal: r.signal,
    stdout: (r.stdout || '').trim().slice(0, 400), stderr: (r.stderr || '').trim().slice(0, 300),
    probeHits: probeHits.map((h) => ({ listener: h.listener, line: h.line })),
    bConnects: [...new Set(connects)],
    pipe: existsSync(join(dir, 'pipe.txt')) ? readFileSync(join(dir, 'pipe.txt'), 'utf8').split('\r\n')[0] : null,
    mod: existsSync(join(dir, 'mod.jsonl')) ? readFileSync(join(dir, 'mod.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [],
    apiRequests: existsSync(join(dir, 'debug.log')) ? (readFileSync(join(dir, 'debug.log'), 'utf8').match(/\[API REQUEST\]/g) || []).length : null,
  }
  results.push(res)
  console.log(JSON.stringify(res))
}
writeFileSync(join(OUT, only ? `summary-${only}.json` : 'summary.json'), JSON.stringify(results, null, 2))
