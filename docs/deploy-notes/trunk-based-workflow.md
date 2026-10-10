# Trunk-based workflow (SpyReels)

Production deploys only from **`main`**.

## Rules

1. **Short-lived branches only.** Cut a branch from `main`, ship in **1 to 2 days**, then open a PR into `main`.
2. **All required checks green before merge.** At minimum: SpyReels App CI, public-web qa (when `public-web/**` or related CI changes), and Public Web Pilot when pilot/proxy/shared ownership files change.
3. **Never deploy a feature branch** to Render (SpyReels web or spyreels-public-web). Point both services at `main` with Auto-Deploy **After CI Checks Pass**.
4. Prefer merge commits (or an explicit squash) that keep reviewable history; do not leave long-running integration branches as the deploy source.

## Render services

| Service | Deploy branch | Auto-Deploy |
|---|---|---|
| SpyReels web | `main` | After CI Checks Pass |
| spyreels-public-web | `main` | After CI Checks Pass |

After merging to `main`, confirm the deploy SHA matches `origin/main` (public-web: `GET /health` → `gitCommit`).

## Reminder

Delete merged feature branches after one stable day in production.
