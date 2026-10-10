# Featured demo catalog (PR A)

Platform-agnostic demo catalog for logged-out finder previews. **TikTok + YouTube** are stored in `featured_demo_accounts` / `featured_demo_items`. Instagram stays on `featured_accounts` / `featured_reels` until T11.

Visitor `publicDemo` (PR B) must be a DB read only. This job is the only place that scrapes and writes R2 thumbs for demo cards.

## Migration

Apply via Railway MySQL console (Bug #63), or Railway CLI `railway connect MySQL` with that file only. Do not `drizzle-kit push`.

1. `drizzle/0100_featured_demo_catalog.sql` — create `featured_demo_accounts` / `featured_demo_items`
2. `drizzle/0101_featured_demo_bigint_counts.sql` — widen engagement counters to `BIGINT` (views can exceed signed INT max)

### Production apply log (for "all migrations applied" checks)

| Migration | Environment | Applied at (UTC) | Applied by | Method | Notes |
|---|---|---|---|---|---|
| `drizzle/0100_featured_demo_catalog.sql` | SpyReels production MySQL (`respectful-rejoicing` / service `MySQL`) | 2026-10-10 ~20:50 UTC | Cursor agent (Noman-approved) via Railway CLI | `railway connect MySQL --no-ssh < 0100_featured_demo_catalog.sql` once | Additive only: created `featured_demo_accounts` + `featured_demo_items` + indexes. Verified with `SHOW TABLES LIKE 'featured_demo_%'` and `SHOW CREATE TABLE`. |
| `drizzle/0101_featured_demo_bigint_counts.sql` | SpyReels production MySQL (`respectful-rejoicing` / service `MySQL`) | 2026-10-10 ~21:12 UTC | Cursor agent (Noman-approved) via Railway CLI | `railway connect MySQL --no-ssh < 0101_featured_demo_bigint_counts.sql` once | Widened `viewCount`/`likeCount`/`commentCount`/`shareCount` to `BIGINT`. Verified with `SHOW COLUMNS`. |

## Production jobs (Render only)

**NEVER** run `pnpm featured-demo:refresh` (or any featured-demo seed/scrape) locally against production. Production jobs run ONLY as Render one-off or cron jobs on the SpyReels web service, using code deployed from `main`. Do not put production `DATABASE_URL` / R2 / ScrapeCreators secrets in local `.env` files.

## Cron (same model as viral-posts pool refresh)

Dedicated Render Cron Job (not the web dyno). Create after the R2-only refresh path is on `main`.

- Schedule: daily (`0 6 * * *` UTC)
- Start command: `pnpm featured-demo:refresh`
- Service: SpyReels web (`srv-d79bfrshg0os73e4lo1g`), branch `main`
- Env: same `DATABASE_URL`, ScrapeCreators, and Cloudflare R2 group as production web
- Success contract: every stored item has an R2 `featured-demo-thumbs/` URL (never persist CDN/HEIC)

One-shot seed / re-seed (Render Dashboard → SpyReels → Jobs → one-off, or `render jobs create`):

```bash
# On Render only, against the main deploy:
pnpm featured-demo:refresh
```

Confirm each allow-listed active handle has rows + R2 `thumbnailUrl` values under `featured-demo-thumbs/`.

## Allow-listed handles

| Platform | Handles |
|---|---|
| TikTok | `charlidamelio`, `khaby.lame`, `mrbeast` |
| YouTube | `mrbeast`, `mkbhd`, `aliabdaal` |

Inactive (takedown, keep rows): TikTok `zachking`, YouTube `souravjoshivlogs` (`isActive=0`).

Cap: **8** items per handle. Thumbs: JPEG/webp source preferred (skip HEIC when possible), ~480px webp on R2 under `featured-demo-thumbs/`. Mirror failure must **not** store CDN URLs; keep last-good R2 for that item or skip it. A handle refresh counts as success only when every stored item has an R2 thumb. `durationSec` is integer seconds (round in the job).

## Takedown (`isActive`)

To hide a demo handle **immediately** from visitors (after PR B wires DB-only `publicDemo`):

```sql
UPDATE featured_demo_accounts
SET isActive = 0
WHERE platform = 'tiktok' AND handle = 'example';
```

Effects:

1. `publicDemo` must not return that handle (PR B contract).
2. The daily refresh job **skips** inactive handles (no scrape, items left untouched).
3. Re-enable with `isActive = 1` then run `pnpm featured-demo:refresh` if data is stale.

Document any production takedown in the incident note.

## Stale policy

- Visitors always receive **last-good** items when a refresh fails or returns empty.
- Telegram alert (`featured_demo_stale`) if an **active** allow-listed handle has no `lastSuccessAt` within **3 days**.
- Per-handle scrape failures also alert (`featured_demo_refresh`).

## Rollback

PR A only adds schema + job. No visitor path change. Rollback = stop the cron and/or revert the PR. Tables can remain.

## Follow-ups

- **PR B:** flip TikTok + YouTube `publicDemo` to DB read; short timeout; latency logging / p95 alert (this branch).
- **PR C:** Figma Result Card Loading skeleton (Comfortable + Compact).
- **T11:** migrate Instagram featured demo onto this catalog.
