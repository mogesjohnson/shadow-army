#!/bin/bash
# S7 on macOS: probe P-8 tested a KeepAlive LaunchAgent removed with bootout. This tests a job made with
# `launchctl submit` (PO-18) and removed with `launchctl remove` (PO-17): restart after kill -9, delay, coalition.
set -u
D=$(mktemp -d); L=com.shadowarmy.s7.$$; L2=$L.ext
now() { perl -MTime::HiRes=time -e 'printf "%.3f\n", time'; }
coal() { sudo launchctl procinfo "$1" 2>&1 | grep -i -A3 'coalition = {' | grep -i -E 'coalition|ID' | tr -s ' \t' ' ' | tr '\n' ';'; }
r() { echo "S7 $*"; }
alive() { kill -0 "$1" 2>/dev/null && echo alive || echo gone; }
starts() { grep -c '^start' "$1" 2>/dev/null || echo 0; }
waitstart() { for _ in $(seq 1 300); do [ "$(starts "$1")" -ge "$2" ] && return 0; sleep 0.1; done; return 1; }
cat > "$D/job.sh" <<EOF
#!/bin/sh
# \$1 = log file, \$2 = label to self-remove on the third start (or "none")
/bin/sleep 600 & c=\$!
echo "start \$\$ \$c \$(perl -MTime::HiRes=time -e 'printf "%.3f", time')" >> "\$1"
n=\$(grep -c '^start' "\$1")
if [ "\$2" != none ] && [ "\$n" -ge 3 ]; then echo "selfremove begin" >> "\$1"; launchctl remove "\$2"; echo "selfremove returned rc=\$?" >> "\$1"; fi
wait
EOF
chmod +x "$D/job.sh"
r "macOS $(sw_vers -productVersion) $(uname -m) uid=$(id -u)"
r "submit rc=$(launchctl submit -l "$L" -- "$D/job.sh" "$D/a" "$L" 2>&1; echo $?)"
waitstart "$D/a" 1 || r "no first start"
read -r _ p1 c1 t1 < <(grep '^start' "$D/a" | sed -n 1p)
r "start1 pid=$p1 child=$c1 coal=$(coal "$p1") childcoal=$(coal "$c1")"
r "list: $(launchctl list | grep "$L" | tr -s ' \t' ' ')"
sleep 2; k=$(now); kill -9 "$p1"
waitstart "$D/a" 2 && read -r _ p2 c2 t2 < <(grep '^start' "$D/a" | sed -n 2p) && r "after kill at run<10s: restart delay=$(echo "$t2 - $k" | bc)s pid=$p2 coal=$(coal "$p2") oldchild=$c1 $(alive "$c1")" || r "no restart within 30s after kill 1"
sleep 12; k=$(now); kill -9 "$p2"
waitstart "$D/a" 3 && read -r _ p3 c3 t3 < <(grep '^start' "$D/a" | sed -n 3p) && r "after kill at run 12s: restart delay=$(echo "$t3 - $k" | bc)s pid=$p3 coal=$(coal "$p3") oldchild=$c2 $(alive "$c2")" || r "no restart within 30s after kill 2"
sleep 3
r "after self-remove: $(grep selfremove "$D/a") guardian=$(alive "$p3") child=$(alive "$c3") job=$(launchctl list | grep -q "$L\$" && echo listed || echo removed)"
sleep 20; r "starts 20s after self-remove: $(starts "$D/a") (3 means no restart)"
# The sweep's case (PO-16): the post office removes the job from outside.
launchctl submit -l "$L2" -- "$D/job.sh" "$D/b" none
waitstart "$D/b" 1; read -r _ q1 d1 _ < <(grep '^start' "$D/b" | sed -n 1p)
r "external remove rc=$(launchctl remove "$L2" 2>&1; echo $?)"; sleep 3
r "after external remove: guardian=$(alive "$q1") child=$(alive "$d1") job=$(launchctl list | grep -q "$L2\$" && echo listed || echo removed)"
sleep 20; r "starts 20s after external remove: $(starts "$D/b") (1 means no restart)"
for p in $(pgrep -f "$D/job.sh"); do kill -9 "$p"; done; pkill -f "sleep 600" || true
