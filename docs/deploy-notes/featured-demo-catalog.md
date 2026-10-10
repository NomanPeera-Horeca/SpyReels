# Featured demo catalog (PR A)

Platform-agnostic demo catalog for logged-out finder previews. **TikTok + YouTube** are stored in `featured_demo_accounts` / `featured_demo_items`. Instagram stays on `featured_accounts` / `featured_reels` until T11.

Visitor `publicDemo` (PR B) must be a DB read only. This job is the only place that scrapes and writes R2 thumbs for demo cards.

## Migration

Apply `drizzle/0100_featured_demo_catalog.sql` via Railway MySQL console (Bug #63), or Railway CLI `railway connect MySQL` with that file only. Do not `drizzle-kit push`.

### Production apply log (for "all migrations applied" checks)

| Migration | Environment | Applied at (UTC) | Applied by | Method | Notes |
|---|---|---|---|---|---|
| `drizzle/0100_featured_demo_catalog.sql` | SpyReels production MySQL (`respectful-rejoicing` / service `MySQL`) | 2026-10-10 ~20:50 UTC | Cursor agent (Noman-approved) via Railway CLI | `railway connect MySQL --no-ssh < 0100_featured_demo_catalog.sql` once | Additive only: created `featured_demo_accounts` + `featured_demo_items` + indexes. Verified with `SHOW TABLES LIKE 'featured_demo_%'` and `SHOW CREATE TABLE`. |

## Cron (same model as viral-posts pool refresh)

Preferred: dedicated Render Cron Job (or existing scheduled-worker pattern), not the web dyno.

- Schedule: daily (`0 6 * * *` UTC suggested)
- Start command: `pnpm featured-demo:refresh`
- Env: same `DATABASE_URL`, ScrapeCreators, and Cloudflare R2 group as production web
- Branch / release commit: same as production (`main` after merge)

One-shot seed before flipping visitor endpoints (PR B):

```bash
pnpm featured-demo:refresh
```

Confirm each allow-listed handle has rows + R2 `thumbnailUrl` values under `featured-demo-thumbs/`.

## Allow-listed handles

| Platform | Handles |
|---|---|
| TikTok | `charlidamelio`, `khaby.lame`, `zachking`, `mrbeast` |
| YouTube | `mrbeast`, `mkbhd`, `aliabdaal`, `souravjoshivlogs` |

Cap: **8** items per handle. Thumbs: ~480px wide, webp (jpeg fallback), stored during the job only.

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

- **PR B:** flip TikTok + YouTube `publicDemo` to DB read; short timeout; latency logging / p95 alert.
- **PR C:** Figma Result Card Loading skeleton (Comfortable + Compact).
- **T11:** migrate Instagram featured demo onto this catalog.
