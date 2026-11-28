#!/bin/bash
# Experiment D-3 driver. Run inside WSL:   bash run-all.sh [runs-per-mechanism]      (default 20)
#
# For every mechanism it starts the fake CLI (fakecli.sh: kinds a-d, each writing a heartbeat every 200 ms),
# waits PRE_CLOSE seconds (default 0.6, so (d) is in the middle of its 2 s loop), asks the mechanism to end
# everything, then reads the heartbeats: a writer whose counter still moves is a survivor.
#   m1  kill -KILL -- -PGID of the CLI (setsid group), nothing else
#   m2a d3sup subreaper; the close request is SIGTERM to the supervisor while the CLI is alive
#   m2b d3sup subreaper; the CLI is SIGKILLed alone and the supervisor reacts to its exit
#   m3  systemd-run --user --scope, ended by systemctl --user kill --signal=SIGKILL <unit>.scope
#   m4  bash parent polling /proc every 50 ms, recording descendants, killing the recorded ones at close
#   m5  (extra) bash parent that kills by an environment tag read from /proc/<pid>/environ at close
#   m6  (extra) unshare --user --map-root-user --pid --fork --kill-child: the CLI is PID 1 of its own PID namespace;
#       the close is SIGKILL to the unshare parent, and the kernel then ends every process in the namespace
# Env: PRE_CLOSE=0.6 (seconds before the close), D_US=5000 (microseconds between daemons in (d); 500 = storm),
#      MECHS="m1 m2a ..." (subset), SKIP_BINFACTS=1, TAG=main (part of the result file names).
# Output: summary on stdout and results/summary-*.txt, per-run detail in results/detail-*.txt, binary facts in
# results/binfacts-*.txt. Scratch lives in /tmp/d3run.* and is removed on exit; every process started is killed.
export PATH=/usr/local/bin:/usr/bin:/bin
set -u
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RUNS=${1:-20}
PRE_CLOSE=${PRE_CLOSE:-0.6}
MECHS=${MECHS:-"m1 m2a m2b m3 m4 m5 m6"}
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=$HERE/results
mkdir -p "$OUT"
TAG=${TAG:-main}
SUMMARY=$OUT/summary-$TAG-$STAMP.txt
DETAIL=$OUT/detail-$TAG-$STAMP.txt
S=$(mktemp -d /tmp/d3run.XXXXXX) || exit 1
mkdir -p "$S/bin"
HB=$S/bin/d3hb
SUP=$S/bin/d3sup
: >"$SUMMARY"
: >"$DETAIL"
say() { printf '%s\n' "$*" | tee -a "$SUMMARY"; }
note() { printf '%s\n' "$*" >>"$DETAIL"; }

sweep_all() { # kill anything an experiment could have left behind
  pkill -KILL -x d3hb 2>/dev/null
  pkill -KILL -x d3sup 2>/dev/null
  pkill -KILL -f "bash $HERE/poller.sh" 2>/dev/null
  pkill -KILL -f "bash $HERE/fakecli.sh" 2>/dev/null
  local u
  for u in $(systemctl --user list-units --all --plain --no-legend 'd3run-*' 2>/dev/null | awk '{print $1}'); do
    systemctl --user kill --signal=SIGKILL "$u" 2>/dev/null
    systemctl --user reset-failed "$u" 2>/dev/null
  done
  local tries=0
  while pgrep -x d3hb >/dev/null && ((tries++ < 100)); do sleep 0.02; done
}
finish() { sweep_all; rm -rf "$S"; }
trap finish EXIT
trap 'exit 130' INT TERM

gcc -O2 -Wall -Wextra -o "$HB" "$HERE/d3hb.c" || exit 1
gcc -O2 -Wall -Wextra -o "$SUP" "$HERE/d3sup.c" || exit 1

export D_US=${D_US:-5000}
say "== D-3 run $STAMP: $RUNS runs per mechanism, close ${PRE_CLOSE}s after the CLI is ready (d is mid-loop), (d) spawns a daemon every ${D_US} us"
say "kernel $(uname -r); $(systemctl --version | head -1); cgroup fs $(stat -fc %T /sys/fs/cgroup); XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-unset}"
say "systemctl --user is-system-running: $(systemctl --user is-system-running 2>&1 | head -1)"
say "loginctl linger: $(loginctl show-user "$(id -un)" -p Linger -p State 2>&1 | tr '\n' ' ')"
sweep_all
say "baseline before experiments: d3hb processes: $(pgrep -cx d3hb), processes in total: $(ps -e --no-headers | wc -l)"

declare -A TOT ALV LEAK NRUN CLI_ALIVE
record() { # record <mech> <check-output-file>
  local mech=$1 tag kind total alive
  while read -r tag kind total alive; do
    [[ $tag == RESULT ]] || continue
    TOT[$mech,$kind]=$((${TOT[$mech,$kind]:-0} + total))
    ALV[$mech,$kind]=$((${ALV[$mech,$kind]:-0} + alive))
    if ((alive > 0)); then LEAK[$mech,$kind]=$((${LEAK[$mech,$kind]:-0} + 1)); fi
  done <"$2"
}

wait_file() { # wait_file <path> <seconds>
  local end=$((SECONDS + $2))
  until [[ -e $1 ]]; do ((SECONDS >= end)) && return 1; sleep 0.02; done
}

run_one() { # run_one <mech> <n>
  local mech=$1 n=$2 dir cli='' pgid='' sup='' poller='' unit='' clipid=''
  dir=$S/$mech-$n
  mkdir -p "$dir"
  local cmd=(bash "$HERE/fakecli.sh" "$dir" "$HB")
  case $mech in
    m1) setsid "${cmd[@]}" >"$dir/cli.log" 2>&1 </dev/null & cli=$!; pgid=$cli ;;
    m2a | m2b) "$SUP" run -- "${cmd[@]}" >"$dir/cli.log" 2>"$dir/sup.log" </dev/null & sup=$! ;;
    m3) unit=d3run-$$-$n
        systemd-run --user --scope --collect --quiet --unit="$unit" "${cmd[@]}" >"$dir/cli.log" 2>&1 </dev/null & cli=$! ;;
    m4) bash "$HERE/poller.sh" "$dir" "$HB" poll >"$dir/poller.log" 2>&1 </dev/null & poller=$! ;;
    m5) bash "$HERE/poller.sh" "$dir" "$HB" envtag >"$dir/poller.log" 2>&1 </dev/null & poller=$! ;;
    m6) unshare --user --map-root-user --pid --fork --kill-child --mount-proc "${cmd[@]}" >"$dir/cli.log" 2>&1 </dev/null & cli=$! ;;
  esac
  if ! wait_file "$dir/ready" 6; then
    note "[$mech #$n] LAUNCH FAILED: $(cat "$dir/cli.log" "$dir/sup.log" "$dir/poller.log" 2>/dev/null | head -5)"
    say "[$mech #$n] launch failed: $(cat "$dir/cli.log" "$dir/sup.log" "$dir/poller.log" 2>/dev/null | head -3)"
    sweep_all
    return 1
  fi
  if [[ $mech == m1 ]]; then
    local real
    real=$(ps -o pgid= -p "$cli" | tr -d ' ')
    [[ $real == "$cli" ]] || { say "[m1 #$n] setsid did not make $cli a group leader (pgid=$real)"; sweep_all; return 1; }
  fi
  sleep "$PRE_CLOSE"

  # What the process table looks like just before the close (first run only: it does not change)
  if ((n == 1)); then
    local cpid
    cpid=$(cut -d' ' -f1 <"$dir/c.hb")
    [[ $mech == m6 ]] && cpid=$(pgrep -f "d3hb daemon $dir/c.hb" | head -1) # inside a PID namespace the file holds the namespace-local pid
    local adopter
    adopter=$(ps -o ppid= -p "$cpid" | tr -d ' ')
    note "[$mech #1] before close: d3hb processes=$(pgrep -cx d3hb); daemon c pid=$cpid ppid=$adopter ($(ps -o comm=,args= -p "$adopter" | head -1)) sid=$(ps -o sid= -p "$cpid" | tr -d ' ') pgid=$(ps -o pgid= -p "$cpid" | tr -d ' ') (cli pgid=${pgid:-n/a})"
    [[ $mech == m6 ]] && note "[m6 #1] daemon c inside the namespace: $(grep NSpid "/proc/$cpid/status") (host pid first, pid inside the namespace last)"
    if [[ $mech == m3 ]]; then
      local cg
      cg=$(systemctl --user show -p ControlGroup --value "$unit.scope")
      note "[m3 #1] cgroup of daemon c: $(cat "/proc/$cpid/cgroup"); scope ControlGroup=$cg ActiveState=$(systemctl --user show -p ActiveState --value "$unit.scope")"
      local p in_scope=0 all=0
      for p in $(pgrep -x d3hb); do
        all=$((all + 1))
        grep -q "$unit.scope" "/proc/$p/cgroup" 2>/dev/null && in_scope=$((in_scope + 1))
      done
      note "[m3 #1] d3hb processes whose /proc/<pid>/cgroup is the scope: $in_scope of $all (all of them have a different parent than the CLI: orphans are adopted by the WSL relay)"
    fi
    ps -eo pid,ppid,pgid,sid,stat,comm,args 2>/dev/null | grep -F "$dir" | grep -v grep | head -12 | sed "s/^/    [$mech #1 table] /" >>"$DETAIL"
  fi

  case $mech in
    m1) kill -KILL -- "-$pgid"; { wait "$cli"; } 2>/dev/null ;;
    m2a) kill -TERM "$sup"; { wait "$sup"; } 2>/dev/null ;;
    m2b) clipid=$(sed -n 's/^d3sup: cli pid \([0-9]*\).*/\1/p' "$dir/sup.log")
         kill -KILL "$clipid"; { wait "$sup"; } 2>/dev/null ;;
    m3) { systemctl --user kill --signal=SIGKILL "$unit.scope" 2>"$dir/close.err"; wait "$cli"; } 2>>"$dir/close.err"
        [[ -s $dir/close.err ]] && note "[m3 #$n] close stderr: $(grep -v -E 'Killed +systemd-run' "$dir/close.err" | head -3)" ;;
    m4 | m5) : >"$dir/close"; { wait "$poller"; } 2>/dev/null ;;
    m6) kill -KILL "$cli"; { wait "$cli"; } 2>/dev/null ;;
  esac
  sleep 0.25
  "$HB" check "$dir" 600 >"$dir/check.txt"
  local left
  left=$(pgrep -fc "bash $HERE/fakecli.sh") # zombies have an empty command line and do not match
  if ((left > 0)); then CLI_ALIVE[$mech]=$((${CLI_ALIVE[$mech]:-0} + 1)); fi
  note "[$mech #$n] fake CLI processes still alive after the close: $left"
  note "[$mech #$n] survivors by ps: d3hb=$(pgrep -cx d3hb), their ppids: $(ps -C d3hb -o ppid= | sort | uniq -c | sort -rn | head -3 | tr -s ' \n' ' ')"
  note "[$mech #$n] $(tr '\n' ' ' <"$dir/check.txt")"
  [[ -s $dir/sup.log ]] && note "[$mech #$n] $(grep -h closed "$dir/sup.log")"
  [[ -s $dir/poller.log ]] && note "[$mech #$n] $(tr '\n' ' ' <"$dir/poller.log")"
  record "$mech" "$dir/check.txt"
  NRUN[$mech]=$((${NRUN[$mech]:-0} + 1))
  sweep_all
  rm -rf "$dir"
}

for mech in $MECHS; do
  say "-- $mech: running $RUNS times"
  for ((i = 1; i <= RUNS; i++)); do run_one "$mech" "$i" || { say "   stopping $mech after a failed launch"; break; }; done
done

cell() { # cell <mech> <kind>
  local m=$1 k=$2 runs=${NRUN[$1]:-0} leak=${LEAK[$1,$2]:-0} a=${ALV[$1,$2]:-0} t=${TOT[$1,$2]:-0} v
  if ((runs == 0)); then printf 'not run'; return; fi
  if ((leak == 0)); then v=ended; elif ((leak == runs)); then v=SURVIVED; else v=PARTIAL; fi
  if [[ $k == d ]]; then printf '%s (%d/%d runs; %d of %d daemons alive)' "$v" "$leak" "$runs" "$a" "$t"
  else printf '%s (%d/%d runs)' "$v" "$leak" "$runs"; fi
}
label() {
  case $1 in
    m1) echo "1  kill -- -PGID only" ;;
    m2a) echo "2a subreaper, close request (CLI alive)" ;;
    m2b) echo "2b subreaper, CLI killed first" ;;
    m3) echo "3  systemd --user scope + kill" ;;
    m4) echo "4  bash polls /proc every 50 ms" ;;
    m5) echo "5  (extra) env-tag sweep via /proc" ;;
    m6) echo "6  (extra) PID namespace, unshare --kill-child" ;;
  esac
}
say
say "== RESULT: did the kind survive the close? (runs = runs in which at least one writer of that kind was still alive)"
for mech in $MECHS; do
  say "$(label "$mech")"
  for k in a b c d; do say "      $k: $(cell "$mech" "$k")"; done
done

say
say "== was the CLI process itself still running after the close? (runs with a fakecli.sh process left)"
for mech in $MECHS; do say "   $(label "$mech"): ${CLI_ALIVE[$mech]:-0}/${NRUN[$mech]:-0}"; done
stat_of() { # stat_of <mech> <key>   -> min/avg/max of key=<number> over the detail lines of that mechanism
  grep -h "^\[$1 #" "$DETAIL" | grep -o " $2=[0-9]*" | cut -d= -f2 |
    awk 'NR==1 {mn = mx = $1} {s += $1; if ($1 < mn) mn = $1; if ($1 > mx) mx = $1} END {if (NR) printf "min %d / avg %.1f / max %d", mn, s / NR, mx; else printf "n/a"}'
}
say
say "== how the mechanisms behaved (min / avg / max over runs)"
for m in m2a m2b; do
  [[ -n ${NRUN[$m]:-} ]] || continue
  say "$m supervisor: sweep passes $(stat_of $m passes); processes found in pass 1: $(stat_of $m first_pass_descendants); of those direct children of the supervisor: $(stat_of $m direct_children)"
done
if [[ -n ${NRUN[m4]:-} ]]; then
  say "m4 poller: scans per run $(stat_of m4 scans); scan time (us) $(stat_of m4 avg_scan_us); longest start-to-start gap (us) $(stat_of m4 max_start_to_start_us); descendants recorded $(stat_of m4 recorded)"
fi
[[ -n ${NRUN[m5]:-} ]] && say "m5 env sweep: passes $(stat_of m5 passes)"
say
if [[ -z ${SKIP_BINFACTS:-} ]]; then
  say "== binary facts (also in results/binfacts-$STAMP.txt)"
  bash "$HERE/binfacts.sh" "$S/binfacts" 2>&1 | tee "$OUT/binfacts-$STAMP.txt" | tee -a "$SUMMARY"
  say
fi
say "saved: $SUMMARY $DETAIL"
