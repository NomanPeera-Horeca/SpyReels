# Viral Posts pool refresh (Phase 3A production)

## Architecture

Candidate discovery and user feed assembly are separate:

1. **Shared pool refresh** (background worker/cron) calls ScrapeCreators with a hard budget, upserts `viral_post_candidates`, and links them into niche/pillar pools.
2. **User feed assembly** reads stored pool candidates, scores/diversifies for the user, and persists feeds. It makes **zero** provider calls.

## Production execution model (required)

Do **not** run the process-local refresher on production web replicas.

### Preferred: dedicated worker or external cron

```bash
# Railway / cron / one-off worker (every 2–4 hours)
pnpm exec tsx scripts/viral-posts-refresh-pools.ts
```

Optional env:

| Env | Default | Meaning |
|---|---|---|
| `VIRAL_POSTS_REFRESH_LIMIT` | `3` | Max pools per run |
| `VIRAL_POSTS_WORKER_ID` | `hostname:pid:rand` | Lease owner identity |

Suggested schedule: every 2–4 hours. Do not enqueue missed ticks.

### Multi-instance safety (DB lease)

Each pool refresh acquires a row lease on `viral_post_pools`:

- Columns: `refreshLeaseOwner`, `refreshLeaseUntil` (TTL default 10 minutes)
- Acquire: atomic `UPDATE` only when lease is null, expired, or already owned by this worker
- Release: clear lease in `finally`
- Crash: expired lease is stealable; no permanent deadlock

Logs: `lock_acquire`, `lock_skip`, `lock_release`, `refresh_start`, `refresh_done`.

In-memory flags alone are **not** used for production correctness.

## Process-local refresher (local development only)

Opt-in with an **explicit** setting:

```bash
VIRAL_POSTS_POOL_REFRESHER=true
VIRAL_POSTS_POOL_REFRESH_MS=10800000
```

Blank or `false` disables the in-process interval (recommended for staging/production web).

Even when enabled locally, DB leases still prevent duplicate refreshes if two processes run.

## Budgets (`server/viralPosts/constants.ts`)

- Per refresh: max **35** ScrapeCreators calls
- Routine refresh: hashtag-only (no profile drilling)
- Early stop around **40** scored candidates
- Per pool per UTC day: **60** calls
- Skip refresh when pool already has **40+** fresh candidates (72h)

## Environment matrix

| Variable | Local | Staging | Prod web | Prod worker/cron |
|---|---|---|---|---|
| `VIRAL_POSTS_LIVE` | `true` | `true` | `true` | `true` |
| `VIRAL_POSTS_INSTAGRAM_ENABLED` | `true` | `true` | `true` | `true` |
| `VIRAL_POSTS_TIKTOK_ENABLED` | `true` | `true` | `true` | `true` |
| `VIRAL_POSTS_YOUTUBE_ENABLED` | `true` | `true` | `true` | `true` |
| `VIRAL_POSTS_POOL_REFRESHER` | `true` | `false` | `false` | `false` |
| `VIRAL_POSTS_POOL_REFRESH_MS` | `10800000` | unused | unused | unused |
| `VIRAL_POSTS_DB_DEBUG` | `false` | `false` | `false` | `false` |
| `VIRAL_POSTS_WORKER_ID` | optional | optional | unused | set unique id |

Unset `VIRAL_POSTS_LIVE` in production is treated as **false** (with a warning). Prefer explicit `true`/`false` everywhere.

## Multi-platform seed pools (TikTok / YouTube)

Instagram pools still use hashtag discovery. TikTok and YouTube pools use curated handles in `viral_post_seed_creators` (migration `0089_viral_post_seed_creators.sql`).

- Pool key shape: `tiktok:{niche}:seed-mix:en` / `youtube:{niche}:seed-mix:en`
- Per refresh: up to **4** handles × ~**3** SC calls, **8** videos per handle
- Seed pool daily budget: **30** calls; min fresh: **12**
- YouTube candidates have no MP4; UI opens on YouTube
- TikTok play uses CDN URL + `tiktokScrape.refreshVideoUrl` with `videoPageUrl`

Feed assembly loads Instagram pillar pools plus enabled TT/YT seed pools for the user niche, then applies soft platform diversity.
