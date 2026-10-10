#!/usr/bin/env bash
# Run Playwright visual tests (or update baselines) inside the official
# Playwright Docker image. Same image as GitHub Actions CI.
#
# Usage (from public-web):
#   pnpm test:visual:docker
#   pnpm test:visual:update:docker
#
# Requires Docker Desktop (or compatible).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_WEB="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODE="${1:-test}"

PLAYWRIGHT_VERSION="$(
  node -e "console.log(require('${PUBLIC_WEB}/package.json').devDependencies['@playwright/test'])"
)"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for Linux visual baselines (same as CI)."
  echo "Install Docker Desktop, then re-run this command."
  echo "Or use GitHub Actions: workflow_dispatch on public-web with update_visual_baselines=true."
  exit 1
fi

PLAYWRIGHT_CMD="pnpm exec playwright test e2e/visual.spec.ts --project=desktop-1440 --project=mobile-390"
if [[ "${MODE}" == "update" ]]; then
  PLAYWRIGHT_CMD="${PLAYWRIGHT_CMD} --update-snapshots"
fi

echo "Using image: ${IMAGE}"
echo "Mode: ${MODE}"

docker run --rm \
  --ipc=host \
  -v "${PUBLIC_WEB}:/work" \
  -w /work \
  -e CI=1 \
  -e PLAYWRIGHT_VISUAL=1 \
  -e PLAYWRIGHT_USE_SYSTEM_CHROME=0 \
  -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 \
  -e PLAYWRIGHT_CMD="${PLAYWRIGHT_CMD}" \
  "${IMAGE}" \
  /bin/bash -lc '
    set -euo pipefail
    corepack enable
    corepack prepare pnpm@10.4.1 --activate
    pnpm install --frozen-lockfile
    pnpm check
    pnpm build
    pnpm exec next start -p 3100 > /tmp/public-web.log 2>&1 &
    for i in $(seq 1 60); do
      if curl -fsS http://127.0.0.1:3100/health >/dev/null; then
        break
      fi
      sleep 1
    done
    curl -fsS http://127.0.0.1:3100/health >/dev/null
    eval "${PLAYWRIGHT_CMD}"
  '
