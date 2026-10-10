#!/bin/bash
set -euo pipefail
cd /Users/nomanpeera/Desktop/reels-dashboard/public-web
LOG=/tmp/spyreels-visual-phase2.log
exec >"$LOG" 2>&1

echo "=== phase2 visual start $(date) ==="
curl -sf --max-time 5 http://127.0.0.1:3100/health || {
  echo "starting next on 3100"
  pkill -f "next start -H 127.0.0.1 -p 3100" 2>/dev/null || true
  sleep 1
  HOSTNAME=127.0.0.1 pnpm exec next start -H 127.0.0.1 -p 3100 >/tmp/spyreels-public-web-visual.log 2>&1 &
  for i in $(seq 1 40); do
    curl -sf --max-time 2 http://127.0.0.1:3100/health && break
    sleep 0.5
  done
}
echo
echo "health ok"

unset PLAYWRIGHT_BROWSERS_PATH
export PLAYWRIGHT_VISUAL=1

echo "=== update snapshots ==="
pnpm test:visual:update
echo "update_exit=$?"

echo "=== stability run 1 ==="
pnpm test:visual
echo "run1_exit=$?"

echo "=== stability run 2 ==="
pnpm test:visual
echo "run2_exit=$?"

echo "=== stability run 3 ==="
pnpm test:visual
echo "run3_exit=$?"

echo "=== baselines ==="
find e2e -name '*.png' | sort

echo "=== phase2 visual done $(date) ==="
