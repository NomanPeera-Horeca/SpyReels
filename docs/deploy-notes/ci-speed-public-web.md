# public-web CI speed (before / after)

Measured from successful GitHub Actions runs on 2026-10-10.

## Before (monolithic `qa`)

Single job in Playwright Docker: typecheck → content-spec → build → e2e → FAQ → text-wrap → SEO → visual.

| Workflow / job | Wall time | Notes |
|---|---:|---|
| **public-web / qa** | **~2.8–2.9 min** (170–175s) | Required gate; always full path |
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

Baseline updates required `workflow_dispatch` → download artifact → manual commit (extra round trip).

Source runs: [public-web 38087099442](https://github.com/NomanPeera-Horeca/SpyReels/actions/runs/38087099442), [CI 38087099448](https://github.com/NomanPeera-Horeca/SpyReels/actions/runs/38087099448), [App CI 38087099431](https://github.com/NomanPeera-Horeca/SpyReels/actions/runs/38087099431).

## After (PR #106)

Source run: [public-web 38088505177](https://github.com/NomanPeera-Horeca/SpyReels/actions/runs/38088505177) (UI path change; visuals on).

| Job | Wall time | Role |
|---|---:|---|
| **fast** | **35s** (also saw 49–58s) | typecheck, content-spec, build, SEO; ubuntu + pnpm cache |
| changes | 9s | UI / `update-baselines` label gate |
| e2e | 1m53s | Reuses `.next`; Playwright Chromium cache hit |
| visual (1/2) | 1m53s | Docker; parallel shard |
| visual (2/2) | 1m50s | Docker; parallel shard |
| qa | 3s | Aggregate required check |
| **Workflow wall (UI change)** | **~2m40s** | fast ∥ changes → e2e ∥ visual → qa |

### Fast lane step breakdown (35s run)

| Step | Time |
|---|---:|
| Checkout + pnpm/node setup | ~9s |
| Install (cached) | 2s |
| Typecheck | 3s |
| content-spec | 1s |
| Build | 10s |
| Upload `.next` | 3s |
| SEO contract | 3s |

### Wins

- **Fast feedback ≤3 min:** 35–58s for typecheck + unit/content-spec + SEO (was buried until ~2.8 min).
- **Visuals conditional:** skipped when only SEO/content-spec/docs change (path filter).
- **Caches:** pnpm store (host + container), Playwright Chromium on e2e.
- **Baselines:** PR label `update-baselines` commits Linux snapshots in-run (no dispatch round trip).
