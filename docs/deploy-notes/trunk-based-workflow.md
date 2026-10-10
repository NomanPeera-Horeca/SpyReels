# Trunk-based workflow (SpyReels)

Production deploys only from **`main`**.

## Rules

1. **Short-lived branches only.** Cut a branch from `main`, ship in **1 to 2 days**, then open a PR into `main`.
2. **All required checks green before merge.** At minimum: SpyReels App CI, public-web qa (when `public-web/**` or related CI changes), and Public Web Pilot when pilot/proxy/shared ownership files change.
3. **Never deploy a feature branch** to Render (SpyReels web or spyreels-public-web). Point both services at `main` with Auto-Deploy **After CI Checks Pass**.
4. **Production jobs (cron / one-off) run only on Render from `main`.** Never run production refresh, seed, or scrape scripts locally against production credentials.
5. Prefer merge commits (or an explicit squash) that keep reviewable history; do not leave long-running integration branches as the deploy source.

## Render services

| Service | Deploy branch | Auto-Deploy |
|---|---|---|
| SpyReels web | `main` | After CI Checks Pass |
| spyreels-public-web | `main` | After CI Checks Pass |

After merging to `main`, confirm the deploy SHA matches `origin/main` (public-web: `GET /health` → `gitCommit`).

### public-web CI + After CI Checks Pass

Require the aggregate check **`public-web / qa`** (not individual `fast` / `e2e` / `visual` shards).

- The `qa` job uses `if: always()` and treats `visual` / `update-baselines` results of `success` **or** `skipped` as pass.
- Render counts GitHub check conclusions `success`, `neutral`, and `skipped` as passing for Auto-Deploy After CI Checks Pass ([Render deploys docs](https://render.com/docs/deploys)). Skipped visuals therefore do not block deploy.
- Do not require shard check names like `visual (1/2)` in branch protection or Render.

## Reminder

Delete merged feature branches after one stable day in production.
