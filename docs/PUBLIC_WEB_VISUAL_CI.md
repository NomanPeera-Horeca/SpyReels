# Public-web visual CI

Safety net for `public-web`, split for speed:

| Job | When | What |
|---|---|---|
| `fast` | Every public-web push/PR | typecheck, content-spec (unit), build, SEO contract (target ≤3 min) |
| `e2e` | After `fast` | Playwright e2e, `faq.spec`, marketing text wrap (pnpm + Chromium cache) |
| `visual` | Only when UI files change | Linux visual baselines, sharded 1/2 + 2/2 in Playwright Docker |
| `update-baselines` | PR label `update-baselines` (preferred); dispatch = artifact-only fallback | Regenerate `*-linux.png` (PR: commit to branch) |
| `qa` | Always (aggregate) | Merge gate; required check name stays `public-web / qa` (skipped visuals count as pass) |

## Recommendation: Docker = source of truth for pixels

Use the **official Playwright Docker image** for visual baselines (local + CI):

- Image: `mcr.microsoft.com/playwright:v1.63.0-jammy` (matches `@playwright/test` in `public-web/package.json`)
- Snapshots: `e2e/visual.spec.ts-snapshots/*-linux.png`
- Workflow: `.github/workflows/public-web.yml` (jobs `visual` / `update-baselines`)

Keep macOS `*-darwin.png` baselines for optional local Chrome runs (`pnpm test:visual`). They are **not** what CI compares. Prefer Docker whenever you change UI pixels so local and CI match.

## Update Linux baselines in a PR (preferred)

1. Open/update the PR that changes UI.
2. Add the label **`update-baselines`**.
3. CI job `update-baselines` regenerates `*-linux.png`, verifies them, commits to the PR branch, and removes the label.

Note: pushes that use `GITHUB_TOKEN` do not start a new workflow run. Verification runs in the same job before the commit.

### Local Docker

```bash
pnpm test:visual:update:docker
```

Commit the new/updated `*-linux.png` files.

### workflow_dispatch (artifact only; prefer label instead)

Use only if the PR label path is unavailable. Otherwise add **`update-baselines`** on the PR.

1. GitHub → Actions → **public-web** → Run workflow
2. Enable **update_visual_baselines**
3. Download artifact `public-web-visual-baselines-linux-<run_id>`
4. Copy `*-linux.png` into `public-web/e2e/visual.spec.ts-snapshots/`
5. Commit

## Local compare (same as CI)

```bash
cd public-web
pnpm test:visual:docker
```

## Local macOS Chrome (optional)

Server on `:3100`, then:

```bash
pnpm test:visual
pnpm test:visual:update   # writes *-darwin.png only
```

## Merge gate

Branch protection should require status check:

`public-web / qa`

On failure, download artifacts:

- `public-web-e2e-artifacts-<run_id>`
- `public-web-visual-artifacts-<run_id>-shard-*` (`test-results/` includes expected / actual / diff PNGs)
