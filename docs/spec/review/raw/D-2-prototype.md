# D-2 prototype report (Sonnet), prototypes/D-2/

**Built.** All files are in `C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\prototypes\D-2\`. Nothing else was written, and `lease.ts` is untouched.
- `lease-sim.mjs` is a single-file discrete-event simulation. It uses a fake integer-microsecond clock, is seeded, and uses Node built-ins only.
  - It models the mod's renewals (setInterval-style, delivery 1-50 ms), the post office's lease, the clock models, and the 7 scenarios.
  - K1 reproduces `lease.ts`: a one-shot timer armed at the deadline, and `now >= deadline` expires the lease both in the timer and at the top of `renew()`.
  - K3 uses a 1 s tick with a random phase and a gap threshold of more than 3 ticks.
  - Four variants isolate one design choice each: K1L (lenient renew), K3S (K3 plus `lease.ts`'s strict renew), K3N (K3 on a clock that stops in sleep), and K0 (a wall-clock lease, as a negative control).
  - 9 self-checks compare the engine against closed-form predictions (about 15.8k runs, 0 mismatches).
- `results.txt` is the full output of the default seed: every table, the variants, tolerance thresholds, and the checks.

**Rerun:** `node C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\prototypes\D-2\lease-sim.mjs`. It takes about 3 s, and the same seed prints identical text. Flags are `--quick`, `--selftest`, `--seed N` and `--no-write`.

**Results** (default seed). Each cell is false expiries over trials, with Claude Code alive. The 3 and 7 lapses are indistinguishable from a dead Monarch for any lease.

| Scenario | A K1 | A K2 | A K3 | B K1 | B K2 | B K3 |
|---|---|---|---|---|---|---|
| 1. 8 h normal running (20 runs) | 0 | 0 | 0 | 0 | 0 | 0 |
| 2. Sleep 1 min / 10 min / 8 h x both orders x first-renewal delay 0/1/3 s (216 runs) | 216 | 0 | 0 | 216 | 0 | 0 |
| 3. Claude Code stalls 5 s (of 1000) | 0 | 0 | 0 | 0 | 0 | 0 |
| 3. ... 15 s | 0 | 0 | 0 | 1 | 1 | 0 |
| 3. ... 25 s | 501 | 501 | 448 | 1000 | 1000 | 1000 |
| 3. ... 35 s and 60 s | 1000 | 1000 | 1000 | 1000 | 1000 | 1000 |
| 4. Post office stalls 5 s and 15 s (of 1000) | 0 | 0 | 0 | 0 | 0 | 0 |
| 4. ... 25 s | 498 | 498 | 0 | 1000 | 1000 | 0 |
| 4. ... 35 s | 1000 | 1000 | 0 | 1000 | 1000 | 0 |
| 5. Cleanup after Claude Code dies, min / mean / max s (1000 deaths) | 20.0 / 25.0 / 30.0 | 20.0 / 25.0 / 30.0 | 20.3 / 25.5 / 31.0 | 15.0 / 17.5 / 20.0 | 15.0 / 17.5 / 20.0 | 15.1 / 18.0 / 20.9 |
| 6. Wall clock +1 h or -1 h: false expiries / cleanup change / wall-clock reads | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| 7. ctrl+z 2 min, post office running (lapses of 1000) | 1000 | 1000 | 1000 | 1000 | 1000 | 1000 |
| 7b (extra). Same, but the post office is stopped too, as it would be in the same process group (of 2000) | 2000 | 2000 | 0 | 2000 | 2000 | 0 |
| Renewals per hour | 360 | 360 | 360 | 720 | 720 | 720 |

- In row 7 the lapse comes 20-30 s (A) or 15-20 s (B) after ctrl+z, up to 1 s later under K3.
- Other seeds (1, 2, 3) give the same structure. A at 25 s reads 499-502 (K3 446-452), and B at 15 s reads 0-3 per 1000.
- Row 6: K0 (the wall-clock control) lapses on +1 h and delays a dead Monarch's cleanup by about 1 h on -1 h. So the test would notice a wall-clock reader. K1-K3 read only the monotonic clock; `lease.ts` uses only `performance.now()`.

**Variants** (A shown; B is 1000 / 1000 where A is not 0):

| Variant | Sleep lapses (of 216) | Post office stall 25 s / 35 s, timers first | Post office stall 25 s / 35 s, queued renewals first | ctrl+z, both stopped, PO resumes first / mod first (of 1000 each) |
|---|---|---|---|---|
| K1 (`lease.ts`, strict renew) | 216 | 498 / 1000 | 498 / 1000 | 1000 / 1000 |
| K1L (lenient renew) | 180 | 498 / 1000 | 0 / 0 | 1000 / 0 |
| K3 (tick decides) | 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| K3S (K3 plus strict renew) | 36 | 0 / 0 | 498 / 1000 | 0 / 1000 |

**What it means for the clock models**
- **Which clock is live.**
  - Windows counts time asleep: Microsoft documents QPC as including sleep, and libuv's Windows `uv__hrtime` calls QPC.
  - macOS counts it too: libuv reads `mach_continuous_time`.
  - Only Linux's `CLOCK_MONOTONIC` stops in suspend.
  - So on the owner's Windows machine K1 is the real behavior.
  - This comes from docs and libuv source, not from hardware. Claude Code's own runtime for the mod was not checked, which does not change K1 because the post office decides expiry.
- **K1 fails.**
  - Every sleep lapses it, 216 of 216, in both delivery orders and with the first renewal delayed 0/1/3 s. The lapse starts at about 20 s (A) or 15 s (B) asleep in the worst phase, and is certain from about 30 s (A) or 20 s (B).
  - Order does not rescue it, because `renew()` runs the deadline check itself and a renewal that arrives first also kills the lease.
  - Even a lenient renew survives only when the mod wins with a delay under about 0.1 s.
  - A post office stall of ttl minus R or more, and ctrl+z with the post office stopped too, fail the same way.
- **K2** removes the sleep lapses (0 of 216), but only where the OS clock stops. It does nothing for post office stalls or the both-stopped ctrl+z.
- **K3** gives 0 lapses for sleep, post office stalls (none up to 10 min) and 7b, on any OS clock. After a wake it gives Claude Code a fresh full ttl: slow starts up to about 29.9 s (A) or 19.9 s (B) are tolerated.
  - Its cost is +0.5 s mean and +1 s max on cleanup, plus a 1 s timer in the post office (3,600 ticks per hour, no I/O).
  - Implementation rule 1: `renew()` must never expire the lease. K3S shows a strict renew brings the lapses back.
  - Implementation rule 2: the tick alone decides, after the gap check. `lease.ts`'s public `assertActive()` also expires the lease, so any request that arrives first after a wake would do the same (I did not read its other callers).
- **No model helps with a stalled Claude Code or ctrl+z with a live post office.** The lease cannot tell it from death. The tolerance is set by the timing: guaranteed up to 20 s (A) or 15 s (B), certain lapse from 30 s (A) or 20 s (B).

**What it means for A and B**
- On sleep and post office stalls the measurement decides the outcome, not the timing: both timings lapse 216 of 216 under K1 and 0 under K3.
- A (10 s / 30 s) tolerates stalls 5 s longer: 20 s versus 15 s guaranteed, and 29.9 s versus 19.9 s after a wake under K3. It sends half the renewals (360 versus 720 per hour).
- B (5 s / 20 s) cleans up faster: mean 17.5 s versus 25.0 s, max 20 s versus 30 s. It also survives 2 lost renewals in a row (0 of 1000 lapse) where A survives 1. With 2 lost, A lapses 512 of 1000, and with 3 lost, B lapses 518 of 1000. B sits exactly on its limit at a 15 s stall.
- Nothing in the 7 scenarios makes B safer against false expiry. The owner's 10 s / 30 s holds up. The defect is the K1 measurement in `lease.ts`, and K3 plus the two rules fixes it without changing the owner's timing.

**Caveats**
- The wake-order lag of 100 ms and the 1-50 ms delivery delays are assumptions.
- No real laptop sleep was measured.
- HTTP timeouts and retries are not modeled. Renewals sent during a post office stall are assumed to queue and be delivered on resume.
- Whether the post office shares Claude Code's process group (7b) depends on how the mod spawns it.
- Cleanup latency is measured to the moment the lease lapses, not to the sessions finishing their close.
- Unverified and not simulated: B's 5 s interval equals Node's default 5 s HTTP keep-alive timeout. That is a known source of connection-reset races, worth one real test if B is kept.

Sources: [Microsoft, QPC includes sleep](https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps), [libuv Windows](https://github.com/libuv/libuv/blob/v1.x/src/win/util.c), [libuv Linux](https://github.com/libuv/libuv/blob/v1.x/src/unix/posix-hrtime.c), [libuv macOS](https://github.com/libuv/libuv/blob/v1.x/src/unix/darwin.c), [Rust note on macOS clocks](https://github.com/rust-lang/rust/pull/87907).
