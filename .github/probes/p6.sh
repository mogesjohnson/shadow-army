#!/bin/bash
# Probe P-6 (spec 2.0 review, #63): does a helper with only an ad-hoc signature,
# installed through npm, run with no Gatekeeper block? Lines starting "P6|" are the results.
set -u
r() { echo "P6|$*"; }
r "spctl-status: $(spctl --status 2>&1)"
r "os: $(sw_vers -productVersion) $(uname -m)"

check() { # $1 label, $2 path, $3 args
  local h="$2"
  r "$1 codesign: $(codesign -dv "$h" 2>&1 | grep -E '^(Signature|Authority|TeamIdentifier|Identifier)' | tr '\n' ';')"
  r "$1 verify: $(codesign --verify -vv "$h" 2>&1 | tr '\n' ';')"
  r "$1 xattr: $(xattr -l "$h" 2>&1 | tr '\n' ';')"
  r "$1 spctl-assess: $(spctl --assess --type execute -vv "$h" 2>&1 | tr '\n' ';')"
  local out; out=$("$h" $3 2>&1); r "$1 run: exit=$? out=$(echo "$out" | head -2 | tr '\n' ';')"
}

W=$(mktemp -d); cd "$W"

# A. Our own helper: clang build, ad-hoc signed, packed and installed as an npm tarball.
mkdir -p pkg/bin app
printf '#include <stdio.h>\nint main(void){puts("P6-HELPER-RAN");return 0;}\n' > hello.c
clang -o pkg/bin/helper hello.c
codesign -s - -f pkg/bin/helper
printf '{"name":"p6-helper","version":"1.0.0","bin":{"p6-helper":"bin/helper"}}\n' > pkg/package.json
(cd pkg && npm pack --silent >/dev/null)
(cd app && npm init -y >/dev/null && npm install --silent ../pkg/p6-helper-1.0.0.tgz)
check "own-tarball" "$W/app/node_modules/p6-helper/bin/helper" ""

# B. A real registry download: esbuild's darwin binary (Go-linked, ad-hoc signed).
mkdir reg && (cd reg && npm init -y >/dev/null && npm install --silent esbuild@0.24.0)
B=$(ls "$W"/reg/node_modules/@esbuild/darwin-*/bin/esbuild | head -1)
check "registry-esbuild" "$B" "--version"

# C. The same helper with a quarantine attribute, as a browser download would carry.
cp "$W/app/node_modules/p6-helper/bin/helper" "$W/helper-q"
xattr -w com.apple.quarantine "0083;$(printf %x "$(date +%s)");Safari;" "$W/helper-q"
check "quarantined" "$W/helper-q" ""

# D. Unsigned (signature removed) through the same tarball path, for contrast.
cp "$W/pkg/bin/helper" "$W/helper-unsigned" && codesign --remove-signature "$W/helper-unsigned"
check "unsigned" "$W/helper-unsigned" ""
r "done"
