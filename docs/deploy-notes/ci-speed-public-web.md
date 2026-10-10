# public-web CI speed (before / after)

Measured from successful GitHub Actions runs on 2026-10-10 (PR #104 window).

## Before (monolithic `qa`)

Single job in Playwright Docker: typecheck → content-spec → build → e2e → FAQ → text-wrap → SEO → visual.

| Workflow / job | Wall time | Notes |
|---|---:|---|
| **public-web / qa** | **~2.8–2.9 min** (170–175s) | Required gate |
| └ Initialize containers | ~37–48s | Playwright image pull/start |
| └ Install deps | ~7s | No explicit pnpm store cache in container |
| └ Typecheck | ~4–7s | |
| └ content-spec | <1s | |
| └ Build | ~13–17s | |
| └ E2E (non-visual) | ~50–52s | |
| └ FAQ + text-wrap | ~10–12s | |
| └ SEO contract | ~2–3s | |
| └ Visual (Linux) | ~22–26s | Serial, workers=1 |
| **CI** (root typecheck+test) | ~3.2–3.7 min | Separate workflow |
| **SpyReels App CI** | ~2.5–4.1 min | Separate workflow |

Feedback for copy/SEO-only changes still paid the full visual + e2e Docker path. Baseline updates required `workflow_dispatch` → download artifact → manual commit (extra round trip).

## After (this change)

| Job | When | Expected wall time | Role |
|---|---|---:|---|
| **fast** | Every public-web change | **≤3 min** (est. ~1–1.5 min warm) | typecheck, content-spec, build, SEO; ubuntu + pnpm cache; no Playwright container |
| **e2e** | After fast | ~1.5–2.5 min (est.) | Reuses `.next` artifact; Chromium cache |
| **visual** | UI paths only, 2 shards | ~1.5–2.5 min wall (parallel shards) | Docker pixels; skipped for SEO/content-only |
| **update-baselines** | Label `update-baselines` | ~3–4 min | Update + verify + commit on PR branch |
| **qa** | Aggregate | <30s | Keeps required check name `public-web / qa` |

Fill in measured after timings from the PR checks once green:

| Job | Run URL | Duration |
|---|---|---:|
| fast | _pending_ | |
| e2e | _pending_ | |
| visual | _pending_ | |
| qa (gate) | _pending_ | |
