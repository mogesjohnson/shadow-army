// P-17 child (Node). Logs its ids, a heartbeat every 250 ms, and each signal,
// stdin end and stdout error; carries on 60 s after each; stops itself after 90 s.
import { appendFileSync } from 'node:fs'
const log = process.argv[2]
const w = (o) => appendFileSync(log, JSON.stringify({ t: Date.now(), ...o }) + '\n')
let deadline = Date.now() + 90000
const extend = () => { deadline = Math.max(deadline, Date.now() + 60000) }
w({ ev: 'start', pid: process.pid, ppid: process.ppid, platform: process.platform })
for (const s of ['SIGTERM', 'SIGHUP', 'SIGINT', 'SIGBREAK']) {
  try { process.on(s, () => { w({ ev: 'signal', name: s }); extend() }) } catch (e) { w({ ev: 'no-handler', name: s }) }
}
process.stdin.on('end', () => { w({ ev: 'stdin-end' }); extend() })
process.stdin.on('error', (e) => w({ ev: 'stdin-error', code: e.code }))
process.stdin.resume()
process.stdout.on('error', (e) => { w({ ev: 'stdout-error', code: e.code }); extend() })
process.on('exit', (c) => w({ ev: 'exit', code: c }))
setInterval(() => {
  w({ ev: 'hb', ppid: process.ppid })
  if (Date.now() > deadline) { w({ ev: 'exit-self' }); process.exit(0) }
}, 250)
setInterval(() => { try { process.stdout.write('tick\n') } catch (e) { w({ ev: 'stdout-throw', err: String(e) }) } }, 1000)
