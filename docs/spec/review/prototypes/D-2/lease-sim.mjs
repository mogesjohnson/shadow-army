#!/usr/bin/env node
/*
 * D-2: session-lease timing under real-world conditions.
 * Discrete-event simulation with a fake clock. Node built-ins only. No model, no vendor CLI, no network.
 *
 * RUN (a full run takes a few seconds)
 *   node lease-sim.mjs              full run: prints every table and writes results.txt beside this file
 *   node lease-sim.mjs --quick      fewer trials, same code paths; prints only
 *   node lease-sim.mjs --selftest   only the engine self-checks (exit code 1 if one fails)
 *   node lease-sim.mjs --no-write   print only, do not write results.txt
 *   node lease-sim.mjs --seed 123   other random draws (default 20261014). The same seed always prints the same text.
 *
 * WHAT IS SIMULATED
 *   mod  The plugin inside Claude Code. A setInterval-style timer sends a renewal every R (the next one is due R after
 *        the previous callback ran, as Node does). A renewal reaches the post office (PO) after a delivery delay,
 *        uniform 1..50 ms.
 *   PO   The post office. It owns the lease. When the lease lapses it closes every soldier session and exits
 *        ("expired"); later renewals are refused.
 *   Timing A: R = 10 s, ttl = 30 s.      Timing B: R = 5 s, ttl = 20 s.
 *
 *   Clock models for the PO's expiry check
 *     K1  Naive, sleep counted. Mirrors Codex's draft src/v2/lease.ts: a one-shot timer armed for the deadline;
 *         "now >= deadline" expires, in the timer AND at the top of renew() (assertSession -> assertActive).
 *         The OS monotonic clock keeps counting while the computer sleeps; timers due during sleep fire on wake.
 *     K2  The same rule, but the OS clock stops while the computer sleeps, so timers pause with it.
 *     Where each applies (read in Microsoft's QPC documentation and libuv's v1.x source, 2026-10-14; not measured on
 *     hardware): Windows (libuv uses QueryPerformanceCounter, documented to include time asleep) and macOS (libuv uses
 *     mach_continuous_time) are K1; Linux (libuv uses CLOCK_MONOTONIC, which stops in suspend) is K2.
 *     K3  Suspend-aware. The PO checks on a 1 s tick. A tick that arrives more than 3 ticks after the previous one
 *         moves the deadline to now + ttl instead of expiring. Only the tick decides; renew() just records the time.
 *   Variants (each isolates one design choice; shown after the main tables)
 *     K1L K1 with a lenient renew(): a renewal never expires the lease, only the timer does.
 *     K3S K3 plus Codex's strict renew(): a renewal that arrives past the deadline expires the lease before the
 *         tick has seen the gap.
 *     K3N K3 on a clock that stops during sleep (the gap never shows, so it behaves as K2).
 *     K0  Control only: a lease that reads the wall clock (Date.now()). It proves that scenario 6 would notice a
 *         wall-clock reader. Not a candidate.
 *
 * TIME. The fake clock counts integer microseconds; nothing really sleeps. All randomness is seeded, so a run is
 * reproducible.
 *
 * ORDER OF DELIVERY. An event that comes due while its process cannot run waits and is delivered when it resumes.
 *   After a computer wake the two processes resume together: "po-first" lets the PO's overdue timers run 100 ms
 *   before the mod's, "mod-first" the reverse. A renewal that the mod sends in its 100 ms head start reaches the PO
 *   (1..50 ms) before the PO's own overdue timer runs. After a stall of one process, the order between its overdue
 *   timers and the I/O queued meanwhile is "timers-first" or "io-first".
 *   "First renewal after wake delayed by c" (CPU contention) adds c to the delivery of the first renewal sent
 *   after the wake.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- units and options
const MS = 1000;
const SEC = 1_000_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const WAKE_LAG = 100 * MS;

const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const NO_WRITE = argv.includes('--no-write');
const SELFTEST_ONLY = argv.includes('--selftest');
const seedAt = argv.indexOf('--seed');
const BASE_SEED = seedAt >= 0 ? Number(argv[seedAt + 1]) >>> 0 : 20261014;

const N_TRIALS = QUICK ? 200 : 1000;     // random phases per stall / death case
const N_SEEDS_8H = QUICK ? 3 : 20;       // 8 h runs per timing and model
const N_PHASES_SLEEP = QUICK ? 4 : 12;   // random sleep-start phases per sleep case
const N_THRESH = QUICK ? 150 : 600;      // trials per bisection in the threshold table

const TIMINGS = {
  A: { R: 10 * SEC, ttl: 30 * SEC, label: 'A (renew 10 s, expire 30 s)' },
  B: { R: 5 * SEC, ttl: 20 * SEC, label: 'B (renew 5 s, expire 20 s)' },
};
const TK = ['A', 'B'];
const MODELS = {
  K1: { kind: 'naive', strict: true, counts: true, clock: 'mono', label: 'K1 naive, sleep counted (as lease.ts)' },
  K2: { kind: 'naive', strict: true, counts: false, clock: 'mono', label: 'K2 monotonic, sleep not counted' },
  K3: { kind: 'tick', strict: false, counts: true, clock: 'mono', label: 'K3 suspend-aware, the tick decides' },
  K1L: { kind: 'naive', strict: false, counts: true, clock: 'mono', label: 'K1 with a lenient renew' },
  K3S: { kind: 'tick', strict: true, counts: true, clock: 'mono', label: 'K3 with a strict renew' },
  K3N: { kind: 'tick', strict: false, counts: false, clock: 'mono', label: 'K3 on a clock that stops in sleep' },
  K0: { kind: 'naive', strict: true, counts: true, clock: 'wall', label: 'control: wall-clock lease' },
};
const MAIN = ['K1', 'K2', 'K3'];

// ---------------------------------------------------------------- seeded randomness
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(seed) { this.f = mulberry32(seed >>> 0); }
  next() { return this.f(); }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); } // inclusive
}
function seedOf(...parts) { // FNV-1a over the parts: independent, reproducible streams per (scenario, case, trial)
  let h = 2166136261;
  for (const ch of [BASE_SEED, ...parts].join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Trial i of n starts at a random point inside the i-th n-th of the span, so phases cover the span evenly.
function phaseOffset(i, n, span, rng) { return Math.min(span - 1, Math.floor(((i + rng.next()) / n) * span)); }

// ---------------------------------------------------------------- discrete-event engine
class Heap {
  constructor() { this.a = []; }
  static before(x, y) {
    if (x.time !== y.time) return x.time < y.time;
    if (x.rank !== y.rank) return x.rank < y.rank;
    if (x.tie !== y.tie) return x.tie < y.tie;
    return x.seq < y.seq;
  }
  push(e) {
    const a = this.a;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!Heap.before(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      const n = a.length;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < n && Heap.before(a[l], a[m])) m = l;
        if (r < n && Heap.before(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  drain() { const x = this.a; this.a = []; return x; }
}

class World {
  constructor({ counts, resumeOrder = 'timers-first' }) {
    this.T = 0;               // true elapsed time, microseconds (the fake clock)
    this.sleptTotal = 0;      // microseconds the computer has slept so far; K2's clock does not advance across them
    this.wallOffset = 0;      // wall clock = T + wallOffset (NTP step, manual change)
    this.wallReads = 0;       // how many times anything read the wall clock
    this.counts = counts;     // does the OS monotonic clock keep counting while the computer sleeps?
    this.resumeOrder = resumeOrder;
    this.heap = new Heap();
    this.seq = 0;
    // A process that is stalled or frozen cannot run anything before block.until (timers: until + timerLag).
    this.block = { mod: { until: 0, timerLag: 0 }, po: { until: 0, timerLag: 0 } };
  }
  wall() { this.wallReads++; return this.T + this.wallOffset; }
  schedule(time, owner, kind, fn, rank = 0) {
    const ev = { time, owner, kind, fn, cancelled: false, rank, tie: time, due: undefined, seq: this.seq++ };
    this.heap.push(ev);
    return ev;
  }
  script(time, fn) { return this.schedule(time, null, 'script', fn, -1); } // the scenario's own events; never blocked
  cancel(ev) { if (ev) ev.cancelled = true; }
  deferRank(kind) { return (kind === 'timer') === (this.resumeOrder === 'timers-first') ? 0 : 1; }

  stall(who, len) { this.block[who] = { until: this.T + len, timerLag: 0 }; } // one process cannot run for len
  freezeBoth(len, order) { // both processes cannot run for len; they resume in the given order
    const until = this.T + len;
    this.block.mod = { until, timerLag: order === 'mod-first' ? 0 : WAKE_LAG };
    this.block.po = { until, timerLag: order === 'po-first' ? 0 : WAKE_LAG };
  }
  // The computer sleeps for len with both processes frozen.
  sleep(len, order) {
    this.sleptTotal += len;
    if (this.counts) { // the clock keeps counting: everything due meanwhile is overdue on wake
      this.freezeBoth(len, order);
    } else { // the clock stops: nothing comes due, every pending event moves by len
      for (const ev of this.heap.drain()) {
        if (ev.cancelled) continue;
        if (ev.owner) { ev.time += len; ev.tie += len; if (ev.due !== undefined) ev.due += len; }
        this.heap.push(ev);
      }
    }
  }
  run(endT) {
    const h = this.heap;
    for (;;) {
      const ev = h.peek();
      if (!ev || ev.time > endT) break;
      h.pop();
      if (ev.cancelled) continue;
      if (ev.owner) {
        const b = this.block[ev.owner];
        const resume = b.until + (ev.kind === 'timer' ? b.timerLag : 0);
        if (ev.time < resume) { // cannot run yet: wait, keeping the original due time for in-order delivery
          if (ev.due === undefined) ev.due = ev.time;
          ev.time = resume;
          ev.rank = this.deferRank(ev.kind);
          ev.tie = ev.due;
          ev.seq = this.seq++;
          h.push(ev);
          continue;
        }
      }
      this.T = ev.time;
      ev.fn();
    }
    if (this.T < endT) this.T = endT;
  }
}

// ---------------------------------------------------------------- the post office's lease
function makePO(world, model, ttl, tickPhase) {
  const clock = model.clock === 'wall' ? () => world.wall()
    : model.counts ? () => world.T
      : () => world.T - world.sleptTotal;
  const po = { expiredAt: null, expiredWhy: '', renewals: 0, rejected: 0, maxSilence: 0, gapsDetected: 0, renew: null };
  let lastApplied = clock();
  let ended = false;
  const end = (why, timer) => { ended = true; world.cancel(timer); po.expiredAt = world.T; po.expiredWhy = why; };
  const apply = (now) => {
    const silence = now - lastApplied;
    if (silence > po.maxSilence) po.maxSilence = silence;
    lastApplied = now;
    po.renewals++;
  };

  if (model.kind === 'naive') { // Codex's lease.ts: one timer armed for the deadline, re-armed on every renewal
    let deadline = clock() + ttl;
    let timer = null;
    const arm = () => {
      world.cancel(timer);
      timer = world.schedule(world.T + Math.max(1 * MS, deadline - clock()), 'po', 'timer', () => {
        if (ended) return;
        if (clock() < deadline) { arm(); return; }
        end('timer fired at or past the deadline', timer);
      });
    };
    po.renew = () => {
      if (ended) { po.rejected++; return; }
      const now = clock();
      if (model.strict && now >= deadline) { end('renewal arrived at or past the deadline', timer); return; }
      apply(now);
      deadline = now + ttl;
      arm();
    };
    arm();
  } else { // K3: a 1 s tick decides; a tick more than 3 ticks late is treated as time the PO could not hear a renewal
    const TICK = 1 * SEC, GAP = 3 * TICK;
    let lastTick = clock(), lastRenewal = clock(), timer = null;
    const schedule = (delay) => { timer = world.schedule(world.T + delay, 'po', 'timer', onTick); };
    const onTick = () => {
      if (ended) return;
      const now = clock();
      const gap = now - lastTick;
      lastTick = now;
      if (gap > GAP) { lastRenewal = now; po.gapsDetected++; } // deadline := now + ttl
      else if (now - lastRenewal >= ttl) { end('tick: no renewal for ttl', timer); return; }
      schedule(TICK);
    };
    po.renew = () => {
      if (ended) { po.rejected++; return; }
      const now = clock();
      if (model.strict && now - lastRenewal >= ttl) { end('renewal arrived at or past the deadline', timer); return; }
      apply(now);
      lastRenewal = now;
    };
    po.tickPhase = tickPhase;   // the PO starts at an arbitrary moment relative to the mod's timers
    schedule(tickPhase);        // first tick after tickPhase, then every second
  }
  return po;
}

// ---------------------------------------------------------------- the mod (renews over loopback HTTP)
function makeMod(world, po, R, rng) {
  const mod = { alive: true, extraOnce: 0, dropNext: 0, sent: 0, trace: false, arrivals: [] };
  let timer = null;
  const fire = () => {
    if (!mod.alive) return;
    mod.sent++;
    if (mod.dropNext > 0) {
      mod.dropNext--; // this renewal is lost (the request fails and is not retried)
    } else {
      const arrival = world.T + mod.extraOnce + rng.int(1 * MS, 50 * MS);
      mod.extraOnce = 0;
      if (mod.trace) mod.arrivals.push(arrival);
      world.schedule(arrival, 'po', 'io', () => po.renew());
    }
    timer = world.schedule(world.T + R, 'mod', 'timer', fire); // setInterval: the next one is R after this callback ran
  };
  mod.start = () => { timer = world.schedule(world.T + R, 'mod', 'timer', fire); };
  mod.die = () => { mod.alive = false; world.cancel(timer); };
  return mod;
}

function build(tk, mk, seed, { resumeOrder = 'timers-first', trace = false } = {}) {
  const { R, ttl } = TIMINGS[tk], model = MODELS[mk];
  const world = new World({ counts: model.counts, resumeOrder });
  const rng = new Rng(seed);
  const tickPhase = new Rng(seed ^ 0x5bd1e995).int(1, 1 * SEC); // separate stream: K3's phase never changes anyone's delays
  const po = makePO(world, model, ttl, tickPhase);
  const mod = makeMod(world, po, R, rng);
  mod.trace = trace;
  mod.start();
  return { tk, mk, world, rng, po, mod, R, ttl, s0: 0, W: 0 };
}

// ---------------------------------------------------------------- one-case runners (shared by scenarios and checks)
function runStall(who, tk, mk, len, seed, i, n, { order = 'timers-first', trace = false } = {}) {
  const x = build(tk, mk, seed, { resumeOrder: order, trace });
  x.s0 = 60 * SEC + phaseOffset(i, n, x.R, x.rng);
  x.world.script(x.s0, () => x.world.stall(who, len));
  x.world.run(x.s0 + len + 3 * x.ttl);
  return x;
}
function runFreezeBoth(tk, mk, len, order, seed, i, n) { // ctrl+z on a PO that shares the terminal's process group
  const x = build(tk, mk, seed);
  x.s0 = 60 * SEC + phaseOffset(i, n, x.R, x.rng);
  x.world.script(x.s0, () => x.world.freezeBoth(len, order));
  x.world.run(x.s0 + len + 3 * x.ttl);
  return x;
}
function runSleep(tk, mk, Z, order, c, seed, i, n, { trace = false } = {}) {
  const x = build(tk, mk, seed, { trace });
  x.s0 = 60 * SEC + phaseOffset(i, n, x.R, x.rng);
  x.W = x.s0 + Z;
  x.world.script(x.s0, () => x.world.sleep(Z, order));
  x.world.script(x.W, () => { x.mod.extraOnce = c; });
  x.world.run(x.W + 5 * MIN);
  return x;
}
function runWakeStall(tk, mk, Z, order, c, seed, i, n) { // after the wake Claude Code cannot run for c (a slow start under CPU contention)
  const x = build(tk, mk, seed);
  x.s0 = 60 * SEC + phaseOffset(i, n, x.R, x.rng);
  x.W = x.s0 + Z;
  x.world.script(x.s0, () => x.world.sleep(Z, order));
  x.world.script(x.W, () => {
    const b = x.world.block.mod;
    x.world.block.mod = { until: Math.max(b.until, x.world.T) + c, timerLag: b.timerLag };
  });
  x.world.run(x.W + c + 5 * MIN);
  return x;
}
function runDeath(tk, mk, seed, i, n, { trace = false } = {}) {
  const x = build(tk, mk, seed, { trace });
  x.s0 = 60 * SEC + phaseOffset(i, n, 4 * x.R, x.rng);
  x.world.script(x.s0, () => x.mod.die());
  x.end = x.s0 + 3 * x.ttl;
  x.world.run(x.end);
  return x;
}
function runLoss(tk, mk, k, seed, i, n, { trace = false } = {}) {
  const x = build(tk, mk, seed, { trace });
  x.s0 = 60 * SEC + phaseOffset(i, n, x.R, x.rng);
  x.world.script(x.s0, () => { x.mod.dropNext = k; });
  x.end = x.s0 + (k + 3) * x.R + 3 * x.ttl;
  x.world.run(x.end);
  return x;
}

// ---------------------------------------------------------------- scenarios
const lapsed = (x) => x.po.expiredAt !== null;
function stats(arr) {
  if (!arr.length) return { n: 0, min: NaN, mean: NaN, max: NaN };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of arr) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { n: arr.length, min, mean: sum / arr.length, max };
}

function scenario1() { // eight hours of normal running
  const rows = [];
  for (const tk of TK) for (const mk of MAIN) {
    let falseExpiries = 0, renewals = 0, longest = 0;
    for (let i = 0; i < N_SEEDS_8H; i++) {
      const x = build(tk, mk, seedOf('s1', tk, i));
      x.world.run(8 * HOUR);
      if (lapsed(x)) falseExpiries++;
      renewals += x.po.renewals;
      longest = Math.max(longest, x.po.maxSilence);
    }
    rows.push({ tk, mk, runs: N_SEEDS_8H, falseExpiries, perRun: renewals / N_SEEDS_8H, perHour: renewals / N_SEEDS_8H / 8, longest, margin: TIMINGS[tk].ttl - longest });
  }
  return rows;
}

const SLEEPS = [['1 min', 1 * MIN], ['10 min', 10 * MIN], ['8 h', 8 * HOUR]];
const ORDERS = ['po-first', 'mod-first'];
const DELAYS = [0, 1 * SEC, 3 * SEC];
function scenario2() { // the computer sleeps with both processes frozen
  const cells = new Map();
  for (const tk of TK) for (const mk of ['K1', 'K2', 'K3', 'K1L', 'K3S', 'K3N']) {
    for (const [sname, Z] of SLEEPS) for (const order of ORDERS) for (const c of DELAYS) {
      let lapses = 0;
      for (let p = 0; p < N_PHASES_SLEEP; p++) {
        const x = runSleep(tk, mk, Z, order, c, seedOf('s2', tk, sname, p), p, N_PHASES_SLEEP);
        if (lapsed(x)) lapses++;
      }
      cells.set(`${tk}|${mk}|${sname}|${order}|${c}`, { lapses, n: N_PHASES_SLEEP });
    }
  }
  return cells;
}
function s2Total(cells, tk, mk, filter = () => true) {
  let lapses = 0, n = 0;
  for (const [key, v] of cells) {
    const [ktk, kmk, sname, order, c] = key.split('|');
    if (ktk === tk && kmk === mk && filter(sname, order, Number(c))) { lapses += v.lapses; n += v.n; }
  }
  return { lapses, n };
}

const CC_STALLS = [5, 15, 25, 35, 60].map((s) => s * SEC);
function scenario3() { // Claude Code's event loop stalls while the post office runs
  const res = new Map();
  for (const tk of TK) for (const mk of MAIN) for (const len of CC_STALLS) {
    let n = 0;
    for (let i = 0; i < N_TRIALS; i++) if (lapsed(runStall('mod', tk, mk, len, seedOf('s3', tk, len, i), i, N_TRIALS))) n++;
    res.set(`${tk}|${mk}|${len}`, n);
  }
  return res;
}

const PO_STALLS = [5, 15, 25, 35].map((s) => s * SEC);
const RESUME = ['timers-first', 'io-first'];
function scenario4() { // the post office's event loop stalls while Claude Code runs
  const res = new Map();
  for (const tk of TK) for (const mk of ['K1', 'K2', 'K3', 'K1L', 'K3S']) for (const order of RESUME) for (const len of PO_STALLS) {
    let n = 0;
    for (let i = 0; i < N_TRIALS; i++) {
      if (lapsed(runStall('po', tk, mk, len, seedOf('s4', tk, len, i), i, N_TRIALS, { order }))) n++;
    }
    res.set(`${tk}|${mk}|${order}|${len}`, n);
  }
  return res;
}

function scenario5() { // Claude Code dies and the parent watch has failed: the lease is the only signal
  const res = new Map();
  for (const tk of TK) for (const mk of MAIN) {
    const lat = [];
    let missed = 0;
    for (let i = 0; i < N_TRIALS; i++) {
      const x = runDeath(tk, mk, seedOf('s5', tk, i), i, N_TRIALS);
      if (lapsed(x)) lat.push(x.po.expiredAt - x.s0); else missed++;
    }
    res.set(`${tk}|${mk}`, { ...stats(lat), missed });
  }
  return res;
}

function scenario6() { // the wall clock jumps by one hour
  const rows = [];
  for (const tk of TK) for (const mk of ['K1', 'K2', 'K3', 'K0']) for (const [jname, delta] of [['+1 h', HOUR], ['-1 h', -HOUR]]) {
    const a = build(tk, mk, seedOf('s6a', tk)); // (a) the Monarch stays alive for 2 h; the clock jumps once
    const jumpAt = 50 * MIN + a.rng.int(0, 20 * MIN);
    a.world.script(jumpAt, () => { a.world.wallOffset += delta; });
    a.world.run(2 * HOUR);
    const latency = (jump) => { // (b) the Monarch dies 3 s after a renewal; the clock steps 1 s before the death
      const x = build(tk, mk, seedOf('s6b', tk));
      const td = Math.floor((50 * MIN + x.rng.int(0, 20 * MIN)) / x.R) * x.R + 3 * SEC;
      if (jump) x.world.script(td - 1 * SEC, () => { x.world.wallOffset += delta; });
      x.world.script(td, () => x.mod.die());
      x.world.run(td + 3 * HOUR);
      return { lat: lapsed(x) ? x.po.expiredAt - td : null, reads: x.world.wallReads };
    };
    const base = latency(false), jumped = latency(true);
    rows.push({ tk, mk, jname, falseExpiry: lapsed(a), reads: a.world.wallReads, base: base.lat, jumped: jumped.lat });
  }
  return rows;
}

function scenario7() { // Claude Code stopped with ctrl+z for two minutes
  const res = new Map();
  for (const tk of TK) for (const mk of MAIN) {
    const lat = [];
    for (let i = 0; i < N_TRIALS; i++) {
      const x = runStall('mod', tk, mk, 2 * MIN, seedOf('s7', tk, i), i, N_TRIALS);
      if (lapsed(x)) lat.push(x.po.expiredAt - x.s0);
    }
    res.set(`${tk}|${mk}`, { n: lat.length, N: N_TRIALS, lat: stats(lat) });
  }
  // 7b: the post office shares the terminal's process group, so ctrl+z stops it too and both resume together
  const both = new Map();
  for (const tk of TK) for (const mk of ['K1', 'K2', 'K3', 'K1L', 'K3S']) for (const order of ORDERS) {
    let n = 0;
    for (let i = 0; i < N_TRIALS; i++) if (lapsed(runFreezeBoth(tk, mk, 2 * MIN, order, seedOf('s7b', tk, i), i, N_TRIALS))) n++;
    both.set(`${tk}|${mk}|${order}`, n);
  }
  return { mod: res, both };
}

// ---------------------------------------------------------------- bonus: thresholds found by bisection
function bisectLapse(lapses, hi) { // smallest length (to 1 ms) that lapses; Infinity if even hi does not
  if (!lapses(hi)) return Infinity;
  let lo = 0;
  while (hi - lo > MS) { const mid = lo + Math.floor((hi - lo) / 2); if (lapses(mid)) hi = mid; else lo = mid; }
  return hi;
}
function thresholdRange(tk, makeLapses, hi) { // over N_THRESH random phases: [first length that ever lapses, first length that always lapses]
  const per = [];
  for (let i = 0; i < N_THRESH; i++) per.push(bisectLapse(makeLapses(i), hi));
  return { min: Math.min(...per), max: Math.max(...per) };
}
function thresholds() {
  const out = {};
  for (const tk of TK) {
    const { R, ttl } = TIMINGS[tk];
    const hi = ttl + 2 * R;
    out[tk] = {
      ccStall: thresholdRange(tk, (i) => (len) => lapsed(runStall('mod', tk, 'K1', len, seedOf('th-cc', tk, i), i, N_THRESH)), hi),
      poStallK1: thresholdRange(tk, (i) => (len) => lapsed(runStall('po', tk, 'K1', len, seedOf('th-po', tk, i), i, N_THRESH)), hi),
      poStallK3: thresholdRange(tk, (i) => (len) => lapsed(runStall('po', tk, 'K3', len, seedOf('th-po3', tk, i), i, N_THRESH)), 10 * MIN),
      sleepK1: thresholdRange(tk, (i) => (Z) => lapsed(runSleep(tk, 'K1', Z, 'po-first', 0, seedOf('th-sl', tk, i), i, N_THRESH)), hi),
      sleepK2: thresholdRange(tk, (i) => (Z) => lapsed(runSleep(tk, 'K2', Z, 'po-first', 0, seedOf('th-sl2', tk, i), i, N_THRESH)), 8 * HOUR),
      sleepK3: thresholdRange(tk, (i) => (Z) => lapsed(runSleep(tk, 'K3', Z, 'po-first', 0, seedOf('th-sl3', tk, i), i, N_THRESH)), 8 * HOUR),
      wakeStallK3: thresholdRange(tk, (i) => (c) => lapsed(runWakeStall(tk, 'K3', 10 * MIN, 'po-first', c, seedOf('th-ws', tk, i), i, N_THRESH)), 2 * MIN),
      wakeStallK2: thresholdRange(tk, (i) => (c) => lapsed(runWakeStall(tk, 'K2', 10 * MIN, 'po-first', c, seedOf('th-ws2', tk, i), i, N_THRESH)), 2 * MIN),
    };
    out[tk].lost = [];
    for (let k = 0; k <= 5; k++) {
      let n = 0;
      for (let i = 0; i < N_TRIALS; i++) if (lapsed(runLoss(tk, 'K1', k, seedOf('th-loss', tk, k, i), i, N_TRIALS))) n++;
      out[tk].lost.push(n);
    }
  }
  return out;
}

// ---------------------------------------------------------------- self-checks: the engine against closed-form predictions
// The naive lease with the default (strict) rule lapses exactly when two consecutive renewals reach it at least ttl apart
// (the lease's creation at t=0 counts as the first), provided nothing froze the post office and the computer did not sleep.
function predictedNaive(x, endT) {
  const arr = [0, ...x.mod.arrivals];
  for (let k = 0; k < arr.length; k++) {
    const next = k + 1 < arr.length ? arr[k + 1] : endT;
    if (next - arr[k] >= x.ttl) return arr[k] + x.ttl;
  }
  return null;
}
// The tick lease lapses at the first tick at or after arr[k] + ttl, if that tick comes before the next renewal.
// Ticks fall at tickPhase + j seconds. Returns undefined when a tick and a renewal tie to the microsecond (either order is legal).
function predictedTick(x, endT) {
  const arr = [0, ...x.mod.arrivals];
  const ph = x.po.tickPhase;
  for (let k = 0; k < arr.length; k++) {
    const next = k + 1 < arr.length ? arr[k + 1] : endT + 1;
    const tick = ph + Math.ceil((arr[k] + x.ttl - ph) / SEC) * SEC;
    if (tick === next) return undefined;
    if (tick < next) return tick <= endT ? tick : null;
  }
  return null;
}
function runSelfChecks() {
  const checks = [];
  const check = (name, bad, total, note = '') => checks.push({ name, ok: bad === 0, detail: `${total} runs, ${bad} mismatches${note ? '; ' + note : ''}` });

  { // C1 same seed, same run
    const sig = () => { const x = build('A', 'K3', 777); x.world.run(2 * HOUR); return JSON.stringify([x.po.renewals, x.po.maxSilence, x.po.expiredAt]); };
    check('C1 the same seed gives the same run', sig() === sig() ? 0 : 1, 2);
  }
  { // C2 naive lease: Claude Code stalls, lost renewals, and death, against the gap rule
    let bad = 0, n = 0;
    const lens = [5, 14, 15, 16, 19, 20, 21, 25, 29, 30, 31, 35, 60].map((s) => s * SEC);
    for (const tk of TK) for (const mk of ['K1', 'K2']) {
      for (const len of lens) for (let i = 0; i < 40; i++) {
        const x = runStall('mod', tk, mk, len, seedOf('c2', tk, len, i), i, 40, { trace: true });
        n++; if (predictedNaive(x, x.s0 + len + 3 * x.ttl) !== x.po.expiredAt) bad++;
      }
      for (let k = 0; k <= 5; k++) for (let i = 0; i < 40; i++) {
        const x = runLoss(tk, mk, k, seedOf('c2l', tk, k, i), i, 40, { trace: true });
        n++; if (predictedNaive(x, x.end) !== x.po.expiredAt) bad++;
      }
      for (let i = 0; i < 200; i++) {
        const x = runDeath(tk, mk, seedOf('c2d', tk, i), i, 200, { trace: true });
        n++; if (predictedNaive(x, x.end) !== x.po.expiredAt) bad++;
      }
    }
    check('C2 naive lease (K1, K2) lapses exactly when two renewals reach it >= ttl apart', bad, n, 'stalls, lost renewals, deaths');
  }
  { // C3 the tick lease against the tick rule
    let bad = 0, n = 0, ties = 0;
    const lens = [5, 15, 25, 35, 60].map((s) => s * SEC);
    for (const tk of TK) {
      for (const len of lens) for (let i = 0; i < 100; i++) {
        const x = runStall('mod', tk, 'K3', len, seedOf('c3', tk, len, i), i, 100, { trace: true });
        const p = predictedTick(x, x.s0 + len + 3 * x.ttl);
        if (p === undefined) { ties++; continue; }
        n++; if (p !== x.po.expiredAt) bad++;
      }
      for (let i = 0; i < 200; i++) {
        const x = runDeath(tk, 'K3', seedOf('c3d', tk, i), i, 200, { trace: true });
        const p = predictedTick(x, x.end);
        if (p === undefined) { ties++; continue; }
        n++; if (p !== x.po.expiredAt) bad++;
      }
    }
    check('C3 tick lease (K3) lapses at the first tick >= last renewal + ttl', bad, n, `${ties} exact ties skipped`);
  }
  { // C4 a stalled post office: naive lease lapses iff the stall ends >= ttl after the last renewal it heard; K3 never does
    let bad = 0, n = 0, bad3 = 0, n3 = 0;
    const lens = [5, 10, 14, 15, 16, 19, 20, 21, 25, 29, 30, 31, 35].map((s) => s * SEC);
    for (const tk of TK) for (const order of RESUME) for (const len of lens) for (let i = 0; i < 40; i++) {
      const x = runStall('po', tk, 'K1', len, seedOf('c4', tk, len, i), i, 40, { order, trace: true });
      const before = Math.max(0, ...x.mod.arrivals.filter((a) => a < x.s0));
      const want = x.s0 + len - before >= x.ttl;
      n++; if (want !== lapsed(x) || (want && x.po.expiredAt !== x.s0 + len)) bad++;
      const y = runStall('po', tk, 'K3', len, seedOf('c4', tk, len, i), i, 40, { order });
      n3++; if (lapsed(y)) bad3++;
    }
    check('C4a naive lease and a stalled post office: closed form, both resume orders', bad, n);
    check('C4b K3 never lapses over a post-office stall of 5..35 s', bad3, n3);
  }
  { // C5 K1 with Codex's strict renew and a computer sleep: lapses iff the first renewal after wake is >= ttl after the last before
    let bad = 0, n = 0;
    const Zs = [3, 5, 12, 17, 19, 21, 24, 29, 31, 35, 90].map((s) => s * SEC);
    for (const tk of TK) for (const order of ORDERS) for (const c of DELAYS) for (const Z of Zs) for (let i = 0; i < 30; i++) {
      const x = runSleep(tk, 'K1', Z, order, c, seedOf('c5', tk, Z, i), i, 30, { trace: true });
      const before = Math.max(0, ...x.mod.arrivals.filter((a) => a < x.s0));
      const after = Math.min(...x.mod.arrivals.filter((a) => a >= x.s0).map((a) => Math.max(a, x.W)));
      n++; if ((after - before >= x.ttl) !== lapsed(x)) bad++;
    }
    check('C5 K1 (strict) and a computer sleep: closed form, both orders, delays 0/1/3 s', bad, n);
  }
  { // C6 K3 survives every sleep, K3N behaves as K2, and the sleep scenario's cells hold
    let bad = 0, n = 0, badN = 0;
    for (const tk of TK) for (const order of ORDERS) for (const c of DELAYS) for (const Z of [4, 20, 60, 600, 8 * 3600].map((s) => s * SEC)) for (let i = 0; i < 20; i++) {
      const sd = seedOf('c6', tk, Z, i);
      n++;
      if (lapsed(runSleep(tk, 'K3', Z, order, c, sd, i, 20))) bad++;
      if (lapsed(runSleep(tk, 'K3N', Z, order, c, sd, i, 20)) !== lapsed(runSleep(tk, 'K2', Z, order, c, sd, i, 20))) badN++;
    }
    check('C6a K3 never lapses over a computer sleep of 4 s .. 8 h', bad, n);
    check('C6b K3 on a clock that stops in sleep (K3N) matches K2', badN, n);
  }
  { // C7 the wall-clock control reacts to a clock step, and the three real models never read the wall clock
    const jumpRun = (mk, delta, dies) => { // renewals go out at multiples of 10 s; the step comes 2 s after one, the death 3 s after
      const x = build('A', mk, 4242);
      x.world.script(30 * MIN + 2 * SEC, () => { x.world.wallOffset += delta; });
      if (dies) x.world.script(30 * MIN + 3 * SEC, () => x.mod.die());
      x.world.run(5 * HOUR);
      return x;
    };
    const failed = [];
    const fwd = jumpRun('K0', HOUR, false);                                          // forward step: the control lapses at once
    if (!lapsed(fwd)) failed.push('K0 +1h did not lapse');
    const back = jumpRun('K0', -HOUR, true);                                         // backward step: cleanup is held back about an hour
    if (!lapsed(back)) failed.push('K0 -1h dead Monarch never cleaned up');
    else if (back.po.expiredAt - (30 * MIN + 3 * SEC) < 50 * MIN) failed.push(`K0 -1h cleanup after only ${f2(back.po.expiredAt - (30 * MIN + 3 * SEC))} s`);
    for (const mk of MAIN) for (const d of [HOUR, -HOUR]) {
      const x = jumpRun(mk, d, false);
      if (lapsed(x)) failed.push(`${mk} ${d > 0 ? '+' : '-'}1h lapsed`);
      if (x.world.wallReads !== 0) failed.push(`${mk} read the wall clock ${x.world.wallReads} times`);
    }
    check('C7 wall-clock control reacts to +/-1 h; K1, K2, K3 never read the wall clock', failed.length, 8, failed.join('; '));
  }
  return checks;
}

// ---------------------------------------------------------------- report
const out = [];
const say = (s = '') => out.push(s);
function table(headers, rows) {
  const cells = rows.map((r) => r.map(String));
  const w = headers.map((h, i) => Math.max(h.length, ...cells.map((r) => r[i].length)));
  const fmt = (r) => '| ' + r.map((c, i) => c.padEnd(w[i])).join(' | ') + ' |';
  say(fmt(headers));
  say('|' + w.map((n) => '-'.repeat(n + 2)).join('|') + '|');
  cells.forEach((r) => say(fmt(r)));
  say();
}
const f1 = (us) => (us / SEC).toFixed(1);
const f2 = (us) => (us / SEC).toFixed(2);
const dur = (us) => (us === null ? 'never' : Math.abs(us) >= 600 * SEC ? (us / HOUR).toFixed(2) + ' h' : f2(us) + ' s');
const thr = (us) => (us === Infinity ? 'never' : f2(us) + ' s');
const COLS = [['A', 'K1'], ['A', 'K2'], ['A', 'K3'], ['B', 'K1'], ['B', 'K2'], ['B', 'K3']];
const colHeads = COLS.map(([tk, mk]) => `${tk} ${mk}`);

function report(R) {
  const { s1, s2, s3, s4, s5, s6, s7, th, checks } = R;
  say('D-2 lease timing: discrete-event simulation (fake clock, integer microseconds, seeded)');
  say(`seed ${BASE_SEED}${QUICK ? ', QUICK run (reduced trials)' : ''}; ${N_TRIALS} phases per stall/death case, ${N_SEEDS_8H} eight-hour runs, ${N_PHASES_SLEEP} sleep phases per sleep case`);
  say('Timing A: renew 10 s, expire 30 s.  Timing B: renew 5 s, expire 20 s.  Delivery delay of each renewal: uniform 1-50 ms.');
  say('K1 naive/sleep counted (= Codex lease.ts)   K2 monotonic/sleep not counted   K3 suspend-aware (1 s tick, gap > 3 ticks moves the deadline)');
  say('Variants: K1L lenient renew | K3S K3 + strict renew | K3N K3 on a clock that stops in sleep | K0 control, wall-clock lease');
  say();

  // ---- summary
  say('# SUMMARY (false expiry = the lease lapsed although Claude Code was alive and would have renewed)');
  const sumRows = [];
  sumRows.push(['1. 8 h normal running: false expiries (of ' + N_SEEDS_8H + ' runs)', ...COLS.map(([tk, mk]) => { const r = s1.find((q) => q.tk === tk && q.mk === mk); return `${r.falseExpiries}/${r.runs}`; })]);
  const s2tot = (tk, mk, f) => { const t = s2Total(s2.cells, tk, mk, f); return `${t.lapses}/${t.n}`; };
  sumRows.push(['2. sleep 1 min / 10 min / 8 h, both orders, delay 0/1/3 s: lapses', ...COLS.map(([tk, mk]) => s2tot(tk, mk))]);
  for (const len of CC_STALLS) sumRows.push([`3. Claude Code stalls ${len / SEC} s: false expiries (of ${N_TRIALS})`, ...COLS.map(([tk, mk]) => `${s3.get(`${tk}|${mk}|${len}`)}/${N_TRIALS}`)]);
  for (const len of PO_STALLS) sumRows.push([`4. post office stalls ${len / SEC} s: false expiries (of ${N_TRIALS})`, ...COLS.map(([tk, mk]) => `${s4.get(`${tk}|${mk}|timers-first|${len}`)}/${N_TRIALS}`)]);
  sumRows.push([`5. cleanup after Claude Code dies, min / mean / max (s)`, ...COLS.map(([tk, mk]) => { const r = s5.get(`${tk}|${mk}`); return `${f1(r.min)} / ${f1(r.mean)} / ${f1(r.max)}`; })]);
  sumRows.push(['6. wall clock +/-1 h: false expiries; cleanup change; wall reads', ...COLS.map(([tk, mk]) => {
    const rs = s6.filter((q) => q.tk === tk && q.mk === mk);
    const fe = rs.filter((q) => q.falseExpiry).length;
    const dl = rs.map((q) => (q.base !== null && q.jumped !== null ? Math.abs(q.jumped - q.base) : Infinity));
    const reads = rs.reduce((a, q) => a + q.reads, 0);
    return `${fe}; ${dl.every((v) => v === 0) ? '0' : 'changed'}; ${reads}`;
  })]);
  sumRows.push([`7. ctrl+z 2 min, post office keeps running: lapses (of ${N_TRIALS})`, ...COLS.map(([tk, mk]) => { const r = s7.mod.get(`${tk}|${mk}`); return `${r.n}/${r.N}`; })]);
  sumRows.push([`7b. ctrl+z 2 min, post office stopped too (same process group): lapses (of ${2 * N_TRIALS})`, ...COLS.map(([tk, mk]) => `${s7.both.get(`${tk}|${mk}|po-first`) + s7.both.get(`${tk}|${mk}|mod-first`)}/${2 * N_TRIALS}`)]);
  sumRows.push(['renewals per hour', ...COLS.map(([tk, mk]) => s1.find((q) => q.tk === tk && q.mk === mk).perHour.toFixed(0))]);
  table(['scenario', ...colHeads], sumRows);

  // ---- S1
  say('## S1. Eight hours of normal running');
  table(['timing', 'model', 'runs', 'false expiries', 'renewals/run', 'renewals/hour', 'longest silence between renewals', 'margin to ttl'],
    s1.map((r) => [r.tk, r.mk, r.runs, r.falseExpiries, r.perRun.toFixed(0), r.perHour.toFixed(0), f2(r.longest) + ' s', f2(r.margin) + ' s']));

  // ---- S2
  say('## S2. The computer sleeps with both processes frozen, then wakes (cell = lapses / runs; every run had a live Claude Code)');
  say('order = which process\'s overdue timers run first after the wake; delay = extra delay of the mod\'s first renewal after the wake.');
  const s2rows = [];
  for (const [sname] of SLEEPS) for (const order of ORDERS) for (const c of DELAYS) {
    s2rows.push([sname, order, `${c / SEC} s`, ...COLS.map(([tk, mk]) => { const v = s2.cells.get(`${tk}|${mk}|${sname}|${order}|${c}`); return `${v.lapses}/${v.n}`; })]);
  }
  table(['sleep', 'order', 'delay', ...colHeads], s2rows);
  say('S2 variants (which design choice rescues or breaks a model):');
  const VC = [['A', 'K1L'], ['A', 'K3S'], ['A', 'K3N'], ['B', 'K1L'], ['B', 'K3S'], ['B', 'K3N']];
  const s2v = [];
  for (const order of ORDERS) for (const c of DELAYS) {
    s2v.push([order, `${c / SEC} s`, ...VC.map(([tk, mk]) => { const t = s2Total(s2.cells, tk, mk, (sn, o, cc) => o === order && cc === c); return `${t.lapses}/${t.n}`; })]);
  }
  table(['order', 'delay (all 3 sleeps)', ...VC.map(([tk, mk]) => `${tk} ${mk}`)], s2v);

  // ---- S3
  say('## S3. Claude Code\'s event loop stalls (no renewals) while the post office runs (cell = false expiries / trials)');
  say('No sleep and the post office runs normally, so K1, K2 and K3 see the same thing; K3 can lag K1 by under a tick.');
  table(['stall', ...colHeads], CC_STALLS.map((len) => [`${len / SEC} s`, ...COLS.map(([tk, mk]) => `${s3.get(`${tk}|${mk}|${len}`)}/${N_TRIALS}`)]));

  // ---- S4
  say('## S4. The post office\'s event loop stalls while Claude Code runs (cell = false expiries / trials)');
  const s4rows = [];
  for (const len of PO_STALLS) for (const order of RESUME) {
    s4rows.push([`${len / SEC} s`, order, ...COLS.map(([tk, mk]) => `${s4.get(`${tk}|${mk}|${order}|${len}`)}/${N_TRIALS}`)]);
  }
  table(['stall', 'on resume', ...colHeads], s4rows);
  say('S4 variants:');
  const V4 = [['A', 'K1L'], ['A', 'K3S'], ['B', 'K1L'], ['B', 'K3S']];
  const s4v = [];
  for (const len of PO_STALLS) for (const order of RESUME) {
    s4v.push([`${len / SEC} s`, order, ...V4.map(([tk, mk]) => `${s4.get(`${tk}|${mk}|${order}|${len}`)}/${N_TRIALS}`)]);
  }
  table(['stall', 'on resume', ...V4.map(([tk, mk]) => `${tk} ${mk}`)], s4v);

  // ---- S5
  say('## S5. Claude Code dies; the parent watch failed, so the lease is the only signal (cleanup latency over ' + N_TRIALS + ' random death times)');
  table(['timing', 'model', 'min', 'mean', 'max', 'never cleaned'],
    TK.flatMap((tk) => MAIN.map((mk) => { const r = s5.get(`${tk}|${mk}`); return [tk, mk, f2(r.min) + ' s', f2(r.mean) + ' s', f2(r.max) + ' s', r.missed]; })));

  // ---- S6
  say('## S6. The wall clock jumps by one hour');
  say('(a) Claude Code stays alive for 2 h and the clock steps once. (b) Claude Code dies and the clock steps 1 s earlier; cleanup latency with and without the step.');
  table(['timing', 'model', 'step', 'false expiry (a)', 'cleanup without step (b)', 'cleanup with step (b)', 'wall-clock reads'],
    s6.map((r) => [r.tk, r.mk, r.jname, r.falseExpiry ? 'YES' : 'no', dur(r.base), dur(r.jumped), r.reads]));
  say('K1, K2 and K3 read only the monotonic clock (performance.now() in lease.ts); K0 is the control that proves the test would notice.');
  say();

  // ---- S7
  say('## S7. Claude Code is stopped with ctrl+z for 2 minutes');
  say('(a) the post office keeps running (it is in its own process group)');
  table(['timing', 'model', 'lapses / trials', 'ctrl+z to lapse: min', 'mean', 'max'],
    TK.flatMap((tk) => MAIN.map((mk) => { const r = s7.mod.get(`${tk}|${mk}`); return [tk, mk, `${r.n}/${r.N}`, f2(r.lat.min) + ' s', f2(r.lat.mean) + ' s', f2(r.lat.max) + ' s']; })));
  say('(b) the post office shares the terminal\'s process group, so it is stopped as well and both resume together (cell = lapses / trials)');
  const s7rows = [];
  for (const order of ORDERS) s7rows.push([order, ...TK.flatMap((tk) => ['K1', 'K2', 'K3', 'K1L', 'K3S'].map((mk) => `${s7.both.get(`${tk}|${mk}|${order}`)}/${N_TRIALS}`))]);
  table(['resume', ...TK.flatMap((tk) => ['K1', 'K2', 'K3', 'K1L', 'K3S'].map((mk) => `${tk} ${mk}`))], s7rows);

  // ---- thresholds
  say('## X1. Tolerance thresholds found by bisection (' + N_THRESH + ' random phases each; "first" = shortest event that ever lapses, "always" = shortest that always lapses)');
  const trow = (label, f) => [label, ...TK.flatMap((tk) => f(th[tk]))];
  table(['event', 'A first', 'A always', 'B first', 'B always'], [
    trow('Claude Code stall (K1, K2, K3 alike)', (t) => [thr(t.ccStall.min), thr(t.ccStall.max)]),
    trow('post-office stall, K1/K2', (t) => [thr(t.poStallK1.min), thr(t.poStallK1.max)]),
    trow('post-office stall, K3 (tested to 10 min)', (t) => [thr(t.poStallK3.min), thr(t.poStallK3.max)]),
    trow('computer sleep, K1, po-first', (t) => [thr(t.sleepK1.min), thr(t.sleepK1.max)]),
    trow('computer sleep, K2 (tested to 8 h)', (t) => [thr(t.sleepK2.min), thr(t.sleepK2.max)]),
    trow('computer sleep, K3 (tested to 8 h)', (t) => [thr(t.sleepK3.min), thr(t.sleepK3.max)]),
    trow('K3: Claude Code cannot run for this long after the wake', (t) => [thr(t.wakeStallK3.min), thr(t.wakeStallK3.max)]),
    trow('K2: Claude Code cannot run for this long after the wake', (t) => [thr(t.wakeStallK2.min), thr(t.wakeStallK2.max)]),
  ]);
  say('Lost renewals (the mod\'s HTTP request fails and is not retried): K1, lapses / trials after k consecutive losses');
  table(['k lost in a row', ...TK.map((tk) => `${tk}`)], [0, 1, 2, 3, 4, 5].map((k) => [k, ...TK.map((tk) => `${th[tk].lost[k]}/${N_TRIALS}`)]));

  // ---- checks
  say('## Self-checks (engine against closed-form predictions)');
  for (const c of checks) say(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  say();
}

// ---------------------------------------------------------------- main
const checks = runSelfChecks();
if (SELFTEST_ONLY) {
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
} else {
  const R = {
    s1: scenario1(), s2: { cells: scenario2() }, s3: scenario3(), s4: scenario4(), s5: scenario5(), s6: scenario6(), s7: scenario7(),
    th: thresholds(), checks,
  };
  report(R);
  const text = out.join('\n');
  console.log(text);
  if (!NO_WRITE && !QUICK) { // only a full run writes results.txt
    const here = dirname(fileURLToPath(import.meta.url));
    writeFileSync(join(here, 'results.txt'), text + '\n');
  }
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
}
