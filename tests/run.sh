#!/usr/bin/env bash
# Runs every headless test against a local server (repo root).
# PORT=8905 bash tests/run.sh   — pick a free port when several checkouts run at once.
set -u; cd "$(dirname "$0")/.."
PORT="${PORT:-8901}"; export DA_BASE="http://localhost:$PORT"
fuser -k "$PORT/tcp" >/dev/null 2>&1; (python3 -m http.server "$PORT" >/dev/null 2>&1 &); sleep 1
fail=0
for t in tests/*.mjs; do echo "=== $t"; node "$t" || fail=1; done
exit $fail
