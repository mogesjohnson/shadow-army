#!/bin/bash
# D-3 mechanisms 4 and 5: a bash parent with no native code starts the fake CLI and closes it later.
# usage: poller.sh <workdir> <path-to-d3hb> poll|envtag
#   poll    scan /proc every 50 ms and record every descendant of the CLI seen (pid + start time). When <workdir>/close
#           appears, scan once more, then SIGKILL the CLI and every recorded process whose start time still matches.
#   envtag  (extra) start the CLI with a unique tag in its environment. When <workdir>/close appears, SIGKILL every
#           process whose /proc/<pid>/environ carries the tag, repeating until a pass finds none.
export PATH=/usr/local/bin:/usr/bin:/bin
dir=$1 hb=$2 mode=$3
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
tag=d3tag$$x$RANDOM

env D3TAG="$tag" bash "$here/fakecli.sh" "$dir" "$hb" >"$dir/cli.log" 2>&1 </dev/null &
cli=$!
disown "$cli" # no "Killed" job notice in our output when the CLI is ended

# nap: a sleep that forks nothing (read -t on a fifo nobody writes to), so the poller adds no processes to the table.
mkfifo "$dir/tick"
exec 9<>"$dir/tick"
nap() { read -r -t "$1" -u 9 || :; }

if [[ $mode == envtag ]]; then
  until [[ -e $dir/close ]]; do nap 0.05; done
  passes=0
  while :; do
    passes=$((passes + 1))
    pids=$(grep -l -a -s -F "D3TAG=$tag" /proc/[0-9]*/environ | sed -n 's#^/proc/\([0-9]*\)/environ$#\1#p')
    [[ -z $pids ]] && break
    kill -KILL $pids 2>/dev/null
    ((passes >= 200)) && break
  done
  echo "envtag passes=$passes"
  exit 0
fi

declare -A rec ppid st isd # rec: every descendant ever seen (pid -> start time); the others are per-scan scratch
scan() {
  local f pid line rest p q r path
  ppid=() st=() isd=()
  for f in /proc/[0-9]*/stat; do
    pid=${f#/proc/}
    pid=${pid%/stat}
    { read -r line <"$f"; } 2>/dev/null || continue
    rest=${line##*) } # drop "pid (comm) ": the command name may contain spaces
    set -- $rest      # $1 state, $2 ppid, ..., ${20} start time
    ppid[$pid]=$2
    st[$pid]=${20}
  done
  for pid in "${!ppid[@]}"; do
    p=$pid path=() r=0
    while :; do
      if [[ -n ${isd[$p]-} ]]; then r=${isd[$p]}; break; fi
      if [[ $p == "$cli" ]]; then r=1; break; fi
      q=${ppid[$p]-}
      if [[ -z $q || $q -le 1 ]]; then r=0; break; fi
      path+=("$p")
      p=$q
    done
    for q in "${path[@]}"; do isd[$q]=$r; done
    isd[$pid]=$r
    ((r)) && rec[$pid]=${st[$pid]}
  done
}

scans=0 busy=0 maxgap=0 last=
while [[ ! -e $dir/close ]]; do
  t0=${EPOCHREALTIME/[.,]/}
  scan
  t1=${EPOCHREALTIME/[.,]/}
  scans=$((scans + 1))
  busy=$((busy + t1 - t0))
  if [[ -n $last ]] && ((t0 - last > maxgap)); then maxgap=$((t0 - last)); fi
  last=$t0
  rem=$((50000 - (t1 - t0)))
  if ((rem > 0)); then printf -v frac '%06d' "$rem"; nap "0.$frac"; fi
done

scan
kills=()
for pid in "${!rec[@]}"; do
  { read -r line <"/proc/$pid/stat"; } 2>/dev/null || continue
  rest=${line##*) }
  set -- $rest
  [[ ${20} == "${rec[$pid]}" ]] && kills+=("$pid")
done
((${#kills[@]})) && kill -KILL "${kills[@]}" 2>/dev/null
echo "poll scans=$scans avg_scan_us=$((busy / scans)) max_start_to_start_us=$maxgap recorded=${#rec[@]} killed=${#kills[@]}"
