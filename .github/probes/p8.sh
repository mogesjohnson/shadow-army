#!/bin/bash
# Probe P-8 (spec 2.0 review, #63): kill a guardian that launchd started. Does launchd restart it,
# after what delay, in the same coalition, and can the restarted guardian remove its own job?
# Lines starting "P8|" are the results.
set -u
r() { echo "P8|$*"; }
now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
U=$(id -u); DOM="gui/$U"
launchctl print "$DOM" >/dev/null 2>&1 || DOM="user/$U"
L=com.shadowarmy.p8guardian
D=$(mktemp -d); P="$HOME/Library/LaunchAgents/$L.plist"
mkdir -p "$HOME/Library/LaunchAgents"
r "os: $(sw_vers -productVersion) $(uname -m) domain=$DOM"

cat > "$D/guardian.sh" <<'EOF'
#!/bin/bash
D="$1"; DOM="$2"; L="$3"
n=$(( $(cat "$D/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$D/count"
sleep 600 & c=$!
echo "n=$n pid=$$ pgid=$(ps -o pgid= -p $$ | tr -d ' ') child=$c t=$(perl -MTime::HiRes=time -e 'printf "%.3f", time')" >> "$D/log"
if [ "$n" -ge 3 ]; then echo "selfremove n=$n" >> "$D/log"; launchctl bootout "$DOM/$L" >> "$D/log" 2>&1; echo "after-bootout n=$n" >> "$D/log"; fi
wait
EOF
chmod +x "$D/guardian.sh"
cat > "$P" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$L</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$D/guardian.sh</string><string>$D</string><string>$DOM</string><string>$L</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardErrorPath</key><string>$D/err</string>
</dict></plist>
EOF

waitn() { # wait up to $2 s for start number $1; prints its log line
  local i; for i in $(seq 1 $(( $2 * 10 ))); do
    local l; l=$(grep "^n=$1 " "$D/log" 2>/dev/null); [ -n "$l" ] && { echo "$l"; return 0; }; sleep 0.1
  done; return 1
}
field() { echo "$1" | tr ' ' '\n' | grep "^$2=" | cut -d= -f2; }
coal() { sudo launchctl procinfo "$1" 2>&1 | grep -i -E 'coalition|responsible' | tr -s ' \t' ' ' | tr '\n' ';'; }
alive() { ps -p "$1" >/dev/null 2>&1 && echo alive || echo gone; }

r "bootstrap: $(launchctl bootstrap "$DOM" "$P" 2>&1; echo "rc=$?")"
l1=$(waitn 1 20) || { r "start 1 never came"; cat "$D/err" "$D/log" 2>/dev/null; exit 0; }
p1=$(field "$l1" pid); c1=$(field "$l1" child)
r "start1: $l1"
r "start1 procinfo: $(coal "$p1")"
r "start1 print: $(launchctl print "$DOM/$L" 2>&1 | grep -E 'state|pid|runs|last exit|coalition|throttle' | tr -s ' \t' ' ' | tr '\n' ';')"

sleep 12   # run past the default 10 s ThrottleInterval so the restart delay is launchd's own
tk=$(now); kill -9 "$p1"
l2=$(waitn 2 90) && {
  t2=$(field "$l2" t); p2=$(field "$l2" pid)
  r "start2: $l2 delay=$(echo "$t2 - $tk" | bc)s"
  r "start2 procinfo: $(coal "$p2")"
  r "start1's child $c1 after kill -9 of its guardian: $(alive "$c1")"
} || r "no restart within 90 s after kill -9"

l3=""
if [ -n "${p2:-}" ]; then   # restart 3 removes its own job
  tk=$(now); kill -9 "$p2"
  l3=$(waitn 3 90) && r "start3: $l3 delay=$(echo "$(field "$l3" t) - $tk" | bc)s" || r "no start 3"
fi
sleep 5
r "log tail: $(tail -4 "$D/log" | tr '\n' ';')"
r "job after self-bootout: $(launchctl print "$DOM/$L" >/dev/null 2>&1 && echo still-loaded || echo removed)"
[ -n "$l3" ] && r "start3 pid $(field "$l3" pid): $(alive "$(field "$l3" pid)"), its child $(field "$l3" child): $(alive "$(field "$l3" child)")"
sleep 20; r "starts after 20 s more: $(cat "$D/count")"
r "err: $(head -5 "$D/err" 2>/dev/null | tr '\n' ';')"
launchctl bootout "$DOM/$L" >/dev/null 2>&1; rm -f "$P"
r "done"
