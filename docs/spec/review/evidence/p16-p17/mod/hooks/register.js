// Probes P-16 and P-17 for the Shadow Army spec review. Throwaway.
// P1617_MODE picks the probe; P1617_MODLOG is where this module logs (JSON lines).
const log = []
let logPath = null
let child = null

// What an earlier load of this module wrote, so a reload appends rather than replaces.
let prefix = null

async function note($, ev) {
  log.push({ t: Date.now(), ...ev })
  if (!logPath) return
  if (prefix === null) {
    prefix = ''
    try { if (await $.fs.exists(logPath)) prefix = String(await $.fs.read(logPath)) } catch {}
  }
  await $.fs.write(logPath, prefix + log.map((x) => JSON.stringify(x)).join('\n') + '\n')
}

async function probeFetch($, where) {
  const a = await $.env.get('P16_A')
  const id = await $.env.get('P16_ID')
  const url = 'http://127.0.0.1:' + a + '/probe?w=' + where
  try {
    const r = await $.http.fetch(url, { headers: { 'x-probe': id } })
    return { url, status: r.status, text: String(r.text).slice(0, 200) }
  } catch (err) {
    return { url, error: String((err && err.message) || err) }
  }
}

async function probeSocket($, where) {
  const sock = await $.env.get('P16_SOCK')
  const id = await $.env.get('P16_ID')
  if (!sock) return null
  try {
    const r = await $.http.fetch('http://localhost/sock?w=' + where, { socketPath: sock, headers: { 'x-probe': id } })
    return { sock, status: r.status, text: String(r.text).slice(0, 200) }
  } catch (err) {
    return { sock, error: String((err && err.message) || err) }
  }
}

async function startChild($) {
  const argv = JSON.parse((await $.env.get('P17_CHILD')) || '[]')
  if (!argv.length) return
  try {
    child = $.process.spawn({ argv })
    await note($, { ev: 'spawned', argv, type: typeof child, keys: child ? Object.keys(child) : [] })
    // The command starts when its output is read, so read it in the background.
    ;(async () => {
      let n = 0
      try {
        for await (const chunk of child) {
          n += 1
          if (n <= 2) await note($, { ev: 'child-out', n, chunk: JSON.stringify(chunk).slice(0, 200) })
        }
        await note($, { ev: 'child-out-end', n, result: JSON.stringify(await child.result).slice(0, 300) })
      } catch (err) {
        await note($, { ev: 'child-out-error', n, err: String((err && err.message) || err) })
      }
    })()
  } catch (err) {
    await note($, { ev: 'spawn-error', err: String((err && err.message) || err) })
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    logPath = await $.env.get('P1617_MODLOG')
    const mode = await $.env.get('P1617_MODE')
    await note($, { ev: 'session.start', mode })
    if (mode === 'p16') {
      await note($, { ev: 'fetch', r: await probeFetch($, 'start') })
      const s = await probeSocket($, 'start')
      if (s) await note($, { ev: 'socket', r: s })
    }
    if (mode === 'p17') await startChild($)
    try {
      await $.command.register({ name: 'p1617', description: 'probe' })
    } catch (err) {
      await note($, { ev: 'register-error', err: String((err && err.message) || err) })
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await note($, { ev: 'session.end', reason: e.reason })
    return next(e)
  })

  on('command.run', { command: 'p1617' }, async ($) => {
    const r = await probeFetch($, 'command')
    await note($, { ev: 'fetch', r })
    return { text: 'p1617 ' + JSON.stringify(r) }
  })
}
