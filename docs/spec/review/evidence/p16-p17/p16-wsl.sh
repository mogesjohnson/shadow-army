#!/bin/bash
# P-16 runner for WSL (Ubuntu). Same cases as p16.mjs, plus a Unix-socket socketPath case.
# Model API pointed at a dead port, so no prompt can reach a model.
set -u
W=$HOME/sa-p1617
OUT=$W/p16-wsl
mkdir -p "$OUT"
only=${1:-}
port=47710
run_case() {
  local name=$1 mode=$2 a=$port b=$((port+1)); port=$((port+2))
  [ -n "$only" ] && [ "$only" != "$name" ] && return
  local dir=$OUT/$name id; id=$(cat /proc/sys/kernel/random/uuid)
  rm -rf "$dir"; mkdir -p "$dir/ws/.claude"
  local sock=""
  [ "$mode" = sock ] && sock=$dir/p16.sock
  python3 "$W/listen.py" $a $b "$dir/listen.jsonl" $sock > "$dir/listen.out" 2>&1 &
  local lpid=$!
  for i in $(seq 50); do grep -q ready "$dir/listen.out" 2>/dev/null && break; sleep 0.1; done
  local extra=()
  case $mode in
    shell-HTTP) extra=(HTTP_PROXY=http://127.0.0.1:$b) ;;
    shell-HTTPS) extra=(HTTPS_PROXY=http://127.0.0.1:$b) ;;
    shell-lower) extra=(http_proxy=http://127.0.0.1:$b) ;;
    settings-HTTP) printf '{"env":{"HTTP_PROXY":"http://127.0.0.1:%s"}}\n' $b > "$dir/ws/.claude/settings.json" ;;
    settings-HTTPS) printf '{"env":{"HTTPS_PROXY":"http://127.0.0.1:%s"}}\n' $b > "$dir/ws/.claude/settings.json" ;;
    noproxy) extra=(HTTP_PROXY=http://127.0.0.1:$b NO_PROXY=127.0.0.1,localhost) ;;
    sock) extra=(P16_SOCK=$sock) ;;
  esac
  local t0; t0=$(date +%s%3N)
  (cd "$dir/ws" && env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u NO_PROXY -u no_proxy \
    ANTHROPIC_BASE_URL=http://127.0.0.1:9 P1617_MODE=p16 P16_A=$a P16_ID=$id P1617_MODLOG="$dir/mod.jsonl" "${extra[@]}" \
    timeout 90 claude -p /p1617 --plugin-dir "$W/mod" --debug-file "$dir/debug.log" < /dev/null > "$dir/stdout.txt" 2> "$dir/stderr.txt")
  local rc=$? t1; t1=$(date +%s%3N)
  sleep 0.5; kill $lpid 2>/dev/null; wait $lpid 2>/dev/null
  local hits; hits=$(grep -i "x-probe: $id" "$dir/listen.jsonl" | python3 -c 'import sys,json; print([ (j["listener"], j["line"]) for j in map(json.loads, sys.stdin)])')
  local conns; conns=$(grep '"listener": "B"' "$dir/listen.jsonl" | grep -o '"line": "CONNECT [^ ]*' | sort -u | tr '\n' ' ')
  local api; api=$(grep -c '\[API REQUEST\]' "$dir/debug.log" 2>/dev/null)
  echo "$name | exit $rc | ms $((t1-t0)) | hits $hits | Bconnects $conns | api $api | out $(head -c 200 "$dir/stdout.txt") | err $(head -c 200 "$dir/stderr.txt")"
  grep '"socket"' "$dir/mod.jsonl" 2>/dev/null | head -c 400
}
run_case base none
run_case shell-HTTP_PROXY shell-HTTP
run_case shell-HTTPS_PROXY shell-HTTPS
run_case shell-http_proxy-lower shell-lower
run_case settings-HTTP_PROXY settings-HTTP
run_case settings-HTTPS_PROXY settings-HTTPS
run_case shell-HTTP_PROXY+NO_PROXY noproxy
run_case unix-socketPath sock
