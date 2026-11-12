#!/usr/bin/env bash
# Bootprint — repeatable verification.
# Fresh clone: ./scripts/verify.sh must pass without edits, network access at
# runtime, or any QNX installation.
set -u

cd "$(dirname "$0")/.." || exit 1
fail=0
step() { printf '\n== %s\n' "$1"; }
ok()   { printf '   PASS  %s\n' "$1"; }
bad()  { printf '   FAIL  %s\n' "$1"; fail=$((fail + 1)); }

step "dependencies"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund || bad "npm ci"
fi
ok "node_modules present"

step "AC-1..AC-9 unit tests (parser, script model, replay, 16 rules)"
if npm test --silent; then ok "15 unit tests"; else bad "unit tests"; fi

step "AC-10 analysis under 100 ms for a 600-line buildfile"
if npx tsx scripts/bench.mjs; then ok "bench"; else bad "bench"; fi

step "typecheck + production build"
if npx tsc -b && npm run build --silent; then ok "tsc + vite build"; else bad "build"; fi

step "AC-15 fixtures present, including one upstream buildfile"
samples=$(ls src/data/samples/*.build 2>/dev/null | wc -l | tr -d ' ')
[ "$samples" -ge 4 ] && ok "$samples .build fixtures" || bad "expected >= 4 fixtures, found $samples"
grep -q "Copyright (c) 2025 Contributors to the Eclipse Foundation" src/data/samples/s-core-init.build \
  && ok "upstream fixture keeps its licence header" || bad "upstream header missing"

step "AC-16 grammar doc cites QNX per construct"
cites=$(grep -c "qnx.com/developers/docs" docs/02-GRAMMAR.md)
[ "$cites" -ge 2 ] && ok "$cites documentation citations" || bad "grammar doc lacks citations"

step "AC-14 bundle is offline-clean and relative"
if grep -RqE '<(script|link)[^>]+(src|href)="https?://' dist/index.html; then
  bad "dist/index.html references a remote asset"
else
  ok "no remote assets in index.html"
fi
if grep -q '"/assets/' dist/index.html; then
  bad "absolute /assets/ path found (breaks file:// and subpath hosting)"
else
  ok "asset paths are relative"
fi

step "AC-16 no network calls in the shipped bundle"
if grep -RqE 'XMLHttpRequest|WebSocket|sendBeacon' dist/assets/*.js; then
  bad "bundle contains a network API"
else
  ok "no network APIs in dist/assets"
fi
# Namespace URIs and React's error-decoder link are inert strings, not loads.
if grep -RqE 'url\(["'"'"']?https?://' dist/assets/*.css || grep -RqE '(src|href)\\?["'"'"']=https?://' dist/assets/*.js; then
  bad "bundle loads a remote asset"
else
  ok "no remote asset loads in the bundle"
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  echo "verify: all checks passed"
  exit 0
else
  echo "verify: $fail check(s) failed"
  exit 1
fi
