# Public-web visual CI

Safety net for `public-web`: typecheck, build, Playwright e2e, `faq.spec`, and visual baselines.

## Recommendation: Docker = source of truth

Use the **official Playwright Docker image** for visual baselines (local + CI):

- Image: `mcr.microsoft.com/playwright:v1.63.0-jammy` (matches `@playwright/test` in `public-web/package.json`)
- Snapshots: `e2e/visual.spec.ts-snapshots/*-linux.png`
- Workflow: `.github/workflows/public-web.yml` (job `qa`)

Keep macOS `*-darwin.png` baselines for optional local Chrome runs (`pnpm test:visual`). They are **not** what CI compares. Prefer Docker whenever you change UI pixels so local and CI match.

## One-command baseline update (Linux)

With Docker Desktop installed, from `public-web`:

```bash
pnpm test:visual:update:docker
```

Commit the new/updated `*-linux.png` files.

### Without local Docker

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

On failure, download artifact `public-web-qa-artifacts-<run_id>` (`test-results/` includes expected / actual / diff PNGs).
