#!/bin/bash
# Build d3sup.c dynamically and with -static, then print what each binary needs from the machine it runs on.
# usage: binfacts.sh <scratch-dir>      (run inside WSL; writes only into <scratch-dir>)
export PATH=/usr/local/bin:/usr/bin:/bin
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
d=${1:?usage: binfacts.sh <scratch-dir>}
mkdir -p "$d"

highest() { objdump -T "$1" 2>/dev/null | grep -o 'GLIBC_[0-9][0-9.]*' | sort -uV | tail -1; }
ms() { echo $(((${2/[.,]/} - ${1/[.,]/}) / 1000)); }

echo "== this machine"
echo "uname:   $(uname -srm)"
echo "glibc:   $(ldd --version | head -1)"
echo "gcc:     $(gcc --version | head -1)"

t0=$EPOCHREALTIME; gcc -O2 -Wall -Wextra -o "$d/d3sup-dynamic" "$here/d3sup.c"; t1=$EPOCHREALTIME
gcc -O2 -Wall -Wextra -static -o "$d/d3sup-static" "$here/d3sup.c"; t2=$EPOCHREALTIME
echo "compile time on first use (option A): dynamic $(ms "$t0" "$t1") ms, -static $(ms "$t1" "$t2") ms"

for kind in dynamic static; do
  f=$d/d3sup-$kind
  echo
  echo "== d3sup-$kind  (gcc -O2$([[ $kind == static ]] && echo ' -static') d3sup.c)"
  echo "size:        $(stat -c %s "$f") bytes ($(strip -o "$d/stripped-$kind" "$f" && stat -c %s "$d/stripped-$kind") stripped)"
  echo "ldd:"
  ldd "$f" 2>&1 | sed 's/^/    /'
  echo "objdump -T | grep GLIBC_:"
  objdump -T "$f" 2>&1 | grep GLIBC_ | sed 's/^/    /'
  echo "highest GLIBC_x.y needed: $(highest "$f")"
  echo "program interpreter:      $(readelf -l "$f" | grep -o 'Requesting program interpreter: [^]]*' || echo none)"
  echo "ELF type / kernel ABI:    $(readelf -h "$f" | awk '/Type:/ {print $2}') / $(readelf -n "$f" | grep -A1 'ABI' | grep -o 'OS: [^,]*, ABI: [0-9.]*' | head -1)"
  echo "runs (check):             $("$f" check 2>&1) exit=$?"
  echo "runs with empty env:      $(env -i "$f" check 2>&1) exit=$?"
  echo "runs (run -- /bin/true):  $("$f" run -- /bin/true 2>&1 | tr '\n' ' ') exit=${PIPESTATUS[0]}"
done

echo
echo "== how the glibc floor moves (dynamic builds on this machine)"
printf 'int main(void){return 0;}\n' >"$d/empty.c"
gcc -O2 -o "$d/empty" "$d/empty.c"
gcc -O2 -D_GNU_SOURCE -o "$d/d3sup-gnu-source" "$here/d3sup.c"
echo "int main(){return 0;}            -> $(highest "$d/empty")   (floor of any dynamic binary built here)"
echo "d3sup.c as shipped               -> $(highest "$d/d3sup-dynamic")"
echo "d3sup.c with -D_GNU_SOURCE       -> $(highest "$d/d3sup-gnu-source")   ($(objdump -T "$d/d3sup-gnu-source" | grep -o '__isoc23_[a-z]*' | sort -u | tr '\n' ' '))"

echo
echo "== run in an empty root (unprivileged user namespace + chroot, no sudo): does the binary need anything installed?"
r=$d/emptyroot
mkdir -p "$r"
cp "$d/d3sup-static" "$d/d3sup-dynamic" "$r/"
for kind in static dynamic; do
  out=$(unshare --user --map-root-user /usr/sbin/chroot "$r" "/d3sup-$kind" check 2>&1); rc=$?
  echo "d3sup-$kind in empty root: exit=$rc  $out"
done

echo
echo "== what a first-use compile (option A) needs on this machine"
for t in cc1 collect2; do echo "$t -> $(gcc -print-prog-name=$t)"; done
echo "as -> $(command -v as), ld -> $(command -v ld)"
files="$(gcc -print-prog-name=cc1) $(gcc -print-prog-name=collect2) $(readlink -f "$(command -v gcc)") $(readlink -f "$(command -v as)") $(readlink -f "$(command -v ld)") /usr/include/stdio.h /usr/include/x86_64-linux-gnu/sys/prctl.h /usr/include/linux/prctl.h /usr/lib/x86_64-linux-gnu/libc.a /usr/lib/x86_64-linux-gnu/crt1.o $(gcc -print-file-name=crtbegin.o) $(gcc -print-file-name=libgcc.a)"
for pk in $(dpkg -S $files 2>/dev/null | sed 's/: .*//; s/:.*//' | sort -u); do dpkg-query -W -f='${Package} ${Installed-Size}\n' "$pk" 2>/dev/null; done |
  awk '{printf "    %-34s %7d KiB\n", $1, $2; s += $2} END {printf "    %-34s %7d KiB (%.0f MiB)\n", "TOTAL installed", s, s / 1024}'
